const Discord = require("discord.js");
const PlatformDiscord = require("./discord_main.js");
const { Client, Intents } = Discord;

var configData = require("../config.js")(process.argv[2]);
var config = configData.config;
var intents = ["GUILDS", "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGE_REACTIONS"];

if(!config["fallback-intents"]) {
  intents.push("GUILD_MESSAGES", "DIRECT_MESSAGES");
}

const client = new Client({
  intents: new Intents(intents),
  partials: [ "CHANNEL" ],
  retryLimit: 3,
  messageCacheMaxSize: 50
});

var Trivia = client.Trivia = new PlatformDiscord(client, configData);

if(config["debug-log"]) {
  client.on("debug", (info) => {
    // Log discord.js debug info
    Trivia.debugLog("Discord [" + client.shard.ids + "]: " + info);
  });
}

// # Custom Package Loading # //
if(typeof config["additional-packages"] !== "undefined") {
  config["additional-packages"].forEach((key) => {
    require(key)(Trivia);
  });
}

// # Discord Client Login # //
client.login(client.token);
process.title = `Trivia - Shard ${client.shard.ids} (Initializing)`;

client.on("ready", async () => {
  var clientStr = `Shard ${client.shard.ids}`;
  
  var app = await client.application.fetch();

  Trivia.on("platform_message", (msg) => { 
    app.owner.send(msg);
  });

  if(client.shard.count === 1) {
    clientStr = "TriviaBot";
  }

  console.log(clientStr + " connected to\x1b[1m " + client.guilds.cache.size + " \x1b[0mserver" + (client.guilds.cache.size===1?"":"s") + ".");

  process.title = `Trivia - Shard ${client.shard.ids}`;

  if(client.user.avatar === null) {
    console.log("Set profile image to profile.png");
    client.user.setAvatar("./profile.png");
  }

  if(!config["disable-discord-presence"]) {
    client.user.setPresence({ activities: [{ name: "Trivia! Type '" + config.prefix + "help' to get started.", type: 0 }] });
  }

  // # Post Stats # //
  if(config["enable-listings"]) {
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

client.on("interactionCreate", async interaction => {
	if (!interaction.isButton()) return;
  if (Trivia.isFallbackMode(interaction.channel.id)) return;

  if(interaction.customId.startsWith("answer_")) {
    var answer = interaction.customId.replace("answer_", "");
    var name = Trivia.filterName(interaction.member !== null?interaction.member.displayName:interaction.user.username);
    
    var participants = Trivia.buttonPress(interaction, answer, interaction.user.id, name);

    // Reject if participants are not returned. This indicates the interaction was cancelled.
    if(typeof participants === "undefined") return;

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

client.on("guildCreate", () => {
  if(!config["stat-guild-recording"]) {
    return;
  }

  var date = new Date();
  var key = "created" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  Trivia.postStat(key, 1);
});

client.on("guildDelete", () => {
  if(!config["stat-guild-recording"]) {
    return;
  }
  
  var date = new Date();
  var key = "deleted" + (parseInt(date.getMonth())+1) + "_" + date.getDate();
  Trivia.postStat(key, 1);
});
