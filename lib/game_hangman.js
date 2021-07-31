const Game = require("./game.js");

// Game class
class HangmanGame extends Game {
  // channelId: The channel ID and unique identifier for the game.
  // groupID; The server ID and unique identifier for the server or group the game takes place in.
  // scheduled: Set to true if starting a game scheduled by the bot.
  //            Keep false if starting on a user's command. (must already have a game initialized to start)
  // difficulty (str): Difficulty as defined by the database. (i.e. "easy", "medium", or "hard")
  // type (str): Question type as defined by the database. (i.e. "multiple", "boolean")

  constructor(GameHandler, channelId, groupID, ownerID, options, gameMode) {
    super(GameHandler, channelId, groupID, ownerID, options, gameMode);
  }

  createObscuredAnswer(answer, doHint) {
    var obscuredAnswer = "";
    var skipChars = [];
  
    if(doHint) {
      // Randomly reveal up to 1/3 of the answer.
      var charsToReveal = answer.length/3;
      for(var i = 0; i <= charsToReveal; i++) {
        var skipChar = Math.floor(Math.random() * answer.length);
        skipChars.push(skipChar);
      }
    }
  
    for(var charI = 0; charI <= answer.length-1; charI++) {
      var char = answer.charAt(charI);
  
      if(char === " ") {
        obscuredAnswer = `${obscuredAnswer} `;
      }
      else if(skipChars.includes(charI) || char === "," || char === "\"" || char === "'" || char === ":" || char === "(" || char === ")") {
        // If this character is set to be revealed or contains an exception, show it.
        obscuredAnswer = `${obscuredAnswer}${char}`;
      }
      else {
        // A thin space character (U+2009) is used so the underscores have
        // a small distinguishing space between them.
        // ESLint really doesn't like this, but it works great!
        obscuredAnswer = `${obscuredAnswer}\\_ `;
      }
    }
  
    return obscuredAnswer;
  }

  doHangmanHint(answer) {
    // Verify that the game is still running and that it's the same game.
    if(!this.inRound || answer !== this.question.answer) {
      return;
    }
  
    answer = this.Trivia.formatStr(answer);
  
    // If the total string is too small, skip showing a hint.
    if(answer.length < 4) {
      return;
    }
  
    var hintStr = this.createObscuredAnswer(answer, true);
  
    this.emit("game_msg", {embed: {
      color: this.Trivia.embedCol,
      description: `Hint: ${hintStr}`
    }});
  }

  // buildHangmanAnswerString
  // Creates an answer string for a hangman game.
  buildAnswers(doHint) {
    var answer = this.question.answer;

    var answerString = `**Hint:** ${this.createObscuredAnswer(answer, doHint)}`;

    if(this.getConfig("debug-mode")) {
      answerString = `${answerString} *(Answer: ${answer})*`;
    }

    return answerString;
  }
}

module.exports = HangmanGame;