/*jshint esversion: 6 */
/*jshint evil:true */

// # Requirements/Init #
process.stdin.resume();
process.stdin.setEncoding('utf8');

const pjson = require("./package.json");

const Discord = require("discord.js");
const client = new Discord.Client();

client.on("message", msg => {
  if(msg.channel.type == "text") {

  }
});

//client.login(config.token);

// # Initialize Config #
configFile = "./config.json";

for(i = 0; i <= process.argv.length; i++) {
  if(process.argv[i] !== undefined && process.argv[i].startsWith("--configfile=")) {
    var configFile = process.argv[i].replace("--configfile=", "");
    console.log(configFile);
  }
}

config = require(configFile);


// # Console Functions #
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
