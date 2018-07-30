const Discord = require("discord.js");
global.client = new Discord.Client();
global.Trivia = require("./triviabot.js");
const snekfetch = require("snekfetch");

var config = require("./lib/config.js")(process.argv[2]);

if(config["fallback-mode"] && config["debug-mode"]) {
  require("./lib/failover_client.js")(config);
}
else if(config["debug-mode"]) {
  require("./lib/failover_server.js");
}

// # Post to Bot Listings # //
function postBotStats() {
  // The following sites only need the total shard count, so we'll only post using the last shard.

  // TODO: Fix this for when shards spawn out of order
  if(global.client.shard.id === global.client.shard.count-1) {
    global.client.shard.fetchClientValues("guilds.size")
    .then((countArray) => {
      var guildCount = countArray.reduce((prev, val) => prev + val, 0);
      var id = global.client.user.id;

      var listings = {
        // If 'data' not specified, assume it is this: { server_count: guildCount }
        "bots.discord.pw": {
          url: `https://bots.discord.pw/api/bots/${id}/stats`
        },
        "discordbots.org": {
          url: `https://discordbots.org/api/bots/${id}/stats`
        },
        "botlist.space": {
          url: `https://botlist.space/api/bots/${id}/`
        },
        "discordbots.co.uk": {
          url: `https://discordbots.co.uk/api/v1/bots/${id}/`
        },
        "botsfordiscord.com": {
          url: `https://botsfordiscord.com/api/v1/bots/${id}/`
        },
        "discordbot.world": {
          url: `https://discordbot.world/api/bot/${id}/stats`
        },
        "listcord.com": {
          url: `https://listcord.com/api/bot/${id}/guilds`,
          data: { guilds: guildCount }
        },
        "discordbots.group": {
          url: `https://discordbots.group/api/bot/${id}`,
          data: { count: guildCount }
        }
      };

      for(var site in listings) {
        if(config[`${site}-token`] && config[`${site}-token`] !== "optionaltokenhere") {
          var data = listings[site].data || { server_count: guildCount };

          snekfetch.post(listings[site].url)
          .set("Authorization", config[`${site}-token`])
          .send(data)
          .catch((err) => {
            console.log(`Error occurred while posting to ${site} on shard ${global.client.shard.id}:\n${err}`);
          });
        }
      }
    });
  }
}

// # Custom Package Loading # //
if(typeof config["additional-packages-shard"] !== "undefined") {
  config["additional-packages-shard"].forEach((key) => {
    require(key)(config["additional-config-passthrough"]?config:void 0);
  });
}

// # Beta/Private Mode # //
// NOTE: Not compatible with multiple shards if using external authentication.
async function guildBetaCheck(guild, skipRefresh) {
  if(typeof config.betaAuthorizedRefresh === "function") {
    // If initializing, we only need to refresh once.
    if(!skipRefresh) {
      await config.betaAuthorizedRefresh();
    }
    config.guildBetaCheck(guild);
  }
  else if(config["beta-require-external-function"]) {
    console.error("ERROR: Unable to refresh beta authorized list. Skipping auth process.");

    // Auto-reject guilds that were just added in the last 60s.
    if(new Date().getTime()-60000 < guild.joinedAt.getTime()) {
      console.log(`Guild ${guild.id} (${guild.name}) REJECTED (Unable to authenticate, auto-rejected)`);
      guild.leave();
    }
    return;
  }
}

if(config["beta-mode"]) {
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

  global.client.user.setPresence({ game: { name: "Trivia! Type '" + config.prefix + "help' to get started.", type: 0 } });

  if(config["beta-mode"]) {
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

// # Console Functions # //
if(config["allow-eval"] === true) {
  process.stdin.on("data", (text) => {
    if(text.toString() === "stop\r\n" || text.toString() === "exit\r\n" || text.toString() === "stop\n" || text.toString() === "exit\n") {
      global.client.shard.send({evalStr: "doExit();"});
    }
    else if(text.toString() === "exportall\r\n" || text.toString() === "exportall\n") {
      console.log("Exporting game for all processes...");
      global.client.shard.broadcastEval("global.Trivia.exportGame();")
      .catch((err) => {
        console.error(err);
      });
    }
    else if(text.toString() === "exportexit\r\n" || text.toString() === "exportexit\n") {
      console.log("Exporting game for all processes...");
      global.client.shard.broadcastEval("global.Trivia.exportGame();")
      .catch((err) => {
        console.error(err);
      })
      .then(() => {
        global.client.shard.send({evalStr: "doExit();"});
      });
    }
    else if(text.toString() === "importall\r\n" || text.toString() === "importall\n") {
      console.log("Importing game for all processes...");
      global.client.shard.broadcastEval("global.Trivia.importGame(\"./game.\" + global.client.shard.id + \".json.bak\");")
      .catch((err) => {
        console.error(err);
      });
    }
    else {
      var id = process.pid;
      if(global.client.shard !== null) {
        id = id + ":" + global.client.shard.id;
      }
      global.client.shard.broadcastEval(text.toString())
      .then((res) => {
        console.log("#" + id + ": " + res);
      })
      .catch((err) => {
        console.log("#" + id + ": Eval err " + err);
      });
    }
  });
}
