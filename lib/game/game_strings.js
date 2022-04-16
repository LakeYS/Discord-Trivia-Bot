// Game Extensions - Optional features for games that can be configured.
class GameStrings {
  // buildInfoString
  // Any information or instructions that will follow the question round.
  buildInfoString() {
    var infoString = "";

    if(this.roundCount === 0) {
      if(this.gameMode === "hangman") {
        infoString = `${infoString}\nType your answer! `;
      }
      else if(this.gameMode === "typed") {
        infoString = `${infoString}Type a letter to answer! `;
      }

      var timerStr = this.getTimerStr(this.timer);
      infoString = `${infoString}The answer will be revealed in ${timerStr}.`;

      // Add an extra initial message to let users know the game will insta-end with no answers.
      if(!this.getConfig("round-end-warnings-disabled") && this.getConfig("rounds-end-after") === 1 && !this.getConfig("customRoundCount")) {
        infoString += "\nThe game will end automatically if there is no activity.";
      }
    }

    return infoString;
  }

  buildRoundEndStr(game, isEnding, isForced) {
    var str = "";
    var scorePrefix;
    var isSingleplayer = Object.keys(game.usersTotal).length === 1;

    if(!game.getConfig("hide-answers")) {
      var correctId = game.question.displayCorrectID;

      if(game.gameMode !== "hangman") {
        str = `**${String.fromCharCode(65+correctId)}:** `;
      }

      str = `${str}${game.formatStr(game.question.answer)}\n\n`;
    }

    if(typeof game.answerExtension !== "undefined") {
      str = `${str}${game.formatStr(game.answerExtension)}\n\n`;
    }

    const scoresDisabledMidround = game.getConfig("disable-score-display-midround");
    const scoresDisabledEnd = game.getConfig("disable-score-display-final");

    const scoresDisabled = (isEnding && scoresDisabledEnd) || (!isEnding && scoresDisabledMidround);

    if(!scoresDisabled) {
      str = `${str}`;

      // "Final Score(s)" at end of round, or "Correct Answers:" for mid-round.
      scorePrefix = `**${isEnding?`Final score${isSingleplayer?"":"s"}:`:"Correct answers:"}**\n`;

      if(!isEnding && Object.keys(game.usersCorrect).length === 0) {
        // Empty mid-round string
        str = `${str}${scorePrefix}None\n\n`;

        // If we're halfway through the inactive round cap (rounds-end-after), display a warning
        if(!game.getConfig("use-fixed-rounds") && !game.getConfig("round-end-warnings-disabled") && game.emptyRoundCount >= Math.ceil(game.getConfig("rounds-end-after")/2)) {
          var roundEndCount = game.getConfig("rounds-end-after")-game.emptyRoundCount;
          str = `${str}The game will end in ${roundEndCount} round${roundEndCount===1?"":"s"} if there is no activity.\n\n`;
        }
      }
      else if(isSingleplayer) {
        // Single-player string
        var participantId = Object.keys(game.usersTotal)[0];
        var score = game.scores[participantId];

        if(typeof game.usersCorrect[participantId] !== "undefined") {
          str = `${str}Correct, ${game.usersTotal[participantId]}!\nYour score: ${score}\n\n`;
        }
        else if(typeof game.usersActive[participantId] !== "undefined") {
          str = `${str}Incorrect, ${game.usersTotal[participantId]}!\n\n`;
        }
      }
      else {
        // Standard string
        var participantsToDisplay = isEnding?game.usersTotal : game.usersCorrect;
        var scoreStr = game.gameHandler.leaderboard.makeScoreStr(game.scores, participantsToDisplay);

        if(scoreStr === "") {
          scoreStr = "None";
        }

        str = `${str}${scorePrefix}\n${scoreStr}\n\n`;
      }
    }

    if(isEnding) {
      str = `${str}*Game ended${isForced?" by admin":""}.*`;
    }

    return str;
  }
}

module.exports = GameStrings;
