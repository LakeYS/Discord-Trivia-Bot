/*jshint esversion: 6 */
/*jshint evil:true */

// # Requirements/Init # //
process.stdin.resume();
process.stdin.setEncoding('utf8');

const pjson = require("./package.json");

const Discord = require("discord.js");
const client = new Discord.Client();

const trivia = require("./discord-trivia-func.js");

// # Initialize Config # //
configFile = "./config.json";

for(i = 0; i <= process.argv.length; i++) {
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

  //if(Cakeclient_DiscordRelayChannel !== null)
  //  Cakeclient_RelayChannelObject = client.channels.find("id",Cakeclient_DiscordRelayChannel); //Define this so we don't have to find it every time.
});

client.on('disconnect', function() {
  console.log("Client disconnected.");
});

client.on("message", msg => {
  str = msg.toString().toUpperCase();

  if(msg.channel.type == "text") {
    if(str.startsWith("TRIVIA ")) {
      msg.channel.send(trivia.parse(str.substring(7,256), msg));
    }
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
