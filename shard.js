/*jshint esversion: 6 */
/*jshint evil:true */

const Discord = require("discord.js");
client = new Discord.Client();
const trivia = require("./discord-trivia-func.js");

config = require(process.argv[2]);

if(config.prefix == undefined)
  config.prefix = "trivia ";

client.login(client.token);

client.on('ready', () => {
  console.log('Discord client connected to\x1b[1m ' + client.guilds.size + ' \x1b[0mserver' + (client.guilds.size==1?'':'s') + '.');

  if(client.user.avatar == null) {
    console.log("Set profile image to profile.png");
    client.user.setAvatar("./profile.png");
  }

  client.user.setPresence({ game: { name: "Trivia! Type '" + config.prefix + "help' to get started.", type: 0 } });

  // TODO: Fix posting and guild count check
  postBotStats();

  //if(client.guilds.size == 0)
  //  console.log("********\nWARNING: The bot is currently not in a Discord server. You can invite it to a guild using this invite link:\nhttps://discordapp.com/oauth2/authorize?client_id=" + client.user.id + "&scope=bot\n********");
});

client.on('disconnect', function(event) {
  if(event.code != 1000) {
    console.log("Discord client disconnected with reason: " + event.reason + " (" + event.code + "). Attempting to reconnect in 6s...");
    setTimeout(function(){ client.login(config.token); }, 6000);
  }
});

client.on('error', function(err) {
  console.log("Discord client error '" + err.code + "'. Attempting to reconnect in 6s...");

  client.destroy();
  setTimeout(function(){ client.login(config.token); }, 6000);
});

client.on("message", msg => {
  str = msg.toString().toUpperCase();

  if(msg.channel.type == "text" || msg.channel.type == "dm") {
    trivia.parse(str, msg);
  }
});

client.on('messageReactionAdd', (reaction, user) => {
  trivia.reactionAdd(reaction, user);
});

// # Console Functions # //
process.stdin.on('data', function (text) {
  if(text.toString() == "stop\r\n" || text.toString() == "exit\r\n" || text.toString() == "stop\n" || text.toString() == "exit\n")
  {
    // TRIVIABOT override: Don't shut down if a game is in progress.
    if(Object.keys(game).length == 0)
      process.exit();
    else
      console.log("There are\x1b[1m " + Object.keys(game).length + " \x1b[0mgame(s) in progress, bot will not close.\nType 'forceexit' to override.");
  }
  else if(text.toString() == "forceexit\r\n") // TRIVIABOT override: Check for 'forceexit'
    process.exit();
  else {
    client.shard.broadcastEval(text.toString())
    .then(res => {
      console.log(res);
    })
    .catch(err => {
      console.log("Eval err " + err);
    });
  }
});

// # Post to Bot Listings # //
function postBotStats() {
  // ## bots.discord.pw ## //
  if(config['bots.discord.pw-token'] && config['bots.discord.pw-token'] !== "optionaltokenhere")
  {
    snekfetch.post("https://bots.discord.pw/api/bots/" + client.user.id + "/stats")
      .set('Authorization',config['bots.discord.pw-token'])
      .send({
        shard_id: client.shard.id,
        shard_count: client.shard.count,
        server_count: client.guilds.size
      }).catch(err => {
        console.log("Error occurred while posting to bots.discord.pw on shard " + client.shard.id + ":\n" + err);
      });
  }

  // ## discordbots.org ## //
  if(config['discordbots.org-token'] && config['discordbots.org-token'] !== "optionaltokenhere")
  {
    snekfetch.post("https://discordbots.org/api/bots/" + client.user.id + "/stats")
      .set('Authorization',config['discordbots.org-token'])
      .send({
        shard_id: client.shard.id,
        shard_count: client.shard.count,
        server_count: client.guilds.size
      }).catch(err => {
        console.log("Error occurred while posting to discordbots.org on shard " + client.shard.id + ":\n" + err);
      });
  }
}
