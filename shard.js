const Discord = require("discord.js");
global.client = new Discord.Client();
global.Trivia = require("./triviabot.js");
const snekfetch = require("snekfetch");

var config = require("./lib/config.js")(process.argv[2]);

// # Post to Bot Listings # //
function postBotStats() {
  var success = 0;

  // ## bots.discord.pw ## //
  if(config["bots.discord.pw-token"] && config["bots.discord.pw-token"] !== "optionaltokenhere")
  {
    snekfetch.post("https://bots.discord.pw/api/bots/" + global.client.user.id + "/stats")
      .set("Authorization", config["bots.discord.pw-token"])
      .send({
        shard_id: global.client.shard.id,
        shard_count: global.client.shard.count,
        server_count: global.client.guilds.size
      }).catch((err) => {
        console.log("Error occurred while posting to bots.discord.pw on shard " + global.client.shard.id + ":\n" + err);
      })
      .then(() => {
        success++;
      });

      console.log(`Shard ${global.client.shard.id} posted to ${success} listings.`);
  }

  // ## discordbots.org ## //
  if(config["discordbots.org-token"] && config["discordbots.org-token"] !== "optionaltokenhere")
  {
    snekfetch.post("https://discordbots.org/api/bots/" + global.client.user.id + "/stats")
      .set("Authorization", config["discordbots.org-token"])
      .send({
        shard_id: global.client.shard.id,
        shard_count: global.client.shard.count,
        server_count: global.client.guilds.size
      }).catch((err) => {
        console.log("Error occurred while posting to discordbots.org on shard " + global.client.shard.id + ":\n" + err);
      })
      .then(() => {
        success++;
      });
  }
}

// # Discord Client Login # //
global.client.login(global.client.token);

global.client.on("ready", () => {
  console.log("Shard " + global.client.shard.id + " connected to\x1b[1m " + global.client.guilds.size + " \x1b[0mserver" + (global.client.guilds.size===1?"":"s") + ".");

  if(global.client.user.avatar == null) {
    console.log("Set profile image to profile.png");
    global.client.user.setAvatar("./profile.png");
  }

  global.client.user.setPresence({ game: { name: "Trivia! Type '" + config.prefix + "help' to get started.", type: 0 } });

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
    var id = process.pid;
    if(global.client.shard !== null) {
      id = id + ":" + global.client.shard.id;
    }

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
    else if(text.toString() === "importall\r\n" || text.toString() === "importall\n") {
      console.log("Importing game for all processes...");
      global.client.shard.broadcastEval("global.Trivia.importGame(\"./game.\" + global.client.shard.id + \".json.bak\");")
      .catch((err) => {
        console.error(err);
      });
    }
    else {
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
//global.client.shard.manager.on("message", (msg) => {
//  console.log(`Message on ${global.client.shard.id}!: ${msg}`);
//});
