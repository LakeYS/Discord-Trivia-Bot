import {readFileSync} from "fs";

export default (configFile, displayWarnings) => {
  // In some cases, the argument passes as a string containing the text "undefined"
  if(typeof configFile === "undefined" || configFile === "undefined") {
    configFile = "./config.json";
  }

  var ConfigData = {};
  ConfigData.config = JSON.parse(readFileSync(configFile));
  var Config = ConfigData.config;

  // Initialize missing config options to their defaults
  Config.prefix                       = Config.prefix || "trivia ";
  Config.databaseURL                  = Config.databaseURL || "https://opentdb.com";
  Config["database-cache-size"]       = Config["database-cache-size"] || "32";
  Config["round-length"]              = Config["round-length"] || 15000;
  Config["round-timeout"]             = Config["round-timeout"] || 4000;
  Config["rounds-end-after"]          = Config["rounds-end-after"] || 2;
  Config["shard-count"]               = Config["shard-count"] || "auto";
  Config["stat-file"]                 = Config["stat-file"] || "./stats.json"; // NOTE: Only use in index.js
  Config["score-value"]               = Config["score-value"] || { "easy": 100, "medium": 200, "hard": 300 };
  Config["score-multiplier-max"]      = Config["score-multiplier-max"] || 0;
  Config["board-monthly-reset-day"]   = Config["board-monthly-reset-day"] || 1;
  Config["board-weekly-reset-day"]    = Config["board-weekly-reset-day"] || 0;
  Config["auto-delete-msgs-timer"]    = Config["auto-delete-msgs-timer"] || 15000;
  Config["auto-delete-answers-timer"] = Config["auto-delete-answers-timer"] || 0;
  Config["command-whitelist"] = Config["command-whitelist"] || [];
  Config["login-timeout"] = Config["login-timeout"] || 30000;

  if(typeof Config["embed-color"] !== "string") {
    Config["embed-color"] = "006CFF";
  }

  // Register certain config options as "local" options.
  // Local options are options that can vary by channel or guild without interfering with other channels.
  ConfigData.localOptions = [
    "accept-first-answer-only",
    "auto-delete-answers",
    "auto-delete-answers-timer",
    "auto-delete-msgs",
    "auto-delete-msgs-timer",
    "command-whitelist",
    "disable-score-display",
    "disable-score-display-final",
    "disable-score-display-midround",
    "disallow-answer-changes",
    "hangman-mode",
    "hide-answers",
    "hide-difficulty",
    "reveal-answers",
    "round-end-warnings-disabled",
    "round-length",
    "round-timeout",
    "rounds-end-after",
    "score-multiplier-max",
    "score-value",
    "use-reactions", 
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

    if(Config["use-reactions"]) {
      console.warn("WARNING: Config option 'use-reactions' is deprecated and is subject to removal in a future update.");
    }

    if(Config["use-slash-commands"] === undefined) {
      console.warn("WARNING: Config option 'use-slash-commands' is not " + 
        "defined. Slash commands will NOT be used unless this option is " +
        "added.");
    }
  }

  if(Config["use-reactions"] && Config["hangman-mode"]) {
    Config["use-reactions"] = false, Config["hangman-mode"] = false;
  }

  // Config shim for the 1.x disable-score-display option.
  if(Config["disable-score-display"]) {
    Config["disable-score-display-midround"] = true;
    Config["disable-score-display-final"] = true;
  }

  ////// Config shims for 2.0-pre builds that were distributed prior to 2.0.
  if(Config["unique-multiplier-max"]) Config["score-multiplier-max"] = Config["unique-multiplier-max"];
  if(Config["disallow-answer-changes"]) Config["accept-first-answer-only"] = Config["disallow-answer-changes"];
  if(Config["hide-answers"]) Config["reveal-answers"] = !Config["hide-answers"];
  //////

  ConfigData.configFile = configFile;

  return ConfigData;
};
