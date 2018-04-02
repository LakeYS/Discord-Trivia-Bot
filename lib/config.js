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
  config["round-timeout"] = config["round-timeout"] || 5500;
  config["round-length"] = config["round-length"] || 25000;
  config["shard-count"] = config["shard-count"] || "auto";
  config["stat-file"] = config["stat-file"] || "./stats.json"; // NOTE: Only use in index.js

  if(displayWarnings && config.databaseURL === "https://opentdb.com") {
    if(config["database-cache-size"] > 50) {
      console.warn("WARNING: Config option 'database-cache-size' is set higher than the maximum allowed of 50. The question cache will be limited to 50 questions.");
    }
    else if(config["database-cache-size"] < 10) {
      console.warn("WARNING: Config option 'database-cache-size' is set lower than 10. Consider increasing this to avoid flooding the database with requests.");
    }
  }

  return config;
};
