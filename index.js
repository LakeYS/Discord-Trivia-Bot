const pjson = require("./package.json");

// The spacing of the artwork will mess up with double-digit version numbers (such as '1.10.0')
// process.stdout.columns returns "undefined" in certain situations
if(process.stdout.columns > 61) {
  console.log("                 ########\n            ##################\n         ###      #######     ###\n       ###    ###############   ###\n     ###    ####################  ###\n    ###     #########    ########  ###\n   ###     ########      ########   ###\n  ###       #####       ########     ###\n ###                  ##########      ### \x1b[7m TriviaBot Version " + pjson.version + "   \x1b[0m\n ###               ###########        ### \x1b[7m Copyright (c) 2018 Lake Y \x1b[0m\n ###              #########           ### \x1b[7m http://lakeys.net         \x1b[0m\n  ###             ########           ###\n   ###            ######            ###\n    ###            ####            ###\n      ###         ######         ###\n        ###      #######       ###\n          #####    ####    #####\n               ############\n                  ######");
}
else {
  console.log("                 ########\n            ##################\n         ###      #######     ###\n       ###    ###############   ###\n     ###    ####################  ###\n    ###     #########    ########  ###\n   ###     ########      ########   ###\n  ###       #####       ########     ###\n ###                  ##########      ###\n ###               ###########        ###\n ###              #########           ###\n  ###             ########           ###\n   ###            ######            ###\n    ###            ####            ###\n      ###         ######         ###\n        ###      #######       ###\n          #####    ####    #####\n               ############\n                  ######\n\x1b[7m TriviaBot Version " + pjson.version + "   \x1b[0m\n\x1b[7m Copyright (c) 2018 Lake Y \x1b[0m\n\x1b[7m http://lakeys.net         \x1b[0m");
}

process.title = "TriviaBot " + pjson.version;

// # Initialize Config Args # //
var configFile;
for(var i = 0; i <= process.argv.length; i++) {
  if(typeof process.argv[i] !== "undefined" && process.argv[i].startsWith("--configfile=")) {
    configFile = process.argv[i].replace("--configfile=", "");
  }
}

var config = require("./lib/config.js")(configFile, true);
require("./lib/init.js")(pjson,config);

// # Requirements/Init # //
process.stdin.resume();
process.stdin.setEncoding("utf8");
const fs = require("fs");

// # Discord # //
const { ShardingManager } = require("discord.js");
var token = config.token;
const manager = new ShardingManager(`${__dirname}/shard.js`, { totalShards: config["shard-count"], token, shardArgs: [configFile] });

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
    console.log("Failed to load stats file, stats will be saved to " + config["stat-file"] + ". Received error:\n" + error);
  }
}

// # File Handling # //
// ## refreshGameExports() ##
// Renames all exported game files to match their corresponding shards.
// The files will be renamed, merged, and split where necessary.
// This must be called before importing if the shard count has changed, or games will NOT import.
// WARNING: There MUST be a complete sequence of exported files; if a number is skipped, this
//          will not work properly.
function refreshGameExports() {
  var i = 0;
  var gameExports = {};

  var games;
  while(fs.existsSync("./game."  + i + ".json.bak")) {
    try {
      games = JSON.parse(fs.readFileSync("./game."  + i + ".json.bak"));
    } catch(error) {
      console.log(`refreshGameExports - Failed to import file for shard ${i}: ${error.message}`);
      i++;
      continue;
    }

    // TODO: fill empty values so that the empty files are re-written

    //if(Object.keys(games).length === 0) {
    //  // File is empty, ignore it and move on.
    //  i++;
    //  continue;
    //}

    var shardId;
    // We only need to sample one guild ID in the file to determine its corresponding shard.
    if(typeof Object.values(games)[0] !== "undefined") {
      // We'll use Discord's sharding formula to determine the corresponding shard.
      shardId = parseInt((Object.values(games)[0].guildId/2**22) % manager.totalShards);
      console.log(`Contents of file "game.${i}.json.bak" belong to shard ${shardId}`);
    }
    else {
      shardId = i;
      console.log(`Contents of file "game.${i}.json.bak" are empty, defaulting to shard ${i}`);
    }

    // Initialize the shard in preparation for exporting
    if(typeof gameExports[shardId] === "undefined") {
      gameExports[shardId] = {};
    }

    // Define the old shard if it does not exist yet.
    if(typeof gameExports[i] === "undefined") {
      gameExports[i] = {};
    }

    Object.keys(games).forEach((key) => {
      gameExports[shardId][key] = games[key];
    });

    i++;
  }

  // Now, we re-export the data.
  Object.keys(gameExports).forEach((key) => {
    var file = "./game."  + key + ".json.bak";

    try {
      fs.writeFileSync(file, JSON.stringify(gameExports[key], null, "\t"), "utf8");
      console.log(`Exported ${Object.keys(gameExports[key]).length} game(s) to ${file}`);
    }
    catch(err) {
      console.error("Failed to rewrite to game.json.bak with the following err:\n" + err);
    }
  });
}

// # ShardingManager # //
// Refresh exports before spawning the shards
refreshGameExports();
manager.spawn()
.catch((err) => {
  var warning = "";

  if(err.message.includes("401 Unauthorized")) {
    warning += "\nPlease double-check your token and try again.";
  }

  console.error("Discord client login failed - " + err + warning);

  process.exit();
});

manager.on("launch", (shard) => {
  console.log(`Successfully launched shard ${shard.id} of ${manager.totalShards-1}`);
});

// ## Manager Messages ## //
manager.on("message", (shard, input) => {
  if(typeof input.evalStr !== "undefined") {
    // Eval
    eval(input.evalStr);
  }
  else if(typeof input.stats !== "undefined") {
    // Update stats
    // Example: client.shard.send({stats: { test: 123 }});
    if(config["fallback-mode"] !== true) {
      Object.keys(input.stats).forEach((stat) => {
        if(typeof stats == "undefined") {
          stats = {};
        }

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
          console.error("Failed to save stats.json with the following err:\n" + err + "\nMake sure stats.json is not read-only or missing.");
        }
      });
    }
  }
});

// # Console Functions # //
if(config["allow-eval"] === true) {
  process.stdin.on("data", (text) => {
    if(text.toString() === "stop\r\n" || text.toString() === "exit\r\n" || text.toString() === "stop\n" || text.toString() === "exit\n") {
      manager.broadcastEval("client.destroy();")
      .then(() => {
        process.exit();
      });
    }
    else {
      console.log("Eval on index:");
      try {
        eval(text.toString());
      }
      catch(err) {
        console.log(err);
      }
    }
  });
}
