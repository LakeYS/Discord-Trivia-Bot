module.exports = () => {
  var fs = require("fs");

  // If the stats folder does not exist, create it.
  function initStatFolder() {
    fs.mkdirSync("./Scores");
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

  return { writeScores, readScores };
};
