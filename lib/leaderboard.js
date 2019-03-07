module.exports = (getConfigVal) => {
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

    // TEMPORARY: Cap the user count to prevent character overflow.
    // This will later be fixed so the bot splits the list instead of truncating it.
    // Command-based ("largeMode") leaderboards cap at 10 to reduce spam.
    var scoreArrayFull, scoreArrayCap;
    var scoreArrayTruncate = 0;

    if(largeMode) {
      scoreArrayCap = 10;
    }
    else {
      scoreArrayCap = 32;
    }

    if(scoreArray.length > scoreArrayCap) {
      scoreArrayFull = scoreArray;
      scoreArray = scoreArray.slice(0, scoreArrayCap);

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
        finalStr = `${finalStr}${finalStr!==""?"\n":""}${scoreArray.indexOf(userB)+1}. ${totalParticipants[userB]} - ${score.toLocaleString()} points`;
      } else {
        finalStr = `${finalStr}${finalStr!==""?"\n":""}${totalParticipants[userB]}: ${score.toLocaleString()}`;
      }
    });

    if(scoreArrayTruncate) {
      finalStr = `${finalStr}\n*+ ${scoreArrayFull.length-scoreArrayCap} more*`;
    }

    return finalStr;
  }

  // # refreshScores # //
  // Performs any necessary time-sensitive actions to a set of scores.
  // TODO: Include an option to only refresh certain guilds/sections
  //       (This will be necessary if using a larger number of sections or guilds)
  function refreshScores(scores) {
    for(var guildId in scores) {
      for(var section in scores[guildId]) {
        // Update the scores based on their properties.
        var prop = scores[guildId][section]["Properties"];

        if(prop.expireDate !== "undefined") {
          if(new Date().getTime() > new Date(prop.expireDate)) {
            // Leaderboard has expired, so we'll archive it and return empty.

            // Retain the board.
            var sectionNew = "Previous " + section;
            scores[guildId][sectionNew] = scores[guildId][section];

            scores[guildId][sectionNew]["Properties"] = {
              name: sectionNew,
              writeTime: new Date(),
              // Indicates how long after expiration that the board was actually cleared
              expired: true,
              expiredOn: scores[guildId][section]["Properties"].expireDate
              // Same value, different key. Avoids trying to re-reset the board.
            };

            delete scores[guildId][section];
          }
        }

        if(typeof prop.expiredOn === "undefined") {
          // Assign expiration dates if they change or are nonexistent.
          // It's important that these checks are made AFTER the normal 'expired' check, otherwise they won't work correctly.
          var dCurr, dExp;
          if(section.endsWith("Monthly")) {
            if(typeof prop.expireDate === "undefined" || new Date(prop.expireDate).getDate() !== getConfigVal("board-monthly-reset-day")) {
              dCurr = new Date();
              dExp = new Date();
              dExp.setMonth(dCurr.getMonth()+1);
              dExp.setDate(getConfigVal("board-monthly-reset-day")); // Default: 1
              dExp.setMinutes(0);
              dExp.setHours(0);
              dExp.setSeconds(0);
              dExp.setMilliseconds(0);
              prop.expireDate = dExp;
            }
          }

          if(section.endsWith("Weekly")) {
            dCurr = new Date();
            var weekDay = dCurr.getDate() + (7 - dCurr.getDay()) + getConfigVal("board-weekly-reset-day");
            if(typeof prop.expireDate === "undefined" || new Date(prop.expireDate).getDate() !== weekDay) {
              dExp = new Date();
              dExp.setMonth(dCurr.getMonth());
              dExp.setDate(weekDay); // Default: Sunday of next week (weekDay = 0)
              dExp.setMinutes(0);
              dExp.setHours(0);
              dExp.setSeconds(0);
              dExp.setMilliseconds(0);
              prop.expireDate = dExp;
            }
          }
        }
      }
    }

    return scores;
  }

  // # readScores # //
  // Reads scores from file and passes them through as JSON data.
  // includeProperties (bool): Whether or not to include the "Properties" object.
  // doSectionSearch (bool): When enabled, the section argument will be checked for a
  //                         non-case-sensitive close matching string.
  function readScores(guildId, section, includeProperties, doSectionSearch) {
    if(typeof section === "undefined") {
      section = "DEFAULT";
    }

    var errEmpty = new Error("Leaderboard is empty");

    // No file, board is empty.
    if(!fs.existsSync("./Scores/scores.json")) {
      throw errEmpty;
    }

    var json = JSON.parse(fs.readFileSync("./Scores/scores.json"));

    if(typeof json[guildId] === "undefined") {
      throw errEmpty;
    }

    json = refreshScores(json);

    // doSectionSearch
    if(doSectionSearch) {
      section = Object.keys(json[guildId]).find((el) => {
        // Exclude the prefix 'previous' unless the user explicitly specifies it.
        if(!section.toUpperCase().startsWith("PREVIOUS") && el.toUpperCase().startsWith("PREVIOUS")) {
          return false;
        }

        return el.toUpperCase().includes(section.toUpperCase());
      });

      if(typeof section === "undefined") {
        throw new Error("Section does not exist");
      }
    }

    // Throw a unique error if the board is detected as empty.
    if(typeof json[guildId][section] === "undefined" || Object.keys(json[guildId][section]).length === 1) {
      throw errEmpty;
    }

    if(!includeProperties) {
      // Delete the properties before passing it.
      delete json[guildId][section]["Properties"];
    }

    return json[guildId][section];
  }

  // # getScoreSections # //
  // Returns an array containing all currently available sections.
  // Returns two arrays: one of all available score sections, and one of their corresponding display names.
  // Not recommended for use in conjunction with readScores.
  function getScoreSections(guildId) {
    if(typeof guildId === "undefined") {
      throw new Error("No guild ID specified");
    }

    var errAllEmpty = new Error("All leaderboards are empty");

    // No file, board is empty.
    if(!fs.existsSync("./Scores/scores.json")) {
      throw errAllEmpty;
    }

    var json = JSON.parse(fs.readFileSync("./Scores/scores.json"));

    if(typeof json[guildId] === "undefined") {
      throw errAllEmpty;
    }

    return Object.keys(json[guildId]);
  }

  // # writeScores # //
  // Appends an array of scores to an existing file, retaining persistent scores.
  function writeScores(scores, guildId, sections, teamName) {
    if(!fs.existsSync("./Scores/scores.json")) {
      initStatFolder();
    }

    var scoresOld = {}, json = {};
    if(fs.existsSync("./Scores/scores.json")) {
      // Back up the leaderboard file after each write.
      // No try/catch for this because we don't want to continue if we can't make a backup.
      setTimeout(() => {
        fs.copyFileSync("./Scores/scores.json", "./Scores/scores.json.bak");
      }, 1000);

      // We'll need to read the raw file in order to append to it.
      json = JSON.parse(fs.readFileSync("./Scores/scores.json"));
      json = refreshScores(json);
    }

    var scoresFinal, propertiesOld;
    var scoreData = json || {};

    for(var i in sections) {
      var section = sections[i];

      if(typeof section === "undefined") {
        section = "Default";
      }

      if(typeof teamName !== "undefined") {
        section = teamName + " " + section;
      }

      scoresOld = {};
      if(typeof json[guildId] !== "undefined" && typeof json[guildId][section] !== "undefined") {
        scoresOld = json[guildId][section];
      }

      scoresFinal = scoresOld, propertiesOld = {};

      // Add up the scores for this section.
      for(var user in scores) {
        if(typeof scoresFinal[user] !== "number") {
          scoresFinal[user] = 0;
        }

        if(typeof scores[user] !== "number") {
          scores[user] = 0;
        }

        scoresFinal[user] += scores[user];
      }

      // Initialization and passthrough of the properties object
      propertiesOld = {};
      if(typeof scoresOld["Properties"] !== "undefined") {
        propertiesOld = scoresOld["Properties"];
        delete scoresOld["Properties"];
      }

      // Re-set the properties so they stay on the bottom.
      scoresFinal["Properties"] = propertiesOld;

      // Assign new properties where relevant.
      scoresFinal["Properties"].name = section;
      scoresFinal["Properties"].writeTime = new Date();

      // Assign score data to the correct sections.
      scoreData[guildId] = json[guildId] || {}; // Initialize if it doesn't exist.
      scoreData[guildId][section] = scoresFinal;
    }

    // Finally, write all of the data back to the file.
    if(typeof scoreData !== "object") {
      throw new Error("Leaderboard write aborted due to score data being a non-object value.");
    }
    else {
      var saveData = JSON.stringify(scoreData, null, "\t");

      if(typeof saveData !== "string" || saveData.length === 0) {
        throw new Error("CRITICAL: Attempting to write bad data to leaderboard, scores will not save.");
      }

      fs.writeFile("./Scores/scores.json", saveData, "utf8", (err) => {
        if(err) {
          console.log("!!! An error occurred while attempting to write scores. Dumping data... !!!");
          console.log(scoreData);
          console.error(`ERROR: Failed to write scores with error: ${err.message}. Scores have not been saved.`);
        }
      });
    }
  }

  return { writeScores, readScores, makeScoreStr, refreshScores, getScoreSections };
};
