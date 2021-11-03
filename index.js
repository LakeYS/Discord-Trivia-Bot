const pjson = require("./package.json");
const fs = require("fs");
const { ShardingManager } = require("discord.js");

process.title = `TriviaBot ${pjson.version}`;

function initLogs(config) {
  // process.stdout.columns returns "undefined" in certain situations
  var strArray = [ `\x1b[7m TriviaBot Version ${pjson.version}`,
                   "\x1b[7m Copyright (c) 2018-2021 Lake Y",
                   "\x1b[7m https://lakeys.net" ];

  var padLen = Math.max(strArray[1].length+1, strArray[0].length+1);
  // Adjust length of the first line
  for(var i = 0; i <= strArray.length-1; i++) {
    strArray[i] = strArray[i].padEnd(padLen, " ") + "\x1b[0m";
  }

  var strHeader = `${strArray[0]}\n${strArray[1]}\n${strArray[2]}`;

  // Optional logo display
  if(typeof config !== "undefined" && config["display-ascii-logo"]) {
    var useSideStr = process.stdout.columns > 61;

    // Use a pattern to properly space the logo.
    var patt = /^ {3}./mg;

    // See here for an example of how this looks when the application is running:
    // http://lakeys.net/triviabot/console.png
    console.log(`\
                     ########
                ##################
             ###      #######     ###
           ###    ###############   ###
         ###    ####################  ###
        ###     #########    ########  ###
       ###     ########      ########   ###
      ###       #####       ########     ###
     ###                  ##########      ### ${useSideStr?strArray[0]:""}
     ###               ###########        ### ${useSideStr?strArray[1]:""}
     ###              #########           ### ${useSideStr?strArray[2]:""}
      ###             ########           ###
       ###            ######            ###
        ###            ####            ###
          ###         ######         ###
            ###      #######       ###
              #####    ####    #####
                   ############
                      ######\n${useSideStr?"":strHeader}`
    .replace(patt, ""));
  }
  else {
    console.log(`${strHeader}\n`);
  }
}

// # Initialize Config Args # //
var config;
var configFile;
for(let i = 0; i <= process.argv.length; i++) {
  if(typeof process.argv[i] !== "undefined" && process.argv[i].startsWith("--configfile=")) {
    configFile = process.argv[i].replace("--configfile=", "");
  }
}

try {
  config = require("./lib/config.js")(configFile, true).config;
}
catch(err) {
  // Config file broken or missing -- display the initial message and an error
  initLogs();
  console.error("Unable to load config file: " + err.message);
  process.exit();
}

initLogs(config);

// # Requirements/Init # //
const configPrivate = {
  githubAuthor: "LakeYS",
  githubName: "Discord-Trivia-Bot"
};

require("./lib/init.js")(pjson, config, configPrivate);

if(config["allow-eval"] === true) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
}

// # Discord # //
var token = config.token;
const manager = new ShardingManager(`${__dirname}/lib/platform/discord_shard.js`, {
  totalShards: config["shard-count"],
  token,
  shardArgs: [configFile],
  respawn: true
});

// # Custom Package Loading # //
if(typeof config["additional-packages-root"] !== "undefined") {
  config["additional-packages-root"].forEach((key) => {
    require(key)(config, manager);
  });
}

// # Stats # //
var stats;
try {
  stats = JSON.parse(fs.readFileSync(config["stat-file"]));
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
manager.spawn()
.catch((err) => {
  var warning = "";

  if(err.name === "Error [TOKEN_INVALID]") {
    if(token === "yourtokenhere") {
      warning = "\nIt appears that you have not yet added a token. Please replace \"yourtokenhere\" with a valid token in the config file.";
    }
    else {
      warning += "\nPlease double-check your token and try again.";

      if(token.length < 50) {
        warning = "\nIt appears that you have entered a client secret or other invalid string. Please ensure that you have entered a token and try again.";
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

  console.log(`Successfully launched shard ${shardId} of ${manager.totalShards-1}`);

  // TODO: Rate limit this to prevent API flooding
  shard.on("death", (process) => {
    console.error("Shard " + shardId + " closed unexpectedly! PID: " + process.pid + "; Exit code: " + process.exitCode + ".");

    if(process.exitCode === null)
    {
      console.warn("WARNING: Shard " + shardId + " exited with NULL error code. This may be a result of a lack of available system memory. Ensure that there is enough memory allocated to continue.");
    }
  });

  shard.on("shardDisconnect", () => {
    console.warn("Shard " + shardId + " disconnected.");
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

        fs.writeFile(config["stat-file"], JSON.stringify(stats, null, "\t"), "utf8", (err) => {
          if(err) {
            console.error(`Failed to save stats.json with the following err:\n${err}\nMake sure stats.json is not read-only or missing.`);
          }
        });
      }
    }
  });
});


// # Console Functions # //
const evalCmds = require("./lib/eval_cmds.js")(manager);
manager.eCmds = evalCmds;

if(config["allow-eval"] === true) {
  process.stdin.on("data", (text) => {
    // Cut newlines, split the command by spaces to represent arguments.
    var cmdFull = text.replace("\r","").replace("\n","").split(" ");
    var cmdFunction = cmdFull[0];

    if(typeof evalCmds[cmdFunction] === "function") {
      // Remove the first word (the command itself) before pasing it
      cmdFull.shift(1);

      // Execute the command with any further parameters as an array
      evalCmds[cmdFunction](cmdFull);
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
