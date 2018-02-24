const fs = require("fs");

module.exports = (configFile) => {

  if(typeof configFile === "undefined") {
    configFile = "./config.json";
  }

  var config = JSON.parse(fs.readFileSync(configFile));

  // Initialize missing config options to their defaults
  if(typeof config.prefix === "undefined") {
    config.prefix = "trivia ";
  }

  if(typeof config["round-timeout"] === "undefined") {
    config["round-timeout"] = 5500;
  }

  if(typeof config["round-length"] === "undefined") {
    config["round-length"] = 15000;
  }

  if(typeof config.prefix === "undefined") {
    config.prefix = "trivia ";
  }

  if(typeof config["shard-count"] === "undefined") {
    config["shard-count"] = "auto";
  }

  return config;
};
