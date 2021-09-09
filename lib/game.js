const EventEmitter = require("events");
const entities = require("html-entities").AllHtmlEntities;


// Game class
class Game extends EventEmitter {
  // channelId: The channel ID and unique identifier for the game.
  // groupID; The server ID and unique identifier for the server or group the game takes place in.
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
    this.roundID = null; // Unique identifier for the round. Usually the ID of the message. This is only set externally, post-round init.

    // Active info
    this.inProgress = true;
    this.inRound = false;
    this.cancelled = false;
    this.isEmptyRound = false;

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

    if(typeof gameMode === "undefined") {
      this.gameMode = "standard";
    }
    else {
      this.gameMode = gameMode;
    }
    
    this.color = this.Trivia.embedCol;
    this.date = void 0;

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

    // Odds and ends
    this.isLeagueGame = false;

    GameHandler.emit("game_create", this);
  }

  getConfig(val) {
    return this.Trivia.getConfigVal(val, this.ID, this.serverID);
  }

  broadcast(str) {
    this.emit("game_msg", str);
  }

  // endGame
  // Ends the game visibly and destroys it.
  // Used for things like the "stop" command -- for other uses, destroy() is used.
  async endGame() {
    if(this.inRound) {
      this.cancelled = true;

      await this.endRound();
      this.emit("game_end");
    }
    else {
      var headerStr = `**Final score${this.totalParticipantCount!==1?"s":""}:**`;
      let finalScoreStr = this.Trivia.gameHandler.leaderboard.makeScoreStr(this.scores, this.usersTotal);

      this.emit("game_end", `Game ended by admin.${finalScoreStr!==""?`\n\n${headerStr}\n`:""}${finalScoreStr}`);
    }

    this.destroy();
  }

  // destroy
  // Clears the game timeout and removes the game from the GameHandler index
  destroy() {
    if(typeof this.timeout !== "undefined") {
      clearTimeout(this.timeout);
    }

    delete this.gameHandler.activeGames[this.ID];
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

      answerString = `${answerString}**${String.fromCharCode(65+i)}:** ${entities.decode(answers[i])}\n`;
    }

    return answerString;
  }

  // buildInfoString
  // Any information or instructions that will follow the question round.
  buildInfoString() {
    var infoString = "";

    if(this.roundCount === 0) {
      infoString = "\n";

      if(this.gameMode === "hangman") {
        infoString = `${infoString}\nType your answer! `;
      }
      else if(this.gameMode === "typed") {
        infoString = `${infoString}Type a letter to answer! `;
      }

      infoString = `${infoString}The answer will be revealed in ${this.timer/1000} seconds.`;

      // Add an extra initial message to let users know the game will insta-end with no answers.
      if(!this.getConfig("round-end-warnings-disabled") && this.getConfig("rounds-end-after") === 1 && !this.getConfig("customRoundCount")) {
        infoString += "\nThe game will end automatically if there is no activity.";
      }
    }

    return infoString;
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
      question = await this.Trivia.getTriviaQuestion(0, this.ID, 0, this.question.isFirst, this.options.category, this.options.type, this.options.difficulty);
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
    if(this.gameMode === "standard") {
      // No answer string in standard mode.
      // We still need buildAnswers to set the display IDs for the buttons.
      answerString = "";
    }

    var infoString = this.buildInfoString();

    if(this.getConfig("debug-mode")) {
      infoString = `${infoString}\n*(Debug Mode - Answer: **${entities.decode(question.correct_answer)}**)*`;
    }

    var finalString = `*${categoryString}*\n**${entities.decode(question.question)}**\n${answerString}${infoString}`;

    this.emit("round_initialize", finalString);
    return finalString;
  }

  async startRound() {
    this.recordStats();
    this.emit("round_start");
  }

  submitAnswer(userId, username, isCorrect) {
    var scoreValue = this.getConfig("score-value");

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
    if(this.getConfig("use-fixed-rounds") && this.roundCount > this.getConfig("rounds-fixed-number")) {
      return true;
    }

    // If there are no fixed rounds and we've exceeded the empty round count
    if(!this.getConfig("use-fixed-rounds") && this.emptyRoundCount >= this.getConfig("rounds-end-after")) {
      return true;
    }
  }

  buildRoundEndStr(isEnding) {
    var str = "";
    var scorePrefix;
    var isSingleplayer = Object.keys(this.usersTotal).length === 1;

    if(this.getConfig("reveal-answers")) {
      var correctId = this.question.displayCorrectID;
      str = `**${String.fromCharCode(65+correctId)}:** ${entities.decode(this.question.answer)}`;
    }

    if(typeof this.answerExtension !== "undefined") {
      str = `\n${str}${this.Trivia.formatStr(this.answerExtension)}`;
    }

    if(this.getConfig("disable-score-display")) {
      return str;
    }

    str = `${str}\n\n`;

    // "Final Score(s)" at end of round, or "Correct Answers:" for mid-round.
    scorePrefix = `**${isEnding?`Final score${isSingleplayer?"":"s"}`:"Correct answers:"}**`;

    if(!isEnding && Object.keys(this.usersCorrect).length === 0) {
      // Empty mid-round string
      str = `${str}${scorePrefix}\nNone`;

      // If we're halfway through the inactive round cap (rounds-end-after), display a warning
      if(!this.getConfig("round-end-warnings-disabled") && this.emptyRoundCount >= Math.ceil(this.getConfig("rounds-end-after")/2)) {
        var roundEndCount = this.getConfig("rounds-end-after")-this.emptyRoundCount;
        str = `${str}\n\nThe game will end in ${roundEndCount} round${roundEndCount===1?"":"s"} if there is no activity.`;
      }
    }
    else if(isSingleplayer) {
      // Single-player string
      var participantId = Object.keys(this.usersTotal)[0];
      var score = this.scores[participantId];

      if(typeof this.usersCorrect[participantId] !== "undefined") {
        str = `Correct, ${this.usersTotal[participantId]}!\nYour score: ${score}`;
      }
    else {
        str = `Incorrect, ${this.usersTotal[participantId]}!`;
      }
    }
    else {
      // Standard string
      var participantsToDisplay = isEnding?this.usersTotal : this.usersCorrect;
      var scoreStr = this.gameHandler.leaderboard.makeScoreStr(this.scores, participantsToDisplay);
  
      str = `${str}${scorePrefix}\n${scoreStr}`;
    }

    if(isEnding) {
      str = `${str}\n\n*Game ended.*`;
    }

    return str;
  }

  // endRound
  // Ends the round, reveals the answer, and schedules a new round if necessary.
  async endRound() {
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

    var str = this.buildRoundEndStr(gameIsEnding);

    // Finalization
    this.emit("round_end", { str, roundTimeout, gameIsEnding});

    if(gameIsEnding) {
      this.destroy();
      return;
    }
  }

  applyBonusMultiplier(scoreBase, multiplierMax, userID) {
    var multiplier;
  
    var multiplierBase = multiplierMax;
    if(multiplierBase !== 0) {
      var index = Object.keys(this.usersActive).indexOf(userID)+1;
  
      // Score multiplier equation
      multiplier = multiplierBase/index+1;
  
      // Don't apply if the number is negative or passive.
      if(multiplier > 1) {
        var bonus = Math.floor((scoreBase*multiplier)-scoreBase);
  
        return bonus;
      }
    }
  }
}

module.exports = Game;