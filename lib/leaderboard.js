module.exports = () => {
  var fs = require("fs");

  // If the stats folder does not exist, create it.
  function initStatFolder() {
    fs.mkdirSync("./Scores");
  }

  // # makeScoreStr # //
  // Returns a string containing a game's complete leaderboard.
  function makeScoreStr(scores, totalParticipants) {
    var scoreArray = [];
    var finalStr = "";
    for(var user in scores) {
      scoreArray.push(user);
    }

    var scoreA, scoreB;
    scoreArray.sort((a, b) => {
      scoreA = scores[a] || 0;
      scoreB = scores[b] || 0;

      return scoreB - scoreA;
    });

    // TEMPORARY: Cap the user count at 48 to prevent character overflow.
    // This will later be fixed so the bot splits the list instead of truncating it.
    var scoreArrayFull;
    var scoreArrayTruncate = 0;
    if(scoreArray.length > 48) {
      scoreArrayFull = scoreArray;
      scoreArray = scoreArray.slice(0,48);

      scoreArrayTruncate = 1;
    }

    scoreArray.forEach((userB) => {
      var score;
      if(typeof scores[userB] === "undefined") {
        score = 0;
      }
      else {
        score = scores[userB];
      }

      finalStr = `${finalStr}${finalStr!==""?"\n":""}${totalParticipants[userB]}: ${score}`;
    });

    if(scoreArrayTruncate) {
      finalStr = `${finalStr}\n*+ ${scoreArrayFull.length-48} more*`;
    }

    return finalStr;
  }

  // Write scores from a game to file.
  function writeScores(game) {
    if(!fs.existsSync("./Scores/scores.json")) {
      initStatFolder();
    }

    var scoreData = {};
    scoreData[game.guildId] = game.scores;

    fs.writeFile("./Scores/scores.json", JSON.stringify(scoreData, null, "\t"), "utf8", (err) => {
      if(err) {
        console.error("Failed to write scores with error: " + err.message);
      }

      console.log("Saved scores to file:");
      console.log(readScores(game.guildId));
    });
  }

  function readScores(guildId) {
    var json = JSON.parse(fs.readFileSync("./Scores/scores.json"));

    if(json[guildId] === "") {
      console.log("Scores are empty!");
    }

    return json[guildId];
  }

  return { writeScores, readScores, makeScoreStr };
};
