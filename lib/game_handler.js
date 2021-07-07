const EventEmitter = require("events");
const entities = require("html-entities").AllHtmlEntities;
// TODO: Deprecate the scheduled option?
// TODO: Separate hangman into a sub-class?

class GameHandler {
  constructor(Trivia) {
    this.Trivia = Trivia;

    this.activeGames = {};
  }

  getActiveGame(id) {
    return this.activeGames[id];
  }
}

// Game class
class Game extends EventEmitter {
  // channelId: The channel ID and unique identifier for the game.
  // groupID; The server ID and unique identifier for the server or group the game takes place in.
  // scheduled: Set to true if starting a game scheduled by the bot.
  //            Keep false if starting on a user's command. (must already have a game initialized to start)
  // difficulty (str): Difficulty as defined by the database. (i.e. "easy", "medium", or "hard")
  // type (str): Question type as defined by the database. (i.e. "multiple", "boolean")

  constructor(GameHandler, channelId, groupID, ownerID, options, gameMode) {
    super();

    this.gameHandler = GameHandler;

    // Trivia object
    this.Trivia = GameHandler.Trivia;

    // Index the game
    GameHandler.activeGames[channelId] = this;

    // Identifiers
    this.ID = channelId; // The channel ID, which is used as the game's unique identifier.
    this.groupID = groupID; // Unique identifier of the group/guild the game belongs to.
    this.ownerID = ownerID; // Unique identifier of the user that started the game.

    // Active info
    this.inProgress = 1;
    this.inRound = 0;

    // Question data
    this.question = {
      isFirst: true,
      difficulty: void 0,
      type: void 0,
      answer: void 0,
      incorrectAnswers: void 0,
      category: void 0,
      answersDisplay: void 0,
      displayCorrectID: void 0
    };

    // Blank if not defined
    this.options = options || {};

    this.gameMode = gameMode;
    this.color = this.Trivia.embedCol;
    this.date = void 0;

    this.roundCount = 0;
    this.emptyRoundCount = 0;

    // User records
    this.inactiveParticipants = {};
    this.totalParticipants = {};
    
    this.activeParticipants = [];

    // Scoring
    this.correctUsers = {};
    this.scores = {};

    // Timeouts and failover start/resume handling
    this.resuming = 0;
    this.timeout = void 0;

    // Odds and ends
    this.isLeagueGame = 0;
  }

  getConfig(val) {
    return this.Trivia.getConfigVal(val, this.ID, this.serverID);
  }

  // endGame
  // Clears the game timeout and deletes the object.
  endGame() {
    if(typeof this.timeout !== "undefined") {
      clearTimeout(this.timeout);
    }

    if(this.isLeagueGame) {
      this.Trivia.leaderboard.writeScores(this.scores, this.guildId, ["Monthly", "Weekly"], this.getConfig("leagueName"));
    }

    delete this.gameHandler.activeGames[this.ID];
  }

  // Check if there is a game running. If there is one, make sure it isn't frozen.
  validateGame() {
    // Checks are skipped entirely for games that are being resumed from cache or file. What could possibly go wrong?
    if(typeof this.groupID === "undefined" || !this.resuming) {
      return;
    }

    if(!this.scheduled && typeof this.timeout !== "undefined" && this.timeout._called === true) {
      // The timeout should never be stuck on 'called' during a round.
      // Dump the game in the console, clear it, and continue.
      console.error(`ERROR: Unscheduled game '${this.id}' timeout appears to be stuck in the 'called' state. Cancelling game...`);
      return;
    }
    else if(typeof this.timeout !== "undefined" && this.timeout._idleTimeout === -1) {
      // The timeout reads -1. (Can occur if clearTimeout is called without deleting.)
      // Dump the game in the console, clear it, and continue.
      console.error(`ERROR: Game '${this.id}' timeout reads -1. Game will be cancelled.`);
      this.endGame();
      return;
    }
    else if(typeof this.answer === "undefined") {
      console.error(`ERROR: Game '${this.id}' is missing information. Game will be cancelled.`);
      this.endGame();
      return;
    }
  }

  // buildHangmanAnswerString
  // Creates an answer string for a hangman game.
  // TODO: Consolidate Trivia.createObscuredAnswer and doHangmanHint
  buildHangmanAnswerString(doHint) {
    var answerString = "";

    var answer = this.question.answer;

    answerString = this.Trivia.createObscuredAnswer(answer, doHint);

    if(this.getConfig("debug-mode")) {
      answerString = `${answerString} *(Answer: ${answer})*`;
    }

    return answerString;
  }

  // buildAnswers
  // Interprets the answers into an array of answers.
  // Creates a string for presentation as a multiple choice question.
  // Assigns the array "answersDisplay" and "correctID" to the question.
  buildAnswers() {
    var answerString = "";
    var answers = [];
    answers = this.question.incorrectAnswers;
    answers.push(this.question.answer);

    // Sort the answers in reverse alphabetical order.
    answers.sort();
    answers.reverse();

    this.question.answersDisplay = answers;

    for(var i = 0; i <= answers.length-1; i++) {
      answers[i] = answers[i].toString();

      if(answers[i] === this.question.answer) {
        this.question.displayCorrectID = i;
      }

      answerString = `${answerString}**${String.fromCharCode(65+i)}:** ${entities.decode(answers[i])}${this.getConfig("debug-mode") && i===this.question.displayCorrectID?" *(Answer)*":""}\n`;
    }

    return answerString;
  }

  // buildInfoString
  // Any information or instructions that will follow the question round.
  buildInfoString() {
    var infoString = "";
    var timer = this.getConfig("round-length");
    if(this.gameMode === 2) {
      // Hangman games get an extra ten seconds for balance.
      timer = timer+10000;
    }

    if(this.roundCount === 0) {
      infoString = "\n";

      if(this.gameMode === 2) {
        infoString = `${infoString}\nType your answer! `;
      }
      else if(this.gameMode !== 1) {
        infoString = `${infoString}Type a letter to answer! `;
      }

      infoString = `${infoString}The answer will be revealed in ${timer/1000} seconds.`;

      // Add an extra initial message to let users know the game will insta-end with no answers.
      if(!this.getConfig("round-end-warnings-disabled") && this.getConfig("rounds-end-after") === 1 && !this.getConfig("customRoundCount")) {
        infoString += "\nThe game will end automatically if nobody participates.";
      }
    }

    return infoString;
  }
  
  async recordStats() {
    if(this.category) {
      // Stat: Rounds played - custom
      global.client.shard.send({stats: { roundsPlayedCustom: 1 }});

      // Stat: Rounds played - this category
      global.client.shard.send( JSON.parse(`{"stats": { "roundsPlayedCat${this.category}": 1 }}`) );

      if(!this.roundCount === 0) {
        // Stat: Games played - custom
        global.client.shard.send({stats: { gamesPlayedCustom: 1 }});

        // Stat: Games played - this category
        global.client.shard.send( JSON.parse(`{"stats": { "gamesPlayedCat${this.category}": 1 }}`) );
      }
    }
    else {
      // Stat: Rounds played - normal
      global.client.shard.send({stats: { roundsPlayedNormal: 1 }});

      if(!this.roundCount === 0) {
        // Stat: Games played - normal
        global.client.shard.send({stats: { gamesPlayedNormal: 1 }});
      }
    }
  }

  // initializeRound
  // Prepares a round - Validates the game, pulls a question, and returns the round info
  // This handles everything we need to send the initial round data -- once this succeeds, call startRound.
  // The time between this and startRound() is the last chance to cancel the game without consequence if the initial message fails to send for any reason.
  async initializeRound() {
    this.validateGame(this.scheduled);
    this.activeParticipants = {};
    this.correctUsers = {};

    var question, answers = [], difficultyReceived;
    try {
      question = await this.Trivia.getTriviaQuestion(0, this.channelId, 0, this.question.isFirst, this.options.category, this.options.type, this.options.difficulty);
      // Stringify the answers in the try loop so we catch it if anything is wrong.
      answers[0] = question.correct_answer.toString();
      answers = answers.concat(question.incorrect_answers);
      difficultyReceived = question.difficulty.toString();

      this.question.incorrectAnswers;
      question.correct_answer = question.correct_answer.toString();
    } catch(err) {
      // Maintenance messages can be specified in extenuating situations.
      // Check for one to display. If none exists, dump the error itself.
      if(typeof this.Trivia.maintenanceMsg === "string") {
        this.emit("error", this.Trivia.maintenanceMsg);
      }
      else {
        this.emit("error", err);
      }

      this.endGame();
      return;
    }

    // Initialize with the question data.
    this.question = {
      isFirst: true,
      difficulty: question.difficulty,
      type: question.type,
      answer: entities.decode(question.correct_answer),
      incorrectAnswers: question.incorrect_answers,
      correctId: void 0,
      category: entities.decode(question.category)
    };
    
    this.date = new Date();
    this.inRound = true;

    // Parse the game type and difficulty
    this.question.isTrueFalse = question.incorrect_answers.length === 1;
    if(!this.getConfig("hide-difficulty")) {
      switch(difficultyReceived) {
        case "easy":
          this.color = 4249664;
          break;
        case "medium":
          this.color = 12632064;
          break;
        case "hard":
          this.color = 14164000;
          break;
      }
    }
    var categoryString = entities.decode(question.category);

    // String handling
    var answerString = this.buildAnswers();
    if(this.gameMode === 2) {
      answerString = this.buildHangmanAnswerString();
    }

    var infoString = this.buildInfoString();

    var finalString = `*${categoryString}*\n**${entities.decode(question.question)}**\n${answerString}${infoString}`;

    return finalString;
  }

  async startRound() {
    this.recordStats();

  }
}

module.exports = { GameHandler, Game };
