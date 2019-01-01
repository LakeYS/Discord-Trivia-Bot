module.exports = () => {
  var fs = require("fs");

  // If the stats folder does not exist, create it.
  function initStatFolder() {
    fs.mkdirSync("./Stats");
  }

  // Write scores from a game to file.
  function writeScores(game) {
    if(!fs.existsSync("./Stats/scores.json")) {
      initStatFolder();
    }

    fs.writeFile("./Stats/scores.json", JSON.stringify(game.scores, null, "\t"), "utf8", (err) => {
      if(err) {
        console.error("Failed to write scores with error: " + err.message);
      }

      console.log("Saved scores to file:");
      console.log(readScores());
    });
  }

  function readScores() {
    try {
      var json = JSON.parse(fs.readFileSync("./Stats/scores.json"));
      return json;
    } catch(err) {
      console.log("Failed to read scores with error: " + err);
    }
  }

  return { writeScores, readScores };
};
