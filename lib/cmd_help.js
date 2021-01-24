module.exports = (config) => {

  return async function(msg, Database) {

    global.client.shard.send({stats: { commandHelpCount: 1 }});

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
      var guildCountArray = await global.client.shard.fetchClientValues("guilds.size");
      guildCount = guildCountArray.reduce((prev, val) => prev + val, 0);
    }
    catch(err) {
      console.log(`Error while parsing help cmd guildCount: ${err.message}`);
      guildCount = "*(unknown)*";
    }

    // Commands and links
    const stringPatreon = "([Support TriviaBot on Patreon](https://www.patreon.com/LakeYS)) ([Contribute questions to the database](http://lakeys.net/triviabot/contribute))";

    const stringHelp = `Let's play trivia! Type '${config.prefix}play' to start a game.\n` +
      `There are ${apiCountGlobal.toLocaleString()} total questions. Currently in ${guildCount.toLocaleString()} server${guildCount!==1?"s":""}.\n` +
      `\n` +
      `Commands: \`${config.prefix}play <category>\`, \`${config.prefix}play advanced\`, \`${config.prefix}help\`, \`${config.prefix}categories\`,\n` +
      `\`${config.prefix}stop <#channel>\`, \`${config.prefix}ping\`${typeof config["additional-packages"] !== "undefined" && config["additional-packages"].length !== 0?`, ` +
      `\`${config.prefix}league help\``:``}\n` +
      `\n` +
      `_Bot by [Lake Y](http://lakeys.net). Powered by discord.js${config.databaseURL==="https://opentdb.com"?` and the [Open Trivia Database](https://opentdb.com/).\n` +
      `${stringPatreon}`:"."}_`;

    return stringHelp;
  };
};
