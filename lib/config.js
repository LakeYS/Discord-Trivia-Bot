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
  Config.database_cache_size       = Config.database_cache_size || "32";
  Config.round_length              = Config.round_length || 15000;
  Config.round_timeout             = Config.round_timeout || 4000;
  Config.rounds_end_after          = Config.rounds_end_after || 2;
  Config.shard_count               = Config.shard_count || "auto";
  Config.stat_file                 = Config.stat_file || "./stats.json"; // NOTE: Only use in index.js
  Config.score_value               = Config.score_value || { "easy": 100, "medium": 200, "hard": 300 };
  Config.score_multiplier_max      = Config.score_multiplier_max || 0;
  Config.board_monthly_reset_day   = Config.board_monthly_reset_day || 1;
  Config.board_weekly_reset_day    = Config.board_weekly_reset_day || 0;
  Config.auto_delete_msgs_timer    = Config.auto_delete_msgs_timer || 15000;
  Config.auto_delete_answers_timer = Config.auto_delete_answers_timer || 0;
  Config.command_whitelist = Config.command_whitelist || [];

  if(typeof Config.embed_color !== "string") {
    Config.embed_color = "006CFF";
  }

  if(typeof Config.reveal_answers !== "boolean") {
    Config.reveal_answers = true;
  }

  // Register certain config options as "local" options.
  // Local options are options that can vary by channel or guild without interfering with other channels.
  ConfigData.localOptions = [
    "use-reactions", "hangman-mode", "hide-difficulty", "auto-delete-msgs", "auto-delete-msgs-timer",
    "auto-delete-answers", "auto-delete-answers-timer", "round-length",
    "round-timeout", "round-end-warnings-disabled", "rounds-end-after",
    "disable-score-display", "score-value", "score-multiplier-max",
    "command-whitelist", "accept-first-answer-only"
  ];

  // displayWarnings flag avoids repeating warnings if we need to reload config.
  if(displayWarnings) {
    if(Config.databaseURL === "https://opentdb.com") {
      if(Config.rounds_end_after > 10) {
        console.warn("WARNING: Config option 'rounds-end-after' is set higher than 10. Consider lowering this to avoid spam for both Discord and the trivia API.");
      }
      if(Config.database_cache_size > 50) {
        console.warn("WARNING: Config option 'database-cache-size' is set higher than the maximum allowed of 50. The question cache will be limited to 50 questions.");
      }
      else if(Config.database_cache_size < 10) {
        console.warn("WARNING: Config option 'database-cache-size' is set lower than 10. Consider increasing this to avoid flooding the database with requests.");
      }
    }

    if(Config.use_reactions && Config.hangman_mode) {
      console.warn("WARNING: Config option 'use-reactions' and 'hangman-mode' cannot both be enabled at the same time. Defaulting to 'false' for both options.");
    }
  }

  ConfigData.configFile = configFile;

  return ConfigData;
};
