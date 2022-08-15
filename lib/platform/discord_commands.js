const { REST } = require("@discordjs/rest");
const { Routes } = require("discord.js");

const commands = [
    { name: "help", description: "Show help and information about TriviaBot and its commands."},
    { name: "ping", description: "Is this thing on?"},
    { name: "categories", description: "View a list of all available categories."}
];

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
