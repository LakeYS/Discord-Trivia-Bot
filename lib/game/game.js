const EventEmitter = require("events");
const entities = require("html-entities").AllHtmlEntities;
const GameStrings = require("./game_strings.js");

// Game class
class Game extends EventEmitter {
  // channelId: The channel ID and unique identifier for the game.
  // groupID; The server ID and unique identifier for the server or group the game takes place in.
  // options (obj): 
  //  difficulty (str): Difficulty as defined by the database. (i.e. "easy", "medium", or "hard")
  //  type (str): Question type as defined by the database. (i.e. "multiple", "boolean")
  //  category (int): Category ID as defined by the database.

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
    this.roundID = null; // Unique identifier for the round. Usually the ID of the message. This is only set externally, post-round init.

    // Active info
    this.inProgress = true;
    this.inRound = false;
    this.cancelled = false;
    this.isEmptyRound = false;

    // Functions
    this.formatStr = this.Trivia.formatStr;
    this.gameStrings = new GameStrings();

    // Question data
    this.question = {
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

    if(typeof gameMode === "undefined") {
      this.gameMode = "standard";
    }
    else {
      this.gameMode = gameMode;
    }
    
    this.color = this.Trivia.embedCol;
    this.date = void 0;

    // roundCount and emptyRoundCount - Incremented at the end of each round.
    this.roundCount = 0;
    this.emptyRoundCount = 0;

    // User records
    this.usersTotal = {};
    this.usersActive = [];
    
    // Scoring
    this.usersCorrect = {};
    this.scores = {};

    // Timeouts and failover start/resume handling
    this.resuming = false;
    this.timeout = void 0;

    GameHandler.emit("game_create", this);
  }

  getConfig(val) {
    return this.Trivia.getConfig(val, this.ID, this.serverID);
  }

  broadcast(str) {
    this.emit("game_msg", str);
  }

  // endGame
  // Ends the game visibly and destroys it.
  async endGame(endStr) {
    this.cancelled = true;
    
    if(this.inRound) {
      await this.endRound(true);
    }

    this.emit("game_end", endStr);
    this.destroy();
  }

  // destroy
  // Clears the game timeout and removes the game from the GameHandler index
  destroy() {
    if(typeof this.timeout !== "undefined") {
      clearTimeout(this.timeout);
    }

    this.inProgress = false;

    delete this.gameHandler.activeGames[this.ID];
  }

  // buildAnswers
  // Interprets the answers into an array of answers.
  // Creates a string for presentation as a multiple choice question.
  // Assigns the array "answersDisplay" and "correctID" to the question.
  buildAnswers() {
    var answerString = "";
    var answers = [];
    // Combine the blank array with this.question.incorrectAnswers. Assigning directly will create a reference.
    answers = answers.concat(this.question.incorrectAnswers);
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

      answerString = `${answerString}**${String.fromCharCode(65+i)}:** ${entities.decode(answers[i])}\n`;
    }

    return answerString;
  }

  // getTimerStr(input)
  // Converts input, a length in ms, to a time unit of hours or minutes.
  getTimerStr(input) {
    var timerStr = "";
    var numStr;
    var seconds = input/1000;

    if(seconds > 3600) timerStr = `${numStr = Math.round(seconds/3600)} hour${numStr===1?"":"s"}`;
    else if(seconds > 60) timerStr = `${numStr = Math.round(seconds/60)} minute${numStr===1?"":"s"}`;
    else timerStr = `${seconds} seconds`;

    return timerStr;
  }
  
  async recordStats() {
    if(this.category) {
      // Stat: Rounds played - custom
      this.Trivia.postStat("roundsPlayedCustom", 1);

      // Stat: Rounds played - this category
      this.Trivia.postStat(`roundsPlayedCat${this.category}`, 1);

      if(!this.roundCount === 0) {
        // Stat: Games played - custom
        this.Trivia.postStat("gamesPlayedCustom", 1);

        // Stat: Games played - this category
        this.Trivia.postStat(`gamesPlayedCat${this.category}`, 1);
      }
    }
    else {
      // Stat: Rounds played - normal
      this.Trivia.postStat("roundsPlayedNormal", 1);

      if(!this.roundCount === 0) {
        // Stat: Games played - normal
        this.Trivia.postStat("gamesPlayedNormal", 1);
      }
    }
  }

  // initializeRound
  // Prepares a round - Validates the game, pulls a question, and returns the round info
  // This handles everything we need to send the initial round data -- once this succeeds, call startRound.
  // The time between this and startRound() is the last chance to cancel the game without consequence if the initial message fails to send for any reason.
  async initializeRound() {
    this.usersActive = {};
    this.usersCorrect = {};

    this.timer = this.getConfig("round-length");
    if(this.gameMode === "hangman") {
      // Hangman games get an extra ten seconds for balance.
      this.timer = this.timer+10000;
    }

    var question, answers = [], difficultyReceived;
    try {
      var isFirstRound = this.roundCount === 0;
      question = await this.Trivia.getTriviaQuestion(0, this.ID, 0, isFirstRound, this.options.category, this.options.type, this.options.difficulty);
      // Stringify the answers in the try loop so we catch it if anything is wrong.
      answers[0] = question.correct_answer.toString();
      answers = answers.concat(question.incorrect_answers);
      difficultyReceived = question.difficulty.toString();

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

      this.destroy();
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

    this.answerExtension = question.answer_extension;
    this.imageQuestion = question.question_image;
    this.imageAnswer = question.answer_image;
    
    this.date = new Date();
    this.inRound = false;

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
    if(this.gameMode === "standard") {
      // No answer string in standard mode.
      // We still need buildAnswers to set the display IDs for the buttons.
      answerString = "";
    }

    var infoString = this.gameStrings.buildInfoString();

    if(this.getConfig("debug-mode")) {
      infoString = `${infoString}\n*(Debug Mode - Answer: **${entities.decode(question.correct_answer)}**)*`;
    }

    var finalString = `*${categoryString}*\n**${this.formatStr(question.question)}**\n${answerString}${infoString}`;

    this.emit("round_initialize", finalString);
    return finalString;
  }

  async startRound() {
    this.recordStats();
    this.inRound = true;
    this.emit("round_start");
  }

  submitAnswer(userId, username, isCorrect) {
    var scoreValue = this.getConfig("score-value");

    if(this.getConfig("disallow-answer-changes") && typeof this.usersActive[userId] !== "undefined") {
      return;
    }

    // Add to participants if they aren't already on the list
    if(this.inProgress && typeof this.usersActive[userId] === "undefined") {
      this.usersActive[userId] = username;

      this.usersTotal[userId] = username;
    }

    // If their score doesn't exist, intialize it.
    this.scores[userId] = this.scores[userId] || 0;

    if(isCorrect) {
      // Correct answer recording 
      if(typeof this.usersCorrect[userId] !== "undefined") {
        return;
      }

      this.usersCorrect[userId] = username;

      var scoreChange = 0;
      if(typeof scoreValue[this.question.difficulty] === "number") {
        scoreChange = scoreValue[this.question.difficulty];
      }
      else {
        // Leave the score change at 0, display a warning.
        console.warn(`WARNING: Invalid difficulty value '${this.question.difficulty}' for the current question. User will not be scored.`);
      }

      this.Trivia.debugLog(`Updating score of user ${userId} (Current value: ${this.scores[userId]}) + ${scoreChange}.`);
      this.scores[userId] += scoreChange;
      this.Trivia.debugLog(`New score for user ${userId}: ${this.scores[userId]}`);
    }
    else {
      // If the answer is wrong, remove them from usersCorrect if necessary
      if(typeof this.usersCorrect[userId] !== "undefined") {
        this.Trivia.debugLog(`User ${userId} changed answers, reducing score (Current value: ${this.scores[userId]}) by ${scoreValue[this.question.difficulty]}.`);

        this.scores[userId] -= scoreValue[this.question.difficulty];

        this.Trivia.debugLog(`New score for user ${userId}: ${this.scores[userId]}`);

        // Now that the name is removed, we can remove the ID.
        delete this.usersCorrect[userId];
      }
    }
  }

  getIsEnding() {
    if(this.cancelled) {
      return true;
    }

    // Always false outside of mid-game.
    if(this.inRound) {
      return false;
    }

    // If there are fixed rounds and we've exceeded the fixed count
    if(this.getConfig("use-fixed-rounds") && this.roundCount >= this.getConfig("rounds-fixed-number")) {
      this.Trivia.debugLog(`Passed fixed round count of ${this.getConfig("rounds-fixed-number")} - Ending game.`);
      return true;
    }

    // If there are no fixed rounds and we've exceeded the empty round count
    if(!this.getConfig("use-fixed-rounds") && this.emptyRoundCount >= this.getConfig("rounds-end-after")) {
      this.Trivia.debugLog(`Empty round count is ${this.emptyRoundCount} - Ending game.`);
      return true;
    }
  }

  // endRound
  // Ends the round and reveals the answer.
  async endRound(isForced) {
    if(typeof this === "undefined" || !this.inProgress) {
      return;
    }

    this.inRound = false;
    this.roundCount++;
    
    if(Object.keys(this.usersActive).length === 0) { 
      this.emptyRoundCount++;
      this.isEmptyRound = true;
    }
    else
      this.emptyRoundCount = 0;

    var gameIsEnding = this.getIsEnding();
    var roundTimeout = this.getConfig("round-timeout");

    var str = this.gameStrings.buildRoundEndStr(this, gameIsEnding, isForced);

    // Finalization
    this.emit("round_end", { str, roundTimeout, gameIsEnding});

    if(gameIsEnding) {
      this.endGame();
      return;
    }
  }
}

module.exports = Game;