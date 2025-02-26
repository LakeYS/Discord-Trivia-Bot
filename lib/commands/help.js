const pjson = require("../../package.json");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } = require("discord.js");
const TriviaInstance = require("../platform/instance_common");

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
module.exports = (config, Trivia, client) => {

  return async function(reply, replyDirect, Database) {
    Trivia.postStat("commandHelpCount", 1);

    // Set up the prefix to display through config
    const useSlashCommands = config["use-slash-commands"];
    const prefix = useSlashCommands ? "/" : config["prefix"];

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

    const commandsFields = useSlashCommands ? 
      [ 
        // Slash commands fields
        { name: ":game_die:  Game Commands", 
          value: `\`${prefix}play\`\n\`${prefix}hangman\`\n\`${prefix}setup\``,
          inline: true
        },
        { name: ":tools:  Other Commands", 
          value: `\`${prefix}help\`\n\`${prefix}categories\`\n\`${prefix}stop\``,
          inline: true
        }
      ] :
      [ 
        // Non-slash commands fields
        { name: ":game_die:  Game Commands", 
          value: `\`${prefix}play (category*)\`\n\`${prefix}play hangman (category*)\`\n\`${prefix}play advanced\``,
          inline: true
        },
        { name: ":tools:  Other Commands", 
          value: `\`${prefix}help\`\n\`${prefix}categories\`\n\`${prefix}stop (#channel*)\``,
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
      replyDirect({embeds: [embed], components});
    } else {
      reply({embeds: [embed], components});
    }
  };
};
