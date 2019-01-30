const fs = require("fs");

module.exports = (configFile, displayWarnings) => {
  // In some cases, the argument passes as a string containing the text "undefined"
  if(typeof configFile === "undefined" || configFile === "undefined") {
    configFile = "./config.json";
  }

  var config = JSON.parse(fs.readFileSync(configFile));

  // Initialize missing config options to their defaults
  config.prefix = config.prefix || "trivia ";
  config.databaseURL = config.databaseURL || "https://opentdb.com";
  config["database-cache-size"] = config["database-cache-size"] || "32";
  config["round-length"] = config["round-length"] || 20000;
  config["round-timeout"] = config["round-timeout"] || 5500;
  config["rounds-end-after"] = config["rounds-end-after"] || 2;
  config["shard-count"] = config["shard-count"] || "auto";
  config["stat-file"] = config["stat-file"] || "./stats.json"; // NOTE: Only use in index.js
  config["score-value"] = config["score-value"] || { "easy": 100, "medium": 200, "hard": 300 };
  config["board-monthly-reset-day"] = config["board-monthly-reset-day"] || 1;
  config["board-weekly-reset-day"] = config["board-weekly-reset-day"] || 0;
  config["auto-delete-answers-timer"] = config["auto-delete-answers-timer"] || 0;

  if(typeof config["embed-color"] !== "string") {
    config["embed-color"] = "006CFF";
  }

  // displayWarnings flag avoids repeating warnings if we need to reload config.
  if(displayWarnings) {
    if(config.databaseURL === "https://opentdb.com") {
      if(config["rounds-end-after"] > 10) {
        console.warn("WARNING: Config option 'rounds-end-after' is set higher than 10. Consider lowering this to avoid spam for both Discord and the trivia API.");
      }
      if(config["database-cache-size"] > 50) {
        console.warn("WARNING: Config option 'database-cache-size' is set higher than the maximum allowed of 50. The question cache will be limited to 50 questions.");
      }
      else if(config["database-cache-size"] < 10) {
        console.warn("WARNING: Config option 'database-cache-size' is set lower than 10. Consider increasing this to avoid flooding the database with requests.");
      }
    }

    if(config["use-reactions"] && config["hangman-mode"]) {
      console.warn("WARNING: Config option 'use-reactions' and 'hangman-mode' cannot both be enabled at the same time. Defaulting to 'false' for both options.");
    }
  }

  if(config["use-reactions"] && config["hangman-mode"]) {
    config["use-reactions"] = false, config["hangman-mode"] = false;
  }

  config.configFile = configFile;

  return config;
};
