const Discord = require("discord.js");
const PlatformDiscord = require("./discord_main.js");
const { Client, Intents } = Discord;

var Config = require("../config.js")(process.argv[2]).config;
var intents = ["GUILDS", "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGE_REACTIONS"];

if(!Config["fallback-intents"]) {
  intents.push("GUILD_MESSAGES", "DIRECT_MESSAGES");
}

const client = new Client({
  intents: new Intents(intents),
  partials: [ "CHANNEL" ],
  retryLimit: 3,
  messageCacheMaxSize: 50
});

var Trivia = client.Trivia = new PlatformDiscord(client);

if(Config["debug-log"]) {
  client.on("debug", (info) => {
    // Log discord.js debug info
    Trivia.debugLog("Discord [" + client.shard.ids + "]: " + info);
  });
}

// # Custom Package Loading # //
if(typeof Config["additional-packages"] !== "undefined") {
  Config["additional-packages"].forEach((key) => {
    require(key)(Trivia);
  });
}

// # Discord Client Login # //
client.login(client.token);
process.title = `Trivia - Shard ${client.shard.ids} (Initializing)`;

client.on("ready", async () => {
  var clientStr = `Shard ${client.shard.ids}`;

  if(client.shard.count === 1) {
    clientStr = "TriviaBot";
  }

  console.log(clientStr + " connected to\x1b[1m " + client.guilds.cache.size + " \x1b[0mserver" + (client.guilds.cache.size===1?"":"s") + ".");

  process.title = `Trivia - Shard ${client.shard.ids}`;

  if(client.user.avatar === null) {
    console.log("Set profile image to profile.png");
    client.user.setAvatar("./profile.png");
  }

  client.user.setPresence({ activities: [{ name: "Trivia! Type '" + Config.prefix + "help' to get started.", type: 0 }] });

  // # Post Stats # //
  if(Config["enable-listings"]) {
    Trivia.postStats();
  }
});

client.on("shardDisconnect", (event) => {
  console.log("Discord client disconnected with code " + event.code);
  
  if(event.reason !== "" && typeof event.reason !== undefined) {
    console.log("Disconnect reason: " + event.reason);
  }
});

client.on("error", (err) => {
  console.log("Discord client error: " + err.message);
  
  process.exit();
});

client.on("messageCreate", async (msg) => {
  if (msg.channel.partial) {
    msg = await msg.channel.fetch();
  }

  var str = msg.toString().toUpperCase();

  if(msg.channel.type === "GUILD_TEXT" || msg.channel.type === "DM") {
    Trivia.parse(str, msg);
  }
});

client.on("messageReactionAdd", (reaction, user) => {
  Trivia.reactionAdd(reaction, user);
});

client.on("interactionCreate", interaction => {
	if (!interaction.isButton()) return;
  if (Trivia.isFallbackMode(interaction.channel.id)) return;

  if(interaction.customId.startsWith("answer_")) {
    var answer = interaction.customId.replace("answer_", "");
    var name = Trivia.filterName(interaction.member !== null?interaction.member.displayName:interaction.user.username);
    
    var participants = Trivia.buttonPress(interaction.message, answer, interaction.user.id, name);

    if(participants === -1) {
      var now = new Date();
      // If this was a recent round, display a warning.
      if(now.getTime() < interaction.message.createdAt.getTime()+60000) {
        console.warn(`Received late response for a recent round that has timed out or already ended. This user's answer will not be counted. Source: ${interaction.user.username} (${interaction.user.id})`);
      }

      interaction.reply({ content: "This round has already ended.", ephemeral: true});
      return;
    }

    if(participants === 1) {
      interaction.update("Answered!");
    }
    else {
      interaction.update(`${participants} answers`);
    }
  }

});

client.on("guildCreate", () => {
  if(!Config["stat-guild-recording"]) {
    return;
  }

  var date = new Date();
  var key = "created" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  Trivia.postStat(key, 1);
});

client.on("guildDelete", () => {
  if(!Config["stat-guild-recording"]) {
    return;
  }
  
  var date = new Date();
  var key = "deleted" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  Trivia.postStat(key, 1);
});