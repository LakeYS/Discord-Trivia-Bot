const Discord = require("discord.js");
global.client = new Discord.Client();
global.Trivia = require("./triviabot.js");
const snekfetch = require("snekfetch");

var Config = require("./lib/config.js")(process.argv[2]).config;

if(Config["fallback-mode"] && Config["debug-mode"]) {
  require("./lib/failover_client.js")(Config);
}
else if(Config["debug-mode"]) {
  require("./lib/failover_server.js");
}

// # Post to Bot Listings # //
function postBotStats() {
  // The following sites only need the total shard count, so we'll only post using the last shard.

  // TODO: Fix this for when shards spawn out of order
  if(global.client.shard.id === global.client.shard.count-1) {
    global.client.shard.fetchClientValues("guilds.size")
    .then((countArray) => {
      var guildCountVal = countArray.reduce((prev, val) => prev + val, 0);
      var id = global.client.user.id;

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
            console.log(`Error occurred while posting to ${err.request.connection.servername} on shard ${global.client.shard.id}:\n${err}`);

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

// # Beta/Private Mode # //
// NOTE: Not compatible with multiple shards if using external authentication.
async function guildBetaCheck(guild, skipRefresh) {
  if(typeof Config.betaAuthorizedRefresh === "function") {
    // If initializing, we only need to refresh once.
    if(!skipRefresh) {
      await Config.betaAuthorizedRefresh();
    }
    Config.guildBetaCheck(guild);
  }
  else if(Config["beta-require-external-function"]) {
    console.error("ERROR: Unable to refresh beta authorized list. Skipping auth process.");

    // Auto-reject guilds that were just added in the last 60s.
    if(new Date().getTime()-60000 < guild.joinedAt.getTime()) {
      console.log(`Guild ${guild.id} (${guild.name}) REJECTED (Unable to authenticate, auto-rejected)`);
      guild.leave();
    }
    return;
  }
}

if(Config["beta-mode"]) {
  global.client.on("guildCreate", (guild) => {
    setTimeout(() => {
      guildBetaCheck(guild);
    }, 1000);
  });
}

// # Discord Client Login # //
global.client.login(global.client.token);

global.client.on("ready", () => {
  console.log("Shard " + global.client.shard.id + " connected to\x1b[1m " + global.client.guilds.size + " \x1b[0mserver" + (global.client.guilds.size===1?"":"s") + ".");

  process.title = `Shard ${global.client.shard.id} - TriviaBot`;

  if(global.client.user.avatar === null) {
    console.log("Set profile image to profile.png");
    global.client.user.setAvatar("./profile.png");
  }

  global.client.user.setPresence({ game: { name: "Trivia! Type '" + Config.prefix + "help' to get started.", type: 0 } });

  if(Config["beta-mode"]) {
    var skip = false;
    global.client.guilds.forEach((guild) => {
      guildBetaCheck(guild, skip);
      skip = true;
    });
  }

  postBotStats();
});

global.client.on("disconnect", (event) => {
  if(event.code !== 1000) {
    console.log("Discord global.client disconnected with reason: " + event.reason + " (" + event.code + ").");
    process.exit();
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
