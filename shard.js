const Discord = require("discord.js");
const { Client } = Discord;
const snekfetch = require("snekfetch");

var Config = require("./lib/config.js")(process.argv[2]).config;

global.client = new Client({
  retryLimit: 3,
  messageCacheMaxSize: 50
});

global.Trivia = require("./triviabot.js");

if(Config["fallback-mode"] && Config["debug-mode"]) {
  require("./lib/failover_client.js")(Config);
}
else if(Config["debug-mode"]) {
  require("./lib/failover_server.js");
}

if(Config["debug-log"]) {
  global.client.on("debug", (info) => {
    console.log("DEBUG [" + global.client.shard.ids + "]: " + info);
  });
}

// # Post to Bot Listings # //
function postBotStats() {
  // The following sites only need the total shard count, so we'll only post using the last shard.

  // TODO: Fix this for when shards spawn out of order
  if(global.client.shard.ids[0] === global.client.shard.count-1) {
    global.client.shard.fetchClientValues("guilds.size")
    .then((countArray) => {
      var guildCountVal = countArray.reduce((prev, val) => prev + val, 0);
      var id = global.client.user.id;

      if(guildCountVal > 1) {
        console.log("===== Posting guild count of\x1b[1m " + guildCountVal + "\x1b[0m =====");
      }

      var listings = {
        // If 'data' not specified, assume it is this: { server_count: guildCount }
        "botsfordiscord.com": {
          url: `https://botsfordiscord.com/api/bot/${id}/`
        },
        "botlist.space": {
          url: `https://botlist.space/api/bots/${id}/`
        },
        "discordbots.group": {
          url: `https://discordbots.group/api/bot/${id}`,
          data: { count: guildCountVal }
        },
        "discord.bots.gg": {
          url: `https://discord.bots.gg/api/v1/bots/${id}/stats`,
          data: { guildCount: guildCountVal }
        },
        "discordbots.org": {
          url: `https://discordbots.org/api/bots/${id}/stats`
        },
        "discordbot.world": {
          url: `https://discordbot.world/api/bot/${id}/stats`
        }
      };

      for(var site in listings) {
        if(Config[`${site}-token`] && Config[`${site}-token`] !== "optionaltokenhere") {
          var data = listings[site].data || { server_count: guildCountVal };

          snekfetch.post(listings[site].url)
          .set("Authorization", Config[`${site}-token`])
          .send(data)
          .catch((err) => {
            console.log(`Error occurred while posting to ${err.request.connection.servername} on shard ${global.client.shard.ids}:\n${err}`);

            if(typeof err.text !== "undefined") {
              console.log("Response included with the error: " + err.text);
            }
          })
          .then((res) => {
            if(typeof res !== "undefined") {
              console.log(`Posted to site ${res.request.connection.servername}, received response: ${res.text}`);
            }
          });
        }
      }
    });
  }
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

global.client.on("ready", () => {
  console.log("Shard " + global.client.shard.ids + " connected to\x1b[1m " + global.client.guilds.cache.size + " \x1b[0mserver" + (global.client.guilds.cache.size===1?"":"s") + ".");

  process.title = `Trivia - Shard ${global.client.shard.ids}`;

  if(global.client.user.avatar === null) {
    console.log("Set profile image to profile.png");
    global.client.user.setAvatar("./profile.png");
  }

  global.client.user.setPresence({ activity: { name: "Trivia! Type '" + Config.prefix + "help' to get started.", type: 0 } });

  postBotStats();
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

global.client.on("message", (msg) => {
  var str = msg.toString().toUpperCase();

  if(msg.channel.type === "text" || msg.channel.type === "dm") {
    global.Trivia.parse(str, msg);
  }
});

global.client.on("messageReactionAdd", (reaction, user) => {
  global.Trivia.reactionAdd(reaction, user);
});
