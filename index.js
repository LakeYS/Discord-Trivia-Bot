/*jshint esversion: 6 */

const pjson = require("./package.json");

// Note that the spacing of the artwork will mess up with double-digit version numbers (such as '1.10.0')
if(process.stdout.columns > 61)
  console.log("                 ########\n            ##################\n         ###      #######     ###\n       ###    ###############   ###\n     ###    ####################  ###\n    ###     #########    ########  ###\n   ###     ########      ########   ###\n  ###       #####       ########     ###\n ###                  ##########      ### \x1b[7m TriviaBot " + pjson.version + "   \x1b[0m\n ###               ###########        ### \x1b[7m By Lake Y         \x1b[0m\n ###              #########           ### \x1b[7m http://lakeys.net \x1b[0m\n  ###             ########           ###\n   ###            ######            ###\n    ###            ####            ###\n      ###         ######         ###\n        ###      #######       ###\n          #####    ####    #####\n               ############\n                  ######");
else
  console.log("                 ########\n            ##################\n         ###      #######     ###\n       ###    ###############   ###\n     ###    ####################  ###\n    ###     #########    ########  ###\n   ###     ########      ########   ###\n  ###       #####       ########     ###\n ###                  ##########      ###\n ###               ###########        ###\n ###              #########           ###\n  ###             ########           ###\n   ###            ######            ###\n    ###            ####            ###\n      ###         ######         ###\n        ###      #######       ###\n          #####    ####    #####\n               ############\n                  ######\n\x1b[7m TriviaBot " + pjson.version + "   \x1b[0m\n\x1b[7m By Lake Y         \x1b[0m\n\x1b[7m http://lakeys.net \x1b[0m");

const https = require("https");
const snekfetch = require("snekfetch");

process.title = "TriviaBot " + pjson.version;

// # Initialize Config # //
configFile = "./config.json";

for(var i = 0; i <= process.argv.length; i++) {
  if(process.argv[i] !== undefined && process.argv[i].startsWith("--configfile=")) {
    var configFile = process.argv[i].replace("--configfile=", "");
  }
}

config = require(configFile);

// # Version Check # //
skipVersionCheck = 0;

if(!config['disable-version-check']) {
  // If, for whatever reason, semver-compare isn't installed, we'll skip the version check.
  try {
    semver = require('semver-compare');
  } catch(err) {
    if(err.code == 'MODULE_NOT_FOUND') {
      console.warn("********\nWARNING: semver-compare module not found. The version check will be skipped.\nMake sure to keep the bot up-to-date! Check here for newer versions:\n\x1b[1m https://github.com/LakeYS/Discord-Trivia-Bot/releases \x1b[0m\n********");
      skipVersionCheck = 1;
    }
    else
      throw(err);
  }

  if(!skipVersionCheck) {
    var options = {
      host: 'api.github.com',
      path: '/repos/LakeYS/Discord-Trivia-Bot/releases/latest',
      method: 'GET',
      headers: {'user-agent':'Discord-Trivia-Bot'}
    };

    var input = "";
    json = "";
    var request = https.request(options, (res) => {
      res.on('data', (data) => {
        input = input + data; // Combine the data
      });
      res.on('error', (err) => {
        console.log(err);
      });
      res.on('uncaughtException', (err) => {
        console.log(err);
      });

      // Note that if there is an error while parsing the JSON data, the bot will crash.
      res.on('end', function() {
        if(input !== undefined) {
          json = JSON.parse(input.toString());
          if(json.tag_name !== undefined) {
            release = json.tag_name.replace("v",""); // Mark the release

            // Compare this build's version to the latest release.
            var releaseRelative = semver(pjson.version, release);

            if(releaseRelative == 1)
              console.log("********\nNOTICE: You are currently running\x1b[1m v" + pjson.version + "\x1b[0m. This build is considered unstable.\nCheck here for the latest stable versions of this script:\n\x1b[1m https://github.com/LakeYS/Discord-Trivia-Bot/releases \x1b[0m\n********");

            if(releaseRelative == -1)
              console.log("********\nNOTICE: You are currently running\x1b[1m v " + pjson.version + "\x1b[0m. A newer version is available.\nCheck here for the latest version of this script:\n\x1b[1m https://github.com/LakeYS/Discord-Trivia-Bot/releases \x1b[0m\n********");
            } else {
              console.log(json);
              console.warn("WARNING: Unable to parse version data.");
            }
          }
        else {
          console.log(input); // Log the input on error
          console.log("WARNING: Unable to parse version data.");
        }
      });
    });

    request.end();
    process.nextTick(() => {
      request.on('error', (err) => {
        console.log(err);
        console.log("ERROR: Unable to query version data.");
      });
    });
  }
}

// # Requirements/Init # //
process.stdin.resume();
process.stdin.setEncoding('utf8');

const Discord = require("discord.js");
client = new Discord.Client();

// # Discord # //
const { ShardingManager } = require('discord.js');
var token = config.token;
const manager = new ShardingManager(`${__dirname}/shard.js`, { totalShards: 2, token: token, shardArgs: [configFile] });

manager.spawn();
manager.on('launch', shard => {
  console.log(`Successfully launched shard ${shard.id}`);
});

process.on('rejectionHandled', (err) => {
  console.log(err);
  console.log("An error occurred. Reconnecting...");
  client.destroy();
  setTimeout(function(){ client.login(config.token); }, 2000);
});

process.on('exit', function() {
  client.destroy();
});
