import { readFileSync, writeFile  } from "fs";

import { ShardingManager } from "discord.js";

import configFunc from "./lib/config.js";
import evalCmdsFunc from "./lib/eval_cmds.js";
import initFunc from "./lib/init.js";
import LogManager from "./lib/log_manager.js";
import pkg from "./package.json" with { type: "json" };

var logs = new LogManager(pkg.version);
process.title = `TriviaBot ${pkg.version}`;

// # Initialize Config Args # //
var config;
var configFile;
for(let i = 0; i <= process.argv.length; i++) {
  if(typeof process.argv[i] !== "undefined" && process.argv[i].startsWith("--configfile=")) {
    configFile = process.argv[i].replace("--configfile=", "");
  }
}

try {
  config = configFunc(configFile, true).config;
}
catch(err) {
  // Config file broken or missing -- display the initial message and an error
  logs.initLogs({ displayAsciiLogo: false });
  console.error("Unable to load config file: " + err.message);
  process.exit();
}

logs.initLogs({ displayAsciiLogo: config["display-ascii-logo"] });

// # Requirements/Init # //
const configPrivate = {
  githubAuthor: "LakeYS",
  githubName: "Discord-Trivia-Bot"
};

await initFunc(pkg, config, configPrivate);

if(config["allow-eval-console"] === true) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
}

// # Discord # //
var token = config.token;
const manager = new ShardingManager("./lib/platform/discord_shard.js", {
  totalShards: config["shard-count"],
  token,
  shardArgs: [configFile],
  respawn: true
});

// # Stats # //
var stats;
try {
  stats = JSON.parse(readFileSync(config["stat-file"]));
} catch(error) {
  if(typeof error.code !== "undefined" && error.code === "ENOENT") {
    console.warn("No stats file found; one will be created.");
  }
  else {
    // If an error occurs, don't overwrite the old stats.
    config["stat-file"] = config["stat-file"] + ".1";
    stats = {};
    console.log(`Failed to load stats file, stats will be saved to ${config["stat-file"]}. Received error:\n${error}`);
  }
}

// # ShardingManager # //
manager.spawn({ timeout: config["login-timeout"]})
.catch((err) => {
  var warning = "";

  if(err.code === "TokenInvalid") {
    if(token === "yourtokenhere") {
      warning = "\nIt appears that you have not yet added a token. Please replace \"yourtokenhere\" with a valid token in the config file.";
    }
    else {
      warning += "\nPlease double-check your token and try again.";

      if(token.length < 50) {
        warning = "\nIt appears that you have entered a client secret or other invalid data. Please ensure that you have entered a token and try again.";
      }
    }
  }

  var str;
  if(typeof err.status !== "undefined") {
    str = `${err.status} ${err.statusText}`;
  }
  else {
    str = err.message;
  }

  console.error(`Discord client login failed - ${str}${warning}`);

  // Exit if single shard
  if(manager.totalShards === 1) {
    process.exit();
  }
});

manager.on("shardCreate", (shard) => {
  var shardId = shard.id;

  console.log(`Logging in on shard ${shardId} of ${manager.totalShards-1}`);

  shard.on("death", (process) => {
    console.error("Shard " + shardId + " closed unexpectedly! PID: " + process.pid + "; Exit code: " + process.exitCode + ".");

    if(process.exitCode === null)
    {
      console.warn("WARNING: Shard " + shardId + " exited with NULL error code. This may be a result of a lack of available system memory. Ensure that there is enough memory allocated to continue.");
    }
  });

  shard.on("shardDisconnect", () => {
    console.warn("Disconnected on shard " + shardId + ".");
  });

  // ## Manager Messages ## //
  shard.on("message", (input) => {
    if(typeof input.evalStr !== "undefined") {
      // Eval
      eval(input.evalStr);
    }
    else if(typeof input.stats !== "undefined") {
      // Update stats

      if(config["fallback-mode"] !== true) {
        Object.keys(input.stats).forEach((stat) => {
          stats = stats || {};

          if(typeof stats[stat] !== "number") {
            // This stat doesn't exist, initialize it.
            stats[stat] = input.stats[stat];
          }
          else {
            // Increase the stat
            stats[stat] += input.stats[stat];
          }
        });

        writeFile(config["stat-file"], JSON.stringify(stats, null, "\t"), "utf8", (err) => {
          if(err) {
            console.error(`Failed to save stats.json with the following err:\n${err}\nMake sure stats.json is not read-only or missing.`);
          }
        });
      }
    }
  });
});

// # Console Functions # //
const evalCmds = evalCmdsFunc(manager);
manager.eCmds = evalCmds;

if(config["allow-eval-console"] === true) {
  process.stdin.on("data", (text) => {
    // Cut newlines, split the command by spaces to represent arguments.
    var cmdFull = text.replace("\r","").replace("\n","").split(" ");
    var cmdFunction = cmdFull[0];

    if(typeof evalCmds[cmdFunction] === "function") {
      // Remove the first word (the command itself) before parsing it
      cmdFull.shift(1);

      try {
      // Execute the command with any further parameters as an array
      evalCmds[cmdFunction](cmdFull);
      } catch(err) {
        console.error("Failed to run command with error:");
        console.error(err);
      }
    }
    else {
      console.log("Eval:");
      try {
        eval(text.toString());
      }
      catch(err) {
        console.log(err);
      }
    }
  });
}
