const fs = require("fs");

module.exports = (configFile) => {

  if(typeof configFile === "undefined") {
    configFile = "./config.json";
  }

  var config = JSON.parse(fs.readFileSync(configFile));

  // Initialize missing config options to their defaults
  }
  config.prefix = config.prefix || "trivia ";
  config["round-timeout"] = config["round-timeout"] || 5500;
  config["round-length"] = config["round-length"] || 15000;
  config["shard-count"] = config["shard-count"] || "auto";

  return config;
};
