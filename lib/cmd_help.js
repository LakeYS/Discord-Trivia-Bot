module.exports = (config) => {
  const infoFooter = "([Support TriviaBot on Patreon](https://www.patreon.com/LakeYS)) ([Contribute questions to the database](http://lakeys.net/triviabot/contribute))";

  // TODO: Refactor this mess (it's getting worse)
  const footerString = `Commands: \`${config.prefix}play <category>\`, \`${config.prefix}play advanced\`, \`${config.prefix}help\`, \`${config.prefix}categories\`, \`${config.prefix}stop <#channel>\`, \`${config.prefix}ping\`${typeof config["additional-packages"] !== "undefined" && config["additional-packages"].length !== 0?`\nType '${config.prefix}league help' for league commands.`:""}
  \n_Bot by [Lake Y](http://lakeys.net). Powered by discord.js ${require("../package.json").dependencies["discord.js"].replace("^","")}\
  ${config.databaseURL==="https://opentdb.com"?` and the [Open Trivia Database](https://opentdb.com/).\n${infoFooter}`:""}_`;

  return async function(msg, Database) {
    var res = `Let's play trivia! Type '${config.prefix}play' to start a game.`;

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
    res = res + `\nThere are ${apiCountGlobal.toLocaleString()} total questions.`;

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
    res = res + ` Currently in ${guildCount.toLocaleString()} guild${guildCount!==1?"s":""}.`;

    // Commands and links
    res = `${res}\n\n${footerString}`;

    return res;
  };
};
