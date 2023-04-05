const PlatformDiscord = require("./discord_main.js");
const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
const CommandHandler = require("./discord_commands.js");

var configData = require("../config.js")(process.argv[2]);
var config = configData.config;
var intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessageReactions];

const interactionThreshold = 1500;

if(!config["fallback-intents"]) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages);

  if(!config["use-slash-commands"]) {
    intents.push(GatewayIntentBits.MessageContent);
  }
}

const client = new Client({
  intents,
  partials: [ Partials.Channel ],
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
client.login(client.token)
.catch((error) => {
  if(error.code === "DisallowedIntents") {
    console.error("You are using text command mode (use-slash-commands = false), but your application appears to have message content intents disabled. Without this, TriviaBot cannot read commands.\n\nTo fix this, turn on 'use-slash-commands' in your config, or open https://discord.com/developers/applications/ and do the following: Select your bot -> Open the \"Bot\" tab -> Find \"Message Content Intent\" and turn it on.");

    process.exit();
  }

  throw error;
});

process.title = `Trivia - Shard ${client.shard.ids} (Initializing)`;

client.on("ready", async () => {
  let clientStr = `Shard ${client.shard.ids}`;

  const useDebug = config["debug-mode"] && config["debug-slash-commands"] !== "";

  // Slash command initialization
  Trivia.discordCommandHandler = new CommandHandler(client, client.token, config["debug-slash-commands-guild"]);
  if(config["use-slash-commands"] && client.shard.ids[0] === 0) {
    Trivia.discordCommandHandler.postCommands(useDebug);
  }
  
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
    const prefix = config["use-slash-commands"] ? "/" : config.prefix;
    client.user.setPresence({ activities: [{ name: "Trivia! Type '" + prefix + "help' to get started.", type: 0 }] });
  }

  if(config["enable-listings"]) {
    Trivia.postStats();
  }
});

client.on("shardDisconnect", (event) => {
  console.log("Discord client disconnected with code " + event.code);
  
  if(event.reason !== "" && typeof event.reason !== "undefined") {
    console.log("Disconnect reason: " + event.reason);
  }
});

client.on("error", (err) => {
  console.log("Discord client error: " + err);
  console.log(err);
  
  process.exit();
});

client.on("messageCreate", async (msg) => {
  if (msg.channel.partial) {
    msg = await msg.channel.fetch();
  }

  var str = msg.toString().toUpperCase();

  if(msg.channel.type === ChannelType.GuildText || msg.channel.type === ChannelType.DM) {
    Trivia.parseText(str, msg);
  }
});

client.on("messageReactionAdd", (reaction, user) => {
  Trivia.reactionAdd(reaction, user);
});

async function onButtonPress(interaction) {
  let timeReplying = null;
  let timeReplied = null;

  const onReplying = () => {
    timeReplying = new Date();
  };

  const onReplied = () => {
    timeReplied = new Date();

    const rtt = timeReplied-interaction.createdAt;
    if(rtt > interactionThreshold) {
      console.warn(`WARNING: Took a long time (>${interactionThreshold}ms) to reply to a button interaction!`
      + `\n=== Total RTT: ${rtt} ===\n- Receive time: ${timeReceived-interaction.createdAt}`
      + `\n- Handling time: ${timeReplying-timeReceived}\n- Reply time: ${timeReplied-timeReplying}`);
    }
  };
  
  const timeReceived = new Date();
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
        const offTime = now-interaction.message.createdAt;
        console.warn(`Received a late repsonse ${offTime}ms after round end. Ignoring and sending "This round has already ended" to user. Source: ${interaction.user.id}`);
      }

      try {
        onReplying();
        await interaction.reply({ content: "This round has already ended.", ephemeral: true});
        onReplied();
      }
      catch(err) {
        console.log(`Failed to reply to interaction: (${err}). This will be ignored.`);
      }

      return;
    }

    try {
      if(participants === 1) {
        onReplying();
        await interaction.update("Answered!");
        onReplied();
      }
      else {
        onReplying();
        await interaction.update(`${participants} answers`);
        onReplied();
      }
    }
    catch(err) {
      console.log(`Failed to update interaction: (${err}). Answer will still be counted.`);
    }
  }
}

client.on("interactionCreate", async interaction => {
	if (interaction.isButton()) {
    onButtonPress(interaction);
  }
  else if(interaction.isChatInputCommand()) {
    Trivia.parseSlash(interaction.commandName, interaction);
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
