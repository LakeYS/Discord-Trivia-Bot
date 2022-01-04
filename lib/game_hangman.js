const Game = require("./game.js");

// Game class
class HangmanGame extends Game {
  constructor(GameHandler, channelId, groupID, ownerID, options, gameMode) {
    super(GameHandler, channelId, groupID, ownerID, options, gameMode);

    options.type = "multiple";
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

      var isExceptedChar = char.match(/,|"|'|:|\(|\)/) !== null;
  
      if(char === " ") {
        obscuredAnswer = `${obscuredAnswer} `;
      }
      else if(skipChars.includes(charI) || isExceptedChar) {
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
  
    answer = this.formatStr(answer);
  
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

  // (override)
  // Creates an answer string for a hangman game.
  buildAnswers(doHint) {
    var answer = this.question.answer;
    var answerString = `**Hint:** ${this.createObscuredAnswer(answer, doHint)}`;

    return answerString;
  }
}

module.exports = HangmanGame;