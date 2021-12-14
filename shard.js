const Discord = require("discord.js");
const { Client, Intents } = Discord;

var Config = require("./lib/config.js")(process.argv[2]).config;
var intents = ["GUILDS", "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGE_REACTIONS"];

if(!Config["fallback-intents"]) {
  intents.push("GUILD_MESSAGES", "DIRECT_MESSAGES");
}

global.client = new Client({
  intents: new Intents(intents),
  partials: [ "CHANNEL" ],
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
  var clientStr = `Shard ${global.client.shard.ids}`;

  if(global.client.shard.count === 1) {
    clientStr = "TriviaBot";
  }

  console.log(clientStr + " connected to\x1b[1m " + global.client.guilds.cache.size + " \x1b[0mserver" + (global.client.guilds.cache.size===1?"":"s") + ".");

  process.title = `Trivia - Shard ${global.client.shard.ids}`;

  if(global.client.user.avatar === null) {
    console.log("Set profile image to profile.png");
    global.client.user.setAvatar("./profile.png");
  }

  global.client.user.setPresence({ activities: [{ name: "Trivia! Type '" + Config.prefix + "help' to get started.", type: 0 }] });

  // # Post Stats # //
  if(Config["enable-listings"]) {
    global.Trivia.postStats();
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

global.client.on("messageCreate", async (msg) => {
  if (msg.channel.partial) {
    msg = await msg.channel.fetch();
  }

  var str = msg.toString().toUpperCase();

  if(msg.channel.type === "GUILD_TEXT" || msg.channel.type === "DM") {
    global.Trivia.parse(str, msg);
  }
});

global.client.on("messageReactionAdd", (reaction, user) => {
  global.Trivia.reactionAdd(reaction, user);
});

global.client.on("interactionCreate", async interaction => {
	if (!interaction.isButton()) return;
  if (global.Trivia.isFallbackMode(interaction.channel.id)) return;

  if(interaction.customId.startsWith("answer_")) {
    var answer = interaction.customId.replace("answer_", "");
    var name = global.Trivia.filterName(interaction.member !== null?interaction.member.displayName:interaction.user.username);
    
    var participants = global.Trivia.buttonPress(interaction.message, answer, interaction.user.id, name);

    if(participants === -1) {
      var now = new Date();
      // If this was a recent round, display a warning.
      if(now.getTime() < interaction.message.createdAt.getTime()+60000) {
        console.warn(`Received late response for a recent round that has already ended. Source: ${interaction.user.username} (${interaction.user.id})`
        + `\nTiming (curr | message): ${now} | ${interaction.message.createdAt}`);
      }

      try {
        await interaction.reply({ content: "This round has already ended.", ephemeral: true});
      }
      catch(err) {
        console.log(`Failed to reply to interaction: (${err}). This will be ignored.`);
      }

      return;
    }

    try {
      if(participants === 1) {
        await interaction.update("Answered!");
      }
      else {
        await interaction.update(`${participants} answers`);
      }
    }
    catch(err) {
      console.log(`Failed to update interaction: (${err}). Answer will still be counted.`);
    }
  }
});

global.client.on("guildCreate", () => {
  if(!Config["stat-guild-recording"]) {
    return;
  }

  var date = new Date();
  var key = "created" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  global.Trivia.postStat(key, 1);
});

global.client.on("guildDelete", () => {
  if(!Config["stat-guild-recording"]) {
    return;
  }
  
  var date = new Date();
  var key = "deleted" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  global.Trivia.postStat(key, 1);
});
