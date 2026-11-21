import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client
} from "discord.js";

import pjson from "../../package.json" with { type: "json" };
import { TriviaInstance } from "../platform/instance_common.js";

/**
 * Creates the button components for the help command.
 *
 * @returns {Array<ActionRowBuilder<any>>} An array containing the components.
 */
function buildHelpButtons() {
  var buttons = new ActionRowBuilder();

  buttons.addComponents(
    new ButtonBuilder()
    .setLabel("Add TriviaBot to a server")
    .setURL("https://lakeys.net/triviabot/invite")
    .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
    .setLabel("Become a Patron")
    .setURL("https://www.patreon.com/LakeYS")
    .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
    .setLabel("Contribute questions")
    .setURL("http://lakeys.net/triviabot/contribute")
    .setStyle(ButtonStyle.Link),
  );
  return [ buttons ];
}

/**
 * Help command export
 *
 * @param {Object<string, any>} config The current config.
 * @param {TriviaInstance} Trivia The client instance.
 * @param {Client} client The discord.js client.
 * @returns {Function} The command function.
 */
export default (config, Trivia, client) => {

  return async function(interactionHelper, Database) {
    await Trivia.postStat("commandHelpCount", 1);

    // Set up the prefix to display through config
    const useSlashCommands = config["use-slash-commands"];
    const prefix = useSlashCommands ? "/" : config["prefix"];

    const stringsSlashGame = {
      triviaPlay: `- \`${prefix}play\` or \`${prefix}hangman\`\n`,
      triviaSetup: `- \`${prefix}setup\`\n`
    };

    const stringsSlashOther = {
      triviaCategories: `- \`${prefix}categories\`\n`,
      triviaFact: `- \`${prefix}fact\`\n`,
      triviaStop: `- \`${prefix}stop\`\n`
    };

    const stringsTextGame = {
      triviaPlay: `- \`${prefix}play (category*)\` or \`${prefix}play hangman (category*)\`\n`,
      triviaSetup: `- \`${prefix}play advanced\`\n`
    };

    const stringsTextOther = {
      triviaCategories: `- \`${prefix}categories\`\n`,
      triviaFact: `- \`${prefix}fact\`\n`,
      triviaStop: `- \`${prefix}stop (channel*)\`\n`
    };

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

    const body = `Let's play trivia! Type \`${prefix}play\` to start a game.\nTriviaBot ${pjson.version} by [Lake Y](http://lakeys.net). Powered by discord.js ${pjson.dependencies["discord.js"].replace("^","")}` +
    `${config.databaseURL==="https://opentdb.com"?" and OpenTDB.":"."}`;

    /** @type {Record<string, string>} */
    const strCmdsGameRaw = useSlashCommands ? stringsSlashGame : stringsTextGame;
    /** @type {Record<string, string>} */
    const strCmdsOtherRaw = useSlashCommands ? stringsSlashOther : stringsTextOther;
    
    /** @type {Record<string, any>} */
    const cfgCmds = config.commands;

    let strCmdsGame = "";
    let strCmdsOther = "";
    
    for(const [key, cmd] of Object.entries(cfgCmds)) {
      if(cmd.enabled) {
        if(strCmdsGameRaw[key]) {
          strCmdsGame += strCmdsGameRaw[key];
        }
        if(strCmdsOtherRaw[key]) {
          strCmdsOther += strCmdsOtherRaw[key];
        }
      }
    }

    const commandsFields = [ 
      // Slash commands fields
      { name: ":game_die:  Game Commands", 
        value: strCmdsGame,
        inline: true
      },
      { name: ":tools:  Other Commands", 
        value: strCmdsOther,
        inline: true
      }
    ];

    var embed = {
      color: Trivia.embedCol,
      fields: commandsFields,
      description: body,
      footer: { text: footerTemplate }
    };
    
    var components = buildHelpButtons();

    if(useSlashCommands) {
      await interactionHelper.maybeReply({embeds: [embed], components}, {direct: true});
    } else {
      await interactionHelper.maybeReply({embeds: [embed], components});
    }
  };
};
