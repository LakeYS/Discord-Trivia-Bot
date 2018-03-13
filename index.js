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
for(var i = 0; i <= process.argv.length; i++) {
  if(typeof process.argv[i] !== "undefined" && process.argv[i].startsWith("--configfile=")) {
    var configFile = process.argv[i].replace("--configfile=", "");
  }
}

var config = require("./lib/config.js")(configFile, true);
require("./lib/init.js")(pjson,config);

// # Requirements/Init # //
process.stdin.resume();
process.stdin.setEncoding("utf8");

// # Discord # //
const { ShardingManager } = require("discord.js");
var token = config.token;
const manager = new ShardingManager(`${__dirname}/shard.js`, { totalShards: config["shard-count"], token, shardArgs: [configFile] });

manager.spawn()
.catch((err) => {
  var warning = "";

  if(err === "Error: 401 Unauthorized") {
    warning += "\nPlease double-check your token and try again.";
  }

  console.error("Discord client login failed - " + err + warning);

  process.exit();
});

manager.on("launch", (shard) => {
  console.log(`Successfully launched shard ${shard.id} of ${manager.totalShards-1}`);
});

// # Console Functions # //
process.stdin.on("data", (text) => {
  if(text.toString() === "stop\r\n" || text.toString() === "exit\r\n" || text.toString() === "stop\n" || text.toString() === "exit\n")
  {
    process.exit();
    //if(Object.keys(global.game).length === 0) {
    //  process.exit();
    //}
    //else {
    //  console.log("There are\x1b[1m " + Object.keys(global.game).length + " \x1b[0mgame(s) in progress, bot will not close.\nType 'forceexit' to override.");
    //}
  }
  else if(text.toString() === "forceexit\r\n") {
    process.exit();
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
