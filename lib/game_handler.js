const EventEmitter = require("events");
const entities = require("html-entities").AllHtmlEntities;
// TODO: Deprecate the scheduled option?
// TODO: Separate hangman into a sub-class?

const Letters = ["A", "B", "C", "D"];

class GameHandler extends EventEmitter {
  constructor(Trivia) {
    super();
    
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

    GameHandler.emit("game_create", this);
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

    if(this.roundCount === 0) {
      infoString = "\n";

      if(this.gameMode === 2) {
        infoString = `${infoString}\nType your answer! `;
      }
      else if(this.gameMode !== 1) {
        infoString = `${infoString}Type a letter to answer! `;
      }

      infoString = `${infoString}The answer will be revealed in ${this.timer/1000} seconds.`;

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

    this.timer = this.getConfig("round-length");
    if(this.gameMode === 2) {
      // Hangman games get an extra ten seconds for balance.
      this.timer = this.timer+10000;
    }

    var question, answers = [], difficultyReceived;
    try {
      question = await this.Trivia.getTriviaQuestion(0, this.ID, 0, this.question.isFirst, this.options.category, this.options.type, this.options.difficulty);
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

    this.answerExtension = question.answer_extension;
    this.imageQuestion = question.question_image;
    this.imageAnswer = question.answer_image;
    
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

    // Reveal the answer after the time is up
    this.timeout = setTimeout(() => {
      this.endRound();
    }, this.timer);

    this.emit("round_initialize", finalString);
    return finalString;
  }

  async startRound() {
    this.recordStats();
    this.emit("round_start");
  }

  // endRound
  // Ends the round, reveals the answer, and schedules a new round if necessary.
  // TODO: Break this down into smaller operations
  async endRound() {
    if(typeof this === "undefined" || !this.inProgress) {
      return;
    }
    
    var roundTimeout = this.getConfig("round-timeout");
    this.inRound = false;
    this.roundCount++;
  
    // Custom options
    // Custom round count subtracts by 1 until reaching 0, then the this ends.
    if(typeof this.options.customRoundCount !== "undefined") {
      this.options.customRoundCount = this.options.customRoundCount-1;
  
      if(typeof this.options.intermissionTime !== "undefined" && this.options.customRoundCount <= this.options.totalRoundCount/2) {
        roundTimeout = this.options.intermissionTime;
  
        this.emit("this_msg", `Intermission - this will resume in ${roundTimeout/60000} minute${roundTimeout/1000===1?"":"s"}.`);
        this.options.intermissionTime = void 0;
      }
      else if(this.options.customRoundCount <= 0) {
        setTimeout(() => {
          this.gameHandler.endGame();
          return;
        }, 100);
      }
    }
  
    var correctUsersStr = "**Correct answer:**\n";
    var scoreStr = "";
  
    // If only one participant, we'll only need the first user's score.
    if(!this.getConfig("disable-score-display")) {
      var scoreVal = this.scores[Object.keys(this.correctUsers)[0]];
  
      if(typeof scoreVal !== "undefined") {
        if(isNaN(this.scores[ Object.keys(this.correctUsers)[0] ])) {
          console.log("WARNING: NaN score detected, dumping this data...");
        }
  
        scoreStr = `(${scoreVal.toLocaleString()} points)`;
      }
    }
  
    var gameEndedMsg = "", gameFooter = "";
    var gameIsEnding = false;
    var doAutoEnd = 0;
    if(this.cancelled) {
      gameEndedMsg = "\n\n*Game ended by admin.*";
      gameIsEnding = true;
    }
    else if(Object.keys(this.activeParticipants).length === 0 && !this.options.customRoundCount) {
      // If there were no participants...
      if(this.emptyRoundCount+1 >= this.getConfig("rounds-end-after")) {
        doAutoEnd = 1;
        gameEndedMsg = "\n\n*Game ended.*";
        gameIsEnding = true;
      } else {
        this.emptyRoundCount++;
  
        // Round end warning after we're halfway through the inactive round cap.
        if(!this.getConfig("round-end-warnings-disabled") && this.emptyRoundCount >= Math.ceil(this.getConfig("rounds-end-after")/2)) {
          var roundEndCount = this.getConfig("rounds-end-after")-this.emptyRoundCount;
          gameFooter += `Game will end in ${roundEndCount} round${roundEndCount===1?"":"s"} if there is no activity.`;
        }
      }
    } else {
      // If there are participants and the this wasn't force-cancelled...
      this.emptyRoundCount = 0;
      doAutoEnd = 0;
    }
  
    if((gameIsEnding || this.getConfig("disable-score-display")) && !this.getConfig("full-score-display") ) {
      // Mid-Game Score Display
      var truncateList = 0;
  
      if(Object.keys(this.correctUsers).length > 32) {
        truncateList = 1;
      }
  
      // Normal Score Display
      if(Object.keys(this.correctUsers).length === 0) {
        if(Object.keys(this.activeParticipants).length === 1) {
          correctUsersStr = `Incorrect, ${Object.values(this.activeParticipants)[0]}!`;
        }
        else {
          correctUsersStr = correctUsersStr + "Nobody!";
        }
      }
      else {
        if(Object.keys(this.activeParticipants).length === 1) {
          // Only one player overall, simply say "Correct!"
          // Bonus multipliers don't apply for single-player thiss
          correctUsersStr = `Correct, ${Object.values(this.correctUsers)[0]}! ${scoreStr}`;
        }
        else  {
          // More than 10 correct players, player names are separated by comma to save space.
          var comma = ", ";
          var correctCount = Object.keys(this.correctUsers).length;
  
          // Only show the first 32 scores if there are a lot of players.
          // This prevents the bot from potentially overflowing the embed character limit.
          if(truncateList) {
            correctCount = 32;
          }
  
          for(var i = 0; i <= correctCount-1; i++) {
            if(i === correctCount-1) {
              comma = "";
            }
            else if(correctCount <= 10) {
              comma = "\n";
            }
  
            var score = this.scores[ Object.keys(this.correctUsers)[i] ];
  
            var bonusStr = "";
            var bonus = this.Trivia.applyBonusMultiplier(this.ID, this.getConfig("score-value")[this.question.difficulty], this.getConfig("score-multiplier-max"), Object.keys(this.correctUsers)[i]);
  
            this.Trivia.debugLog(`Applied bonus score of ${bonus} to user ${Object.keys(this.correctUsers)[i]}`);
  
            if(score !== score+bonus && typeof bonus !== "undefined") {
              bonusStr = ` + ${bonus} bonus`;
            }
            else {
              bonus = 0;
            }
  
            if(!this.getConfig("disable-score-display")) {
              scoreStr = ` (${score.toLocaleString()} pts${bonusStr})`;
            }
  
            // Apply bonus after setting the string.
            this.scores[ Object.keys(this.correctUsers)[i] ] = score+bonus;
  
            correctUsersStr = `${correctUsersStr}${Object.values(this.correctUsers)[i]}${scoreStr}${comma}`;
          }
  
          if(truncateList) {
            var truncateCount = Object.keys(this.correctUsers).length-32;
            correctUsersStr = `${correctUsersStr}\n*+ ${truncateCount} more*`;
          }
        }
      }
    }
    else {
      // Game-Over Score Display
      var totalParticipantCount = Object.keys(this.totalParticipants).length;
  
      if(!gameIsEnding) {
        correctUsersStr = `**Score${totalParticipantCount!==1?"s":""}:**`;
      } else {
        correctUsersStr = `**Final score${totalParticipantCount!==1?"s":""}:**`;
      }
  
      if(totalParticipantCount === 0) {
        correctUsersStr = `${correctUsersStr}\nNone`;
      }
      else {
        correctUsersStr = `${correctUsersStr}\n${this.Trivia.leaderboard.makeScoreStr(this.scores, this.totalParticipants)}`;
      }
    }
  
    if(gameFooter !== "") {
      gameFooter = "\n\n" + gameFooter;
    }
  
    var answerStr = "";
  
    if(this.getConfig("reveal-answers") === true) { // DELTA: Answers will be not shown in the Summary
      answerStr = `${this.thisMode!==2?`**${Letters[this.question.displayCorrectID]}:** `:""}${this.Trivia.formatStr(this.question.answer)}\n\n`;
    }
  
    if(typeof this.answerExtension !== "undefined") {
      answerStr = `${answerStr}${this.Trivia.formatStr(this.answerExtension)}\n\n`;
    }
  
    // Finalization
    this.emit("round_end", `${answerStr}${correctUsersStr}${gameEndedMsg}${gameFooter}`, doAutoEnd, roundTimeout);

    if(gameIsEnding) {
      this.endGame();
    }
    else {
      this.timeout = setTimeout(() => {
        this.initializeRound();
      }, roundTimeout);
    }
  }
}

module.exports = { GameHandler, Game };
