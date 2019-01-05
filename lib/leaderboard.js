module.exports = () => {
  var fs = require("fs");

  // If the stats folder does not exist, create it.
  function initStatFolder() {
    try {
      fs.mkdirSync("./Scores");
    }
    catch(err) {
      // Ignore error if it's a "directory already exists" error
      if(err.code !== "EEXIST") {
        throw err;
      }
    }
  }

  // # makeScoreStr # //
  // Formerly fetchFinalScores
  // Returns a string containing a game's complete leaderboard.
  function makeScoreStr(scores, totalParticipants, largeMode) {
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

      if(largeMode) {
        finalStr = `${finalStr}${finalStr!==""?"\n":""}**${totalParticipants[userB]}** - ${score.toLocaleString()} points`;
      } else {
        finalStr = `${finalStr}${finalStr!==""?"\n":""}${totalParticipants[userB]}: ${score.toLocaleString()}`;
      }
    });

    if(scoreArrayTruncate) {
      finalStr = `${finalStr}\n*+ ${scoreArrayFull.length-48} more*`;
    }

    return finalStr;
  }

  // # readScores # //
  // Reads scores from file and passes them through as JSON data.
  function readScores(guildId, section) {
    if(typeof section === "undefined") {
      section = "Default";
    }

    var json = JSON.parse(fs.readFileSync("./Scores/scores.json"));

    if(typeof json[guildId] === "undefined" || typeof json[guildId][section] === "undefined" || Object.keys(json[guildId][section]).length === 0) {
      throw new Error("Leaderboard is empty");
    }

    return json[guildId][section];
  }

  // # readScores # //
  // Appends an array of scores to an existing file, retaining persistent scores.
  function writeScores(scores, guildId, section) {
    if(!fs.existsSync("./Scores/scores.json")) {
      initStatFolder();
    }

    if(typeof section === "undefined") {
      section = "Default";
    }

    var scoresOld = {};
    if(fs.existsSync("./Scores/scores.json")) {
      // Back up the leaderboard file before each write.
      fs.copyFileSync("./Scores/scores.json", "./Scores/scores.json.bak");

      try {
        scoresOld = readScores(guildId, section);
      }
      catch(err) {
        if(err.message !== "Leaderboard is empty") {
          throw err;
        }
      }
    }

    var scoresFinal = scoresOld;
    for(var user in scores) {
      if(typeof scoresFinal[user] !== "number") {
        scoresFinal[user] = 0;
      }

      if(typeof scores[user] !== "number") {
        scores[user] = 0;
      }

      scoresFinal[user] += scores[user];
    }

    var scoreData = {};
    scoreData[guildId] = {};
    scoreData[guildId][section] = scoresFinal;

    fs.writeFile("./Scores/scores.json", JSON.stringify(scoreData, null, "\t"), "utf8", (err) => {
      if(err) {
        console.error("Failed to write scores with error: " + err.message);
      }
    });
  }

  return { writeScores, readScores, makeScoreStr };
};
