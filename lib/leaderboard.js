module.exports = () => {
  var fs = require("fs");

  function initStatFolder() {
    fs.mkdirSync("./Stats");
  }

  function writeScores(game) {
    if(!fs.existsSync("./Stats/scores.json")) {
      initStatFolder();
    }

    fs.writeFile("./Stats/scores.json", JSON.stringify(game.scores, null, "\t"), "utf8", (err) => {

    if(err) {
      console.error("Failed to write scores with error: " + err.message);
    }
  });
  }

  return { writeScores };
};
