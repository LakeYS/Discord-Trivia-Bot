const Discord = require("discord.js");
const Listings = require("./lib/listings_discord");
const { Client, Intents } = Discord;

var Config = require("./lib/config.js")(process.argv[2]).config;
var intents = new Intents(["GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS"]);

global.client = new Client({
  intents: intents,
  retryLimit: 3,
  messageCacheMaxSize: 50
});

global.Trivia = require("./triviabot.js");

if(Config["debug-log"]) {
  global.client.on("debug", (info) => {
    console.log("DEBUG [" + global.client.shard.ids + "]: " + info);
  });
}

// # Custom Package Loading # //
if(typeof Config["additional-packages"] !== "undefined") {
  Config["additional-packages"].forEach((key) => {
    require(key)(global.Trivia);
  });
}

// # Discord Client Login # //
global.client.login(global.client.token);
process.title = `Trivia - Shard ${global.client.shard.ids} (Initializing)`;

global.client.on("ready", async () => {
  console.log("Shard " + global.client.shard.ids + " connected to\x1b[1m " + global.client.guilds.cache.size + " \x1b[0mserver" + (global.client.guilds.cache.size===1?"":"s") + ".");

  process.title = `Trivia - Shard ${global.client.shard.ids}`;

  if(global.client.user.avatar === null) {
    console.log("Set profile image to profile.png");
    global.client.user.setAvatar("./profile.png");
  }

  global.client.user.setPresence({ activities: [{ name: "Trivia! Type '" + Config.prefix + "help' to get started.", type: 0 }] });

  // # Post Stats # //
  if(Config["enable-listings"]) {
    var listings = new Listings(global.client.user.id);
    for(var site in Config["listing-tokens"]) {
      listings.setToken(site, Config["listing-tokens"][site]);
    }

    if(global.client.shard.ids[0] === global.client.shard.count-1) {
      var countArray = await global.client.shard.fetchClientValues("guilds.cache.size");
      var guildCount = countArray.reduce((prev, val) => prev + val, 0);

      listings.postBotStats(guildCount, global.client.shard.ids.length);
    }
  }
});

global.client.on("shardDisconnect", (event) => {
  console.log("Discord client disconnected with code " + event.code);
  
  if(event.reason !== "" && typeof event.reason !== undefined) {
    console.log("Disconnect reason: " + event.reason);
  }
});

global.client.on("error", (err) => {
  console.log("Discord client error: " + err.message);

  global.Trivia.exportGame();
  process.exit();
});

global.client.on("messageCreate", (msg) => {
  var str = msg.toString().toUpperCase();

  if(msg.channel.type === "GUILD_TEXT" || msg.channel.type === "DM") {
    global.Trivia.parse(str, msg);
  }
});

global.client.on("messageReactionAdd", (reaction, user) => {
  global.Trivia.reactionAdd(reaction, user);
});

global.client.on("interactionCreate", interaction => {
	if (!interaction.isButton()) return;

  if(interaction.customId.startsWith("answer_")) {
    var answer = interaction.customId.replace("answer_", "");
    var participants = global.Trivia.buttonPress(interaction.message, answer, interaction.user.id, interaction.member.displayName);

    if(participants === -1) {
      interaction.reply({ content: "This round has already ended.", ephemeral: true});
      return;
    }

    if(participants === 1) {
      interaction.update("Answered!");
    }
    else {
      interaction.update(`${participants} answers received`);
    }
  }

});

global.client.on("guildCreate", () => {
  if(!Config["stat-guild-recording"]) {
    return;
  }

  var date = new Date();
  var key = "created" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  global.client.shard.send({stats: { [key]: 1 }});
});

global.client.on("guildDelete", () => {
  if(!Config["stat-guild-recording"]) {
    return;
  }
  
  var date = new Date();
  var key = "deleted" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  global.client.shard.send({stats: { [key]: 1 }});
});
