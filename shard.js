const Discord = require("discord.js");
global.client = new Discord.Client();
global.Trivia = require("./triviabot.js");
const snekfetch = require("snekfetch");

var config = require("./lib/config.js")(process.argv[2]);

if(config["fallback-mode"]) {
  require("./lib/failover_client.js")(config);
}
else {
  require("./lib/failover_server.js");
}

// # Post to Bot Listings # //
function postBotStats() {
  // ## bots.discord.pw ## //
  if(config["bots.discord.pw-token"] && config["bots.discord.pw-token"] !== "optionaltokenhere") {
    snekfetch.post("https://bots.discord.pw/api/bots/" + global.client.user.id + "/stats")
    .set("Authorization", config["bots.discord.pw-token"])
    .send({
      shard_id: global.client.shard.id,
      shard_count: global.client.shard.count,
      server_count: global.client.guilds.size
    }).catch((err) => {
      console.log("Error occurred while posting to bots.discord.pw on shard " + global.client.shard.id + ":\n" + err);
    });
  }

  // ## discordbots.org ## //
  if(config["discordbots.org-token"] && config["discordbots.org-token"] !== "optionaltokenhere") {
    snekfetch.post("https://discordbots.org/api/bots/" + global.client.user.id + "/stats")
    .set("Authorization", config["discordbots.org-token"])
    .send({
      shard_id: global.client.shard.id,
      shard_count: global.client.shard.count,
      server_count: global.client.guilds.size
    }).catch((err) => {
      console.log("Error occurred while posting to discordbots.org on shard " + global.client.shard.id + ":\n" + err);
    });
  }

  // The following sites only need the total shard count, so we'll only post using the last shard.
  if(global.client.shard.id === global.client.shard.count-1) {
    global.client.shard.fetchClientValues("guilds.size")
    .then((countArray) => {
      var guildCount = countArray.reduce((prev, val) => prev + val, 0);

      // ## botlist.space ## //
      if(config["botlist.space-token"] && config["botlist.space-token"] !== "optionaltokenhere") {
        snekfetch.post("https://botlist.space/api/bots/" + global.client.user.id + "/")
        .set("Authorization", config["botlist.space-token"])
        .send({
          server_count: guildCount
        }).catch((err) => {
          console.log("Error occurred while posting to botlist.space:\n" + err);
        });
      }

      // ## discordbots.co.uk ## //
      if(config["discordbots.co.uk-token"] && config["discordbots.co.uk-token"] !== "optionaltokenhere") {
        snekfetch.post("https://discordbots.co.uk/api/v1/bots/" + global.client.user.id + "/")
        .set("Authorization", config["discordbots.co.uk-token"])
        .send({
          server_count: guildCount
        }).catch((err) => {
          console.log("Error occurred while posting to discordbots.co.uk:\n" + err);
        });
      }

      // ## botsfordiscord.com ## //
      if(config["botsfordiscord.com-token"] && config["botsfordiscord.com-token"] !== "optionaltokenhere") {
        snekfetch.post("https://botsfordiscord.com/api/v1/bots/" + global.client.user.id + "/")
        .set("Authorization", config["botsfordiscord.com-token"])
        .send({
          server_count: guildCount
        }).catch((err) => {
          console.log("Error occurred while posting to botsfordiscord.com:\n" + err);
        });
      }

      // ## discordbot.world ## //
      if(config["discordbot.world-token"] && config["discordbot.world.com-token"] !== "optionaltokenhere") {
        snekfetch.post("https://discordbot.world/api/bot/" + global.client.user.id + "/stats")
        .set("Authorization", config["discordbot.world-token"])
        .send({
          server_count: guildCount
        }).catch((err) => {
          console.log("Error occurred while posting to discordbot.world:\n" + err);
        });
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
// TODO: Implement authorized count overrides
var authorizedCounts = {};
async function guildBetaCheck(guild, skip) {
  if(typeof config.betaAuthorizedRefresh === "function") {
    if(!skip) {
      // If initializing, we only need to refresh once.
      await config.betaAuthorizedRefresh();
    }
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

  var authorized = guild.members.find((member) => {
    var toReturn = false;
    config["beta-authorized-users"].forEach((id) => {
      if(id.toString() === member.id.toString()) {
        toReturn = true;
      }
    });
    return toReturn;
  });

  if(authorized !== null && typeof authorizedCounts[authorized.user.id] === "undefined") {
    authorizedCounts[authorized.user.id] = 0;
  }

  if(authorized === null || authorizedCounts[authorized.user.id] >= config["beta-authorized-count"]) {
    console.log(`Guild ${guild.id} (${guild.name}) REJECTED`);
    guild.leave();
  }
  else {
    console.log(`Guild ${guild.id} (${guild.name}) AUTHORIZED by user ${authorized.user.id} (${authorized.user.tag})`);
    authorizedCounts[authorized.user.id]++;

    if(typeof config.betaOnAuthorized === "function"){
      config.betaOnAuthorized(authorized.user.id);
    }
  }
}

if(config["beta-mode"]) {
  global.client.on("guildCreate", (guild) => {
    setTimeout(() => {
      guildBetaCheck(guild);
    }, 1000);
  });
}

// TODO: Fix authorizedCounts not decreasing when bot is kicked from a guild

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
