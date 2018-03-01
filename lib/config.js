const fs = require("fs");

module.exports = (configFile) => {
  // In some cases, the argument passes as a string containing the text "undefined"
  if(typeof configFile === "undefined" || configFile === "undefined") {
    configFile = "./config.json";
  }

  var config = JSON.parse(fs.readFileSync(configFile));

  // Initialize missing config options to their defaults
  config.prefix = config.prefix || "trivia ";
  config["round-timeout"] = config["round-timeout"] || 5500;
  config["round-length"] = config["round-length"] || 15000;
  config["shard-count"] = config["shard-count"] || "auto";

  return config;
};
