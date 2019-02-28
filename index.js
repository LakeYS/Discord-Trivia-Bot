const pjson = require("./package.json");
process.title = `TriviaBot ${pjson.version}`;

// # Art Display # //
// process.stdout.columns returns "undefined" in certain situations
var strArray = [ `\x1b[7m TriviaBot Version ${pjson.version}        `,
                 "\x1b[7m Copyright (c) 2018-2019 Lake Y \x1b[0m",
                 "\x1b[7m https://lakeys.net             \x1b[0m" ];

// Adjust length of the first line
strArray[0] = strArray[0].padEnd(31," ") + "\x1b[0m";

var strSide = ["", "", ""];
var strBottom = "";

if(process.stdout.columns > 61) {
  strSide = strArray;
}
else {
  strBottom = `\n${strArray[0]}\n${strArray[1]}\n${strArray[2]}`;
}

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
 ###                  ##########      ### ${strSide[0]}
 ###               ###########        ### ${strSide[1]}
 ###              #########           ### ${strSide[2]}
  ###             ########           ###
   ###            ######            ###
    ###            ####            ###
      ###         ######         ###
        ###      #######       ###
          #####    ####    #####
               ############
                  ######${strBottom}`);

// # Initialize Config Args # //
var configFile;
for(var i = 0; i <= process.argv.length; i++) {
  if(typeof process.argv[i] !== "undefined" && process.argv[i].startsWith("--configfile=")) {
    configFile = process.argv[i].replace("--configfile=", "");
  }
}

var Config = require("./lib/config.js")(configFile, true).config;

// # Requirements/Init # //
const configPrivate = {
  githubAuthor: "LakeYS",
  githubName: "Discord-Trivia-Bot"
};

require("./lib/init.js")(pjson, Config, configPrivate);

if(Config["allow-eval"] === true) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
}

const fs = require("fs");

// # Discord # //
const { ShardingManager } = require("discord.js");
var token = Config.token;
const manager = new ShardingManager(`${__dirname}/shard.js`, { totalShards: Config["shard-count"], token, shardArgs: [configFile] });

// # Custom Package Loading # //
if(typeof Config["additional-packages-root"] !== "undefined") {
  Config["additional-packages-root"].forEach((key) => {
    require(key)(Config, manager);
  });
}

// # Stats # //
var stats;
try {
  stats = JSON.parse(fs.readFileSync(Config["stat-file"]));
} catch(error) {
  if(typeof error.code !== "undefined" && error.code === "ENOENT") {
    console.warn("No stats file found; one will be created.");
  }
  else {
    // If an error occurs, don't overwrite the old stats.
    Config["stat-file"] = Config["stat-file"] + ".1";
    stats = {};
    console.log(`Failed to load stats file, stats will be saved to ${Config["stat-file"]}. Received error:\n${error}`);
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

    var shardId;
    // We only need to sample one guild ID in the file to determine its corresponding shard.
    if(typeof Object.values(games)[0] !== "undefined") {
      if(manager.totalShards === "auto") {
        console.error("ERROR: manager.totalShards must be a number in order to import properly.");
        return;
      }

      // We'll use Discord's sharding formula to determine the corresponding shard.
      shardId = parseInt((Object.values(games)[0].guildId/2**22) % manager.totalShards);
      if(isNaN(shardId)) {
        console.error(`ERROR: Shard ID (${Object.values(games)[0].guildId/2**22} % ${manager.totalShards}) is NaN, defaulting to ${i}`);
        shardId = i;
      }
      console.log(`Contents of file "game.${i}.json.bak" belong to shard ${shardId}`);
    }
    else {
      shardId = i;
      console.log(`Contents of file "game.${i}.json.bak" are empty, defaulting to shard ${i}`);
    }

    // Initialize the shard in preparation for exporting
    gameExports[shardId] = gameExports[shardId] || {};

    // Define the old shard if it does not exist yet.
    gameExports[i] = gameExports[i] || {};

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
      console.error(`Failed to rewrite to game.json.bak with the following err:\n ${err}`);
    }
  });
}

// # ShardingManager # //
manager.spawn()
.catch((err) => {
  var warning = "";

  if(err.message.includes("401 Unauthorized")) {
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

  console.error(`Discord client login failed - ${err}${warning}`);

  process.exit();
});

manager.on("launch", (shard) => {
  console.log(`Successfully launched shard ${shard.id} of ${manager.totalShards-1}`);
  if(shard.id === 0) {
    // Refresh exports before the first shard spawns.
    // This is done on launch because it requires totalShards to be a number.
    refreshGameExports();
  }
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
    if(Config["fallback-mode"] !== true) {
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

      fs.writeFile(Config["stat-file"], JSON.stringify(stats, null, "\t"), "utf8", (err) => {
        if(err) {
          console.error(`Failed to save stats.json with the following err:\n${err}\nMake sure stats.json is not read-only or missing.`);
        }
      });
    }
  }
});

// # Console Functions # //
const evalCmds = require("./lib/evalCmds.js")(manager);
manager.eCmds = evalCmds;

if(Config["allow-eval"] === true) {
  process.stdin.on("data", (text) => {
    var cmd = text.replace("\r","").replace("\n","");

    if(typeof evalCmds[cmd] === "function") {
      evalCmds[cmd]();
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
