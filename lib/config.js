const fs = require("fs");

module.exports = (configFile, displayWarnings) => {
  // In some cases, the argument passes as a string containing the text "undefined"
  if(typeof configFile === "undefined" || configFile === "undefined") {
    configFile = "./config.json";
  }

  var ConfigData = {};
  ConfigData.config = JSON.parse(fs.readFileSync(configFile));
  var Config = ConfigData.config;

  // Initialize missing config options to their defaults
  Config.prefix                       = Config.prefix || "trivia ";
  Config.databaseURL                  = Config.databaseURL || "https://opentdb.com";
  Config["database-cache-size"]       = Config["database-cache-size"] || "32";
  Config["round-length"]              = Config["round-length"] || 20000;
  Config["round-timeout"]             = Config["round-timeout"] || 5500;
  Config["rounds-end-after"]          = Config["rounds-end-after"] || 2;
  Config["shard-count"]               = Config["shard-count"] || "auto";
  Config["stat-file"]                 = Config["stat-file"] || "./stats.json"; // NOTE: Only use in index.js
  Config["score-value"]               = Config["score-value"] || { "easy": 100, "medium": 200, "hard": 300 };
  Config["score-multiplier-max"]      = Config["score-multiplier-max"] || 0;
  Config["board-monthly-reset-day"]   = Config["board-monthly-reset-day"] || 1;
  Config["board-weekly-reset-day"]    = Config["board-weekly-reset-day"] || 0;
  Config["auto-delete-answers-timer"] = Config["auto-delete-answers-timer"] || 0;

  if(typeof Config["embed-color"] !== "string") {
    Config["embed-color"] = "006CFF";
  }

  // Register certain config options as "local" options.
  // Local options are options that can vary by channel or guild without interfering with other channels.
  ConfigData.localOptions = [
    "use-reactions", "hangman-mode", "hide-difficulty", "auto-delete-msgs",
    "auto-delete-answers", "auto-delete-answers-timer", "round-length",
    "round-timeout", "round-end-warnings-disabled", "rounds-end-after",
    "disable-score-display", "score-value", "score-multiplier-max",
    "command-whitelist", "accept-first-answer-only"
  ];

  // displayWarnings flag avoids repeating warnings if we need to reload config.
  if(displayWarnings) {
    if(Config.databaseURL === "https://opentdb.com") {
      if(Config["rounds-end-after"] > 10) {
        console.warn("WARNING: Config option 'rounds-end-after' is set higher than 10. Consider lowering this to avoid spam for both Discord and the trivia API.");
      }
      if(Config["database-cache-size"] > 50) {
        console.warn("WARNING: Config option 'database-cache-size' is set higher than the maximum allowed of 50. The question cache will be limited to 50 questions.");
      }
      else if(Config["database-cache-size"] < 10) {
        console.warn("WARNING: Config option 'database-cache-size' is set lower than 10. Consider increasing this to avoid flooding the database with requests.");
      }
    }

    if(Config["use-reactions"] && Config["hangman-mode"]) {
      console.warn("WARNING: Config option 'use-reactions' and 'hangman-mode' cannot both be enabled at the same time. Defaulting to 'false' for both options.");
    }
  }

  if(Config["use-reactions"] && Config["hangman-mode"]) {
    Config["use-reactions"] = false, Config["hangman-mode"] = false;
  }

  ConfigData.configFile = configFile;

  return ConfigData;
};
