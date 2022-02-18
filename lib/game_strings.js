// Game Extensions - Optional features for games that can be configured.
class GameStrings {
  buildRoundEndStr(game, isEnding, isForced) {
    var str = "";
    var scorePrefix;
    var isSingleplayer = Object.keys(game.usersTotal).length === 1;

    if(!game.getConfig("hide-answers")) {
      var correctId = game.question.displayCorrectID;

      if(game.gameMode !== "hangman") {
        str = `**${String.fromCharCode(65+correctId)}:** `;
      }

      str = `${str}${game.formatStr(game.question.answer)}`;
    }

    if(typeof game.answerExtension !== "undefined") {
      str = `${str}\n\n${game.formatStr(game.answerExtension)}`;
    }

    if(!game.getConfig("disable-score-display")) {
      str = `${str}\n\n`;

      // "Final Score(s)" at end of round, or "Correct Answers:" for mid-round.
      scorePrefix = `**${isEnding?`Final score${isSingleplayer?"":"s"}`:"Correct answers:"}**`;

      if(!isEnding && Object.keys(game.usersCorrect).length === 0) {
        // Empty mid-round string
        str = `${str}${scorePrefix}\nNone`;

        // If we're halfway through the inactive round cap (rounds-end-after), display a warning
        if(!game.getConfig("use-fixed-rounds") && !game.getConfig("round-end-warnings-disabled") && game.emptyRoundCount >= Math.ceil(game.getConfig("rounds-end-after")/2)) {
          var roundEndCount = game.getConfig("rounds-end-after")-game.emptyRoundCount;
          str = `${str}\n\nThe game will end in ${roundEndCount} round${roundEndCount===1?"":"s"} if there is no activity.`;
        }
      }
      else if(isSingleplayer) {
        // Single-player string
        var participantId = Object.keys(game.usersTotal)[0];
        var score = game.scores[participantId];

        if(typeof game.usersCorrect[participantId] !== "undefined") {
          str = `${str}Correct, ${game.usersTotal[participantId]}!\nYour score: ${score}`;
        }
      else {
          str = `${str}Incorrect, ${game.usersTotal[participantId]}!`;
        }
      }
      else {
        // Standard string
        var participantsToDisplay = isEnding?game.usersTotal : game.usersCorrect;
        var scoreStr = game.gameHandler.leaderboard.makeScoreStr(game.scores, participantsToDisplay);

        if(scoreStr === "") {
          scoreStr = "None";
        }

        str = `${str}${scorePrefix}\n${scoreStr}`;
      }
    }

    if(isEnding) {
      str = `${str}\n\n*Game ended${isForced?" by admin":""}.*`;
    }

    return str;
  }
}

module.exports = GameStrings;
