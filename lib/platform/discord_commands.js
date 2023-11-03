const { REST } = require("@discordjs/rest");
const {
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client
} = require("discord.js");

const commands = [];

commands.push(new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show help and information about TriviaBot and its commands.")
);

commands.push(new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Is this thing on?")
);

commands.push(new SlashCommandBuilder()
  .setName("categories")
  .setDescription("View a list of all available categories.")
);

commands.push(new SlashCommandBuilder()
  .setName("play")
  .setDescription("Start a standard game.")
  .addStringOption(option =>
		option.setName("category")
			.setDescription("The category to play the game in")
			.setRequired(false))
);

commands.push(new SlashCommandBuilder()
  .setName("hangman")
  .setDescription("Start a hangman game.")
  .addStringOption(option =>
		option.setName("category")
			.setDescription("The category to play the game in")
			.setRequired(false))
);

commands.push(new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stops the active game in this channel, if there is one.")
  .addChannelOption(option =>
    option.setName("channel")
      .setDescription("The channel to stop the game in.")
      .setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

commands.push(new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Start a game with configuration.")
  .addStringOption(option =>
    option.setName("gamemode")
      .setDescription("The mode to play the game in")
      .setRequired(true)
      .addChoices(
				{ name: "Normal - A standard four-letter trivia game.", value: "standard" },
				{ name: "Hangman - Hangman-styled 'guess the answer' game. #IRC", value: "hangman" }
			))
  .addStringOption(option =>
		option.setName("category")
			.setDescription("The category to play the game in. Type \"all\" to play in random categories.")
			.setRequired(true))
  .addStringOption(option =>
    option.setName("type")
      .setDescription("The type of questions you would like to play.")
      .setRequired(true)
      .addChoices(
        { name: "All", value: "all" },
        { name: "Multiple Choice", value: "multiple" },
        { name: "True/False (Non-hangman only)", value: "boolean" }
      ))
  .addStringOption(option =>
    option.setName("difficulty")
      .setDescription("The difficulty level you would like to play.")
      .setRequired(true)
      .addChoices(
        { name: "All", value: "all" },
        { name: "Easy Only", value: "easy" },
        { name: "Medium Only", value: "medium" },
        { name: "Hard Only", value: "hard" }
      ))
  .addChannelOption(option =>
    option.setName("channel")
    .setDescription("The channel to start this game in.")
    .setRequired(true)
  )
);

class DiscordCommandHandler {
  /**
   * Construct a new Discord command handler instance.
   * 
   * @param {Client} client The Discord.js client instance.
   * @param {string} token The Discord bot token to use.
   * @param {string} [debugGuild] The guild to handle if debugging - whether to debug is specified in the arg for postCommands.
   */
  constructor(client, token, debugGuild) {
    this.client = client;
    this.clientToken = token;
    this.debugGuild = debugGuild;
  }

  /**
   * Initializes commands and posts them to the client.
   *
   * @param {boolean} debug_mode - Whether to run in debug mode.
   */
  async postCommands(debug_mode) {
    const rest = new REST().setToken(this.clientToken);
  
    try {
      console.log("Started refreshing application (/) commands.");

      if(debug_mode) {
          // A blank string (the default value in example config) or undefined.
          if(this.debugGuild === undefined || this.debugGuild === "") {
            throw new Error("Slash commands are set to debug, but no guild is specified. Please make sure \"debug-slash-commands-guild\" is set in config and try again.");
          }

          await rest.put(
          Routes.applicationGuildCommands(this.client.user.id, this.debugGuild),
          { body: commands },
          );
      }
      else {
         await rest.put(
          Routes.applicationCommands(this.client.user.id),
          { body: commands },
          );
      }
  
      console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
      if(error.code === 50001) {
          // Act accordingly if it's 50001 missing access (Bot has no permission)
          // This error is less end-user friendly as it should only occur in debug mode.
          console.error(error);
          console.log(`Failed to set up slash commands. This is likely either due to bad scope in the invite link, or debug-slash-commands-guild is set to an invalid option ('${this.debugGuild}')`);
        }
        console.error(error);
        console.log("Failed to set up slash commands. See above error.");
    }
  }

  async deleteGuildCommands() {
    const rest = new REST({ version: "10" }).setToken(this.clientToken);

    await rest.put(
      Routes.applicationGuildCommands(this.client.user.id, this.debugGuild),
      { body: {} },
    );

    return;
  }

  async deleteGlobalCommands() {
    const rest = new REST({ version: "10" }).setToken(this.clientToken);

    await rest.put(
      Routes.applicationCommands(this.client.user.id),
      { body: {} },
    );

    return;
  }
}

module.exports = DiscordCommandHandler;
