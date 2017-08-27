/*jshint esversion: 6 */
/*jshint evil:true */

const https = require("https");
const fs = require("fs");
const semver = require("semver-compare");

// # Version Check # //
var options = {
  host: 'api.github.com',
  path: '/repos/LakeYS/Discord-Trivia-Bot/releases/latest',
  method: 'GET',
  headers: {'user-agent':'Discord-Trivia-Bot'}
};

var input = "";
var json = "";
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
          console.log("********\nNOTICE: You are currently running v" + pjson.version + ". This build is considered unstable.\nCheck here for the latest stable versions of this script:\nhttps://github.com/LakeYS/Discord-Trivia-Bot/releases\n********");

        if(releaseRelative == -1)
          console.log("********\nNOTICE: You are currently running v" + pjson.version + ". A newer version is available.\nCheck here for the latest version of this script:\nhttps://github.com/LakeYS/Discord-Trivia-Bot/releases\n********");
        } else {
          console.log(json);
          console.log("ERROR: Unable to parse version data.");
        }
      }
    else {
      console.log(input); // Log the input on error
      console.log("ERROR: Unable to parse version data.");
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

// # Requirements/Init # //
process.stdin.resume();
process.stdin.setEncoding('utf8');

const pjson = require("./package.json");

const Discord = require("discord.js");
const client = new Discord.Client();

const trivia = require("./discord-trivia-func.js");

// # Initialize Config # //
configFile = "./config.json";

for(var i = 0; i <= process.argv.length; i++) {
  if(process.argv[i] !== undefined && process.argv[i].startsWith("--configfile=")) {
    var configFile = process.argv[i].replace("--configfile=", "");
  }
}

config = require(configFile);

// # Discord # //
client.login(config.token);

client.on('ready', () => {
  console.log('TriviaBot connected to ' + client.guilds.size + ' servers. Running v' + pjson.version);

  client.user.setGame("[Type 'trivia help']");
});

client.on('disconnect', function(event) {
  if(event.code != 1000) {
    console.log("Discord client disconnected with reason: " + event.reason + " (" + event.code + "). Attempting to reconnect in 6s...");
    setTimeout(function(){ client.login(token); }, 6000);
  }
});

client.on('error', function(err) {
  console.log("Discord client error '" + err.code + "'. Attempting to reconnect in 6s...");

  client.destroy();
  setTimeout(function(){ client.login(config.token); }, 6000);
});

client.on("message", msg => {
  str = msg.toString().toUpperCase();

  if(msg.channel.type == "text") {
    trivia.parse(str, msg);
  }
});

// # Console Functions # //
process.stdin.on('data', function (text) {
  if(text.toString() == "stop\r\n" || text.toString() == "exit\r\n" || text.toString() == "stop\n" || text.toString() == "exit\n")
    process.exit();
  else {
    try {
      eval(text.toString());
    }
    catch(err) {
      console.log(err);
    }
  }
});

process.on('rejectionHandled', (err) => {
  console.log(err);
  console.log("An error occurred. Reconnecting...");
  client.destroy();
  setTimeout(function(){ client.login(token); }, 2000);
});

process.on('exit', function() {
  client.destroy();
});
