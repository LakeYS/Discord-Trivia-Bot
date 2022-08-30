const { REST } = require("@discordjs/rest");
const { Routes, SlashCommandBuilder } = require("discord.js");

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
  .setDescription("Start a game.")
  .addStringOption(option =>
		option.setName("category")
			.setDescription("The category to play the game in")
			.setRequired(false))
);

commands.push(new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stops the active game in this channel, if there is one.")
  .addStringOption(option =>
    option.setName("channel")
      .setDescription("The channel to stop the game in.")
      .setRequired(false))
);
);

class DiscordCommandHandler {
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
    const rest = new REST({ version: "10" }).setToken(this.clientToken);
  
    try {
      console.log("Started refreshing application (/) commands.");

      if(debug_mode) {
          await rest.put(
          Routes.applicationGuildCommands(this.client.user.id, this.debugGuild),
          { body: commands },
          );
      }
      else {
         await rest.put(
          Routes.applicationCommands(this.client.id),
          { body: commands },
          );
      }
  
      console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
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
}

module.exports = DiscordCommandHandler;
