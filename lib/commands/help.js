const pjson = require("../../package.json");
const { MessageActionRow, MessageButton } = require("discord.js");

function buildHelpButtons() {
  var buttons = new MessageActionRow();

  buttons.addComponents(
    new MessageButton()
    .setLabel("Add TriviaBot to a server")
    .setURL("https://lakeys.net/triviabot/invite")
    .setStyle("LINK"),
    new MessageButton()
    .setLabel("Become a Patron")
    .setURL("https://www.patreon.com/LakeYS")
    .setStyle("LINK"),
    new MessageButton()
    .setLabel("Contribute questions")
    .setURL("http://lakeys.net/triviabot/contribute")
    .setStyle("LINK"),
    new MessageButton()
    .setLabel("Support TriviaBot by voting on Top.gg!")
    .setURL("https://top.gg/bot/337654994461261825/vote")
    .setStyle("LINK"),
  );
  return [ buttons ];
}

module.exports = (config, Trivia, client) => {

  return async function(msg, Database) {
    Trivia.postStat("commandHelpCount", 1);

    // Question count
    var apiCountGlobal;
    try {
      var json = await Database.getGlobalCounts();
      apiCountGlobal = json.overall.total_num_of_verified_questions;
    }
    catch(err) {
      console.log(`Error while parsing help cmd apiCountGlobal: ${err.message}`);
      apiCountGlobal = "*(unknown)*";
    }

    // Guild count
    var guildCount;
    try {
      var guildCountArray = await client.shard.fetchClientValues("guilds.cache.size");
      guildCount = guildCountArray.reduce((prev, val) => prev + val, 0);
    }
    catch(err) {
      console.log(`Error while parsing help cmd guildCount: ${err.message}`);
      guildCount = "*(unknown)*";
    }
    
    var footerTemplate = `* = optional  •  Total questions: ${apiCountGlobal.toLocaleString()}`;

    if(typeof guildCount === "string" || guildCount !== 1) {
      footerTemplate = `${footerTemplate}  •  Total servers: ${guildCount.toLocaleString()}`;
    }

    if(client.shard.count !== 1) {
      footerTemplate = `${footerTemplate}  •  Shard ${client.shard.ids}`;
    }

    var footer = `${footerTemplate}  •  Measuring response time...`;

    const body = `Let's play trivia! Type \`${config.prefix}play\` to start a game.\nTriviaBot ${pjson.version} by [Lake Y](http://lakeys.net). Powered by discord.js ${pjson.dependencies["discord.js"].replace("^","")}` +
    `${config.databaseURL==="https://opentdb.com"?" and OpenTDB.":"."}`;

    var embed = {
      color: Trivia.embedCol,
      fields: [ 
        { name: ":game_die:  Game Commands", 
          value: `\`${config.prefix}play (category*)\`\n\`${config.prefix}play hangman (category*)\`\n\`${config.prefix}play advanced\``,
          inline: true
        },
        { name: ":tools:  Other Commands", 
          value: `\`${config.prefix}help\`\n\`${config.prefix}categories\`\n\`${config.prefix}stop (#channel*)\`\n${typeof config["additional-packages"] !== "undefined" && config["additional-packages"].length !== 0?", " +
          `\`${config.prefix}league help\``:""}`,
          inline: true
        }
      ],
      description: body,
      footer: { text: footer }
    };
    
    var components = buildHelpButtons();
    var tBefore = Date.now();

    Trivia.send(msg.channel, msg.author, {embed, components})
    .then((sent) => {
      if(sent === null) return;
      var tAfter = Date.now();
      var responseTime = tAfter-tBefore;

      embed.footer.text = `${footerTemplate}  •  Response time: ${responseTime}ms`;

      if(typeof sent !== "undefined") {
        sent.edit({embeds: [embed]});
      }
    });
  };
};
