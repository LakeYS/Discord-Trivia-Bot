const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require("discord.js");
const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const TriviaInstance = require("./instance_common.js");
const FileDB = require("../database/filedb.js");
const MergerDB = require("../database/mergerdb.js");
const OpenTDB = require("../database/opentdb.js");
const GameHandler = require("../game/game_handler.js");
const GameDebugger = require("../game/game_debug.js");
const Listings = require("../listings_discord");

// TODO: Use String.fromCharCode(65+letter) instead of this array?
const Letters = ["A", "B", "C", "D"];

function parseMsg(data) {
  if(typeof data !== "undefined" && typeof data.embed !== "undefined") {
    data.embeds = [ data.embed ];
    delete data.embed;
    return data;
  }

  return data;
}

// TriviaDiscord
// This class serves Discord-specific functionality.
class TriviaDiscord extends TriviaInstance {
  constructor(client, configData) {
    super(client);

    this.gameHandler = this.initGameHandler();
    this.config = configData.config;
    this.configData = configData;

    // Question cache container. See: getTriviaQuestion
    this.questions = {};

    const getConfig = this.getConfig.bind(this.getConfig);
    // Client init
    client.on("ready", () => {
      // Initialize restricted channels
      var restrictedChannelsInput = this.getConfig("channel-whitelist");
      this.restrictedChannels = [];
      if(typeof restrictedChannelsInput !== "undefined" && restrictedChannelsInput.length !== 0) {
        // Can't use for..in here because is isn't supported by Map objects.
        client.channels.cache.forEach((channel) => {
          for(var i in restrictedChannelsInput) {
            var channelInput = restrictedChannelsInput[i];
    
            if(this.restrictedChannels.length === restrictedChannelsInput.length) {
              break;
            }
    
            if(channelInput === channel.id.toString()) {
              this.restrictedChannels.push(channel.id);
            }
            else if(channelInput.toString().replace("#", "").toLowerCase() === channel.name) {
              this.restrictedChannels.push(channel.id);
            }
          }
    
        });
      }
    });

    // Convert the hex code to decimal so Discord can read it.
    this.embedCol = Buffer.from(this.getConfig("embed-color").padStart(8, "0"), "hex").readInt32BE(0);

    var allowLongAnswers = this.getConfig("database-allow-long-answers") || this.getConfig("hangman-mode");
    var Database;

    if(this.getConfig("database-merge")) {
      if(!this.config.databaseURL.startsWith("file://")) {
        throw new Error("A file path starting with 'file://' must be specified when the database merger is enabled.");
      }

      Database = MergerDB;
    }
    else {
      // Check database protocol
      if(this.config.databaseURL.startsWith("file://")) {
        Database = FileDB;
      }
      else {
        Database = OpenTDB;
      }
    }

    this.database = new Database(this.config.databaseURL, allowLongAnswers);

    
    this.database.updateGlobals(true)
    .catch((err) => {
      console.log("Failed to initialize the database. Errors may occur when attempting to start a game. The following error has occurred:");
      console.log(err);
    });

    // Database events
    this.database.on("debuglog", (str) => { this.debugLog(str); });

    if(typeof this.database === "undefined" || this.database.error) {
      console.error("Failed to load the database.");
      client.shard.send({evalStr: "process.exit();"});
    }

    this.questions = [];

    // Initialize the question cache
    if(!this.config.databaseURL.startsWith("file://")) {
      this.getTriviaQuestion(1)
      .catch((err) => {
        console.log(`An error occurred while attempting to initialize the question cache:\n ${err}`);
        console.log(err.stack);
      });
    }

    // Special handling for advanced game command.
    var playAdv = require("../commands/play_advanced.js")(this, client);

    const prefixStr = this.getConfig("use-slash-commands") ? "/" : this.getConfig("prefix");

    this.commands = {
      playAdv,
      triviaHelp: require("../commands/help.js")(this.config, this, client),
      triviaCategories: require("../commands/categories.js")(this.config),
      triviaPlay: require("../commands/play.js")(this.config, this, prefixStr),
      triviaPlayAdvanced: playAdv.triviaPlayAdvanced,
      triviaStop: require("../commands/stop.js")(),
      triviaConfig: require("../commands/config.js")(this, this.configData, this.config),
      triviaPing: require("../commands/ping.js")(this)
    };

    this.parseAdv = this.commands.playAdv.parseAdv;

    // Process handling
    process.on("SIGINT", function() {
      console.log("Exit with termination signal.");
      client.destroy()
      .then(() => {
        //this.exportGame();
        process.exit();
      });
    });
  }
  
  // initGameHandler()
  initGameHandler() {
    this.gameHandler = new GameHandler(this);

    // GameHandler init
    this.gameHandler.on("game_create", async (game) => {
      var channel = this.client.channels.cache.find((obj) => (obj.id === game.ID));
      var creator = this.client.users.cache.find((obj) => (obj.id === game.ownerID));
      var debugUsers = game.getConfig("debug-users");
    
      if(debugUsers > 0) {
        game.debug = new GameDebugger(game);
        game.debug.createTestUsers(debugUsers);
      }
    
      // Channel no-longer exists -- either something went wrong or the channel was deleted.
      if(typeof channel === "undefined") {
        game.endGame();
      }
    
      game.on("game_error", (err) => {
        if(err.code !== -1) {
          console.log("Database query error:");
          console.log(err);
        }
        game.reply({embed: {
          color: 14164000,
          description: `An error occurred while querying the trivia database: ${err}`
        }});
      });
    
      game.on("round_initialize", async (finalString) => {
        var msg;

        if(game.getConfig("display-pregame-rules") && game.roundCount === 0) {
          var rules = this.gameHandler.extensions.sendRules(game);
          game.reply(rules);

          // Wait 5 seconds before starting the game
          await new Promise(resolve => game.timeout = setTimeout(resolve, 5000));
        }
    
        // Set a timer to reveal the answer
        // Insert updateGameButtons to precede the round end.
        game.timeout = setTimeout(async () => {
          this.gameHandler.extensions.applyUniqueBonus(game);
          game.endRound();
        }, game.timer);
    
        var components;
        if(game.gameMode === "standard") {
          components = this.buildButtons(game.question.answersDisplay, game.question.type === "boolean");
          game.buttons = components[0];
        }

        // Only attribute these messages to the person that started the game for the first round.
        // This way, we only DM them in the event of an error if it occurs upon initial game start.
        const roundAuthorReference = game.roundCount === 0 ? creator : void 0;
    
        try {
          msg = await game.reply({embeds: [
            {
              color: game.color,
              image: { url: game.imageQuestion }, // If any is defined
              description: finalString
            }
          ], components}, roundAuthorReference);
          if(msg == null) throw new Error("Game message came back null.");
        } catch(err) {
          console.error("Error initializing round. Game will be cancelled.");
          console.log(err);
          game.endGame();
          return;
        }
    
        game.startRound();
        game.message = msg;
        game.messageId = msg.id;
        game.roundID = msg.channel.id;
    
        // Add reaction emojis if configured to do so.
        if(game.gameMode === "reaction") {
          this.addAnswerReactions(msg, game);
        }
    
        if(game.gameMode === "hangman" && this.getConfig("hangman-hints", channel) === true) {  // DELTA: Added deactivatable hangman hints
          // Show a hint halfway through.
          // No need for special handling here because it will auto-cancel if
          // the game ends before running.
          var answer = game.question.answer; // Pre-define to avoid errors.
          setTimeout(() => {
            game.doHangmanHint(answer);
          },
          game.timer/2);
        }
      });
    
      game.on("round_end", async (endInfo) => {
        // Only send a message when one exists and is needed. The final round message is handled by game_end.
        var doMessage = endInfo.str !== "" && endInfo.str != null;

        // Disable the updating of buttons if the message will be deleted.
        if(!this.getConfig("auto-delete-msgs") || this.getConfig("auto-delete-msgs-timer") > this.getConfig("round-length")) {
          await this.updateGameButtons(game);
        }
    
        if(!endInfo.gameIsEnding) {
          game.timeout = setTimeout(() => {
            game.initializeRound();
          }, endInfo.roundTimeout);
        }

        // Role assignment
        if(typeof channel.guild !== "undefined") {
          var roleName = game.getConfig("participant-role-name").toLowerCase();
          var role = channel.guild.roles.cache.find(role => role.name.toLowerCase() === roleName);

          if(typeof role !== "undefined" && game.getConfig("participant-role-points-required") !== -1) {
            for(var userId in game.usersActive) {
              var score = game.scores[userId];
              var member = channel.guild.members.cache.find(member => member.user.id === userId);
    
              if(typeof member === "undefined") {
                console.warn(`Failed to identify user ${userId} for role assignment! Role will not be assigned.`);
                return;
              }

              if(score >= game.getConfig("participant-role-points-required")) {
                member.roles.add(role);
                this.debugLog(`Assigning role to ${member.user.username}.`);
              }
            }
          }
        }

        if(doMessage) {
          try {
            let msg = await game.reply({embed: {
              color: game.color,
              image: {url: game.imageAnswer}, // If any is defined
              description: endInfo.str
            }});

            // Cancel if the message didn't go out.
            // This typically happens if the bot does not have permission to start the game.
            // If something else went wrong, an error will be thrown or something will be logged by game.reply.
            if(msg === null) return;
          }
          catch(err) {
            console.log("Unexpected error sending game message. Aborting game.");
            console.log(err);
            game.endGame();
          }
        }
      });
    
      game.on("game_end", (msg) => {
        if(typeof msg !== "undefined") {
          game.reply({embed: {
            color: this.embedCol,
            description: msg
          }});
        }
      });
    
      game.on("game_msg", (msg) => {
        game.reply(msg);
      });
    });

    return this.gameHandler;
  }

  // getConfig(value, channel, guild)
  // channel: Unique identifier for the channel. If blank, falls back to guild.
  //          If detected as a discord.js TextChannel object, automatically fills the
  //          ID for itself and the guild.
  // guild: Unique identifier for the server. If blank, falls back to global.
  getConfig(value, channel, guild) {
    if(typeof channel !== "undefined") {
      // discord.js class auto-detection
      if(channel.type === ChannelType.GuildText) {
        guild = channel.guild.id;
        channel = channel.id;
      }
      else if(channel.type === ChannelType.DM) {
        channel = channel.id;
      }
    }

    // "channel" refers to the channel's ID.

    var file = `../../Options/config_${channel}.json`;
    if(typeof channel !== "undefined" && fs.existsSync(file)) {
      // If data is already in the cache, return it from there.
      if(typeof this.configLocal[channel][value] !== "undefined") {
        return this.configLocal[channel][value];
      }
      
      // If the data isn't in the cache, load it from file.
      if(this.configData.localOptions.includes(value)) {
        var currentConfig;
        try {
          currentConfig = fs.readFileSync(file).toString();

          currentConfig = JSON.parse(currentConfig);

          // Cache the data so it doesn't need to be re-read.
          // This also eliminates issues if the file is changed without restarting.
          this.configLocal[channel] = currentConfig;

          // If the value doesn't exist, will attempt to fall back to global
          if(typeof currentConfig[value] !== "undefined") {
            return currentConfig[value];
          }
        } catch(error) {
          // If this fails, fall back to default config and drop an error in the console.
          console.log(`Failed to retrieve config option "${value}". Default option will be used instead.`);
          console.log(error.stack);
        }
      }
    }

    guild;

    if(value.toLowerCase().includes("token")) {
      throw new Error("Attempting to retrieve a token through getConfig. This may indicate a bad module or other security risk.");
    }

    return this.config[value];
  }

  async postStat(stat, value) {
    try {
      var post = { stats: {}};
      post.stats[stat] = value;
      await this.client.shard.send(post);
    }
    catch(err) {
      console.warn(`Failed to post stat ${stat}: ${err}`);
    }
  }

  // getTriviaQuestion
  // Returns a promise, fetches a random question from the database.
  // If initial is set to true, a question will not be returned. (For initializing the cache)
  // If tokenChannel is specified (must be a discord.js TextChannel object), a token will be generated and used.
  // TODO: We need to migrate this to event emitter format in order to iron out the tokenChannel usage
  async getTriviaQuestion(reply, initial, tokenChannelID, tokenRetry, isFirstQuestion, category, typeInput, difficultyInput) {
    var length = this.questions.length;
    var toReturn;

    var tokenChannel = this.client.channels.cache.find((obj) => (obj.id === tokenChannelID)); // TODO: Temporary

    // Check if there are custom arguments
    var isCustom = false;
    if(typeof category !== "undefined" || typeof typeInput !== "undefined" || typeof difficultyInput !== "undefined") {
      isCustom = true;
    }

    // To keep the question response quick, the bot always stays one question ahead.
    // This way, we're never waiting for the database to respond.
    if(typeof length === "undefined" || length < 2 || isCustom) {
      // We need a new question, either due to an empty cache or because we need a specific category.
      var options = {};
      options.category = category; // Pass through the category, even if it's undefined.

      if(isCustom || this.config.databaseURL.startsWith("file://")) {
        options.amount = 1;
      }
      else {
        options.amount = this.getConfig("database-cache-size");
      }

      options.type = typeInput;
      options.difficulty = difficultyInput;

      // Get a token if one is requested.
      var token;
      if(typeof tokenChannel !== "undefined") {
        try {
          token = await this.database.getTokenByIdentifier(tokenChannel.id);

          if(this.getConfig("debug-mode")) {
            reply(`*DB Token: ${token}*`);
          }
        } catch(error) {
          // Something went wrong. We'll display a warning but we won't cancel the game.
          console.log(`Failed to generate token for channel ${tokenChannel.id}: ${error.message}`);
          console.log(error.stack);

          // Skip display of session token messages if a pre-defined error message has been written.
          if(typeof this.maintenanceMsg !== "string") {
            reply({embed: {
              color: 14164000,
              description: `Error: Failed to generate a session token for this channel. You may see repeating questions. (${error.message})`
            }});
          }
        }

        if(typeof token !== "undefined" && (isCustom || this.config.databaseURL.startsWith("file://")) ) {
          // Set the token and continue.
          options.token = token;
        }
      }

      var json = {};
      var err;
      try {
        json = await this.database.fetchQuestions(options);

        if(this.getConfig("debug-database-flush") && !tokenRetry && typeof token !== "undefined") {
          err = new Error("Token override");
          err.code = 4;
          throw err;
        }
      } catch(error) {
        if(error.code === 4 && typeof token !== "undefined") {
          // Token empty, reset it and start over.
          if(tokenRetry !== 1) {
            try {
              await this.database.resetToken(token);
            } catch(error) {
              console.log(`Failed to reset token - ${error.message}`);
              throw new Error(`Failed to reset token - ${error.message}`);
            }

            if(!isFirstQuestion) {
              if(typeof category === "undefined") {
                reply("You've played all of the available questions! Questions will start to repeat.");
              }
              else {
                reply("You've played all of the questions in this category! Questions will start to repeat.");
              }
            }

            // Start over now that we have a token.
            return await this.getTriviaQuestion(reply, initial, tokenChannelID, 1, isFirstQuestion, category, typeInput, difficultyInput);
          }
          else {
            if(isFirstQuestion) {
              err = new Error("There are no questions available under the current configuration.");
              err.code = -1;
              throw err;
            }
            else {
              // This shouldn't ever happen.
              throw new Error("Token reset loop.");
            }
          }
        }
        else {
          // If an override has been set, show a shortened message instead
          if(typeof this.maintenanceMsg !== "string") {
            console.log("Received error from the trivia database!");
            console.log(error);
            console.log(json);
          }
          else {
            console.log("Error from trivia database, displaying canned response");
          }

          // Delete the token so we'll generate a new one next time.
          // This is to fix the game in case the cached token is invalid.
          if(typeof token !== "undefined") {
            delete this.database.tokens[tokenChannel.id];
          }

          // Author is passed through; this.send will handle it if author is undefined.
          throw new Error("An error occurred while attempting to access the trivia database. Please try again later.");
        }
      }
      finally {
        this.questions = json;
      }
    }

    if(!initial) {
      // Just in case, check the cached question count first.
      if(this.questions.length < 1) {
        throw new Error("Received empty response while attempting to retrieve a Trivia question.");
      }
      else {
        toReturn = this.questions[0];

        delete this.questions[0];
        this.questions = this.questions.filter((val) => Object.keys(val).length !== 0);

        return toReturn;
      }
    }
  }

  doCommand(cmd, reply, replyDirect, channel, member, guild, msg, args) {
    const isAdmin = this.checkAdmin(channel, member);
    var game = this.gameHandler.getActiveGame(channel.id);
    var commands = this.commands;
    cmd = cmd.toUpperCase();

    const isDM = channel.type === ChannelType.DM;
  
    if(cmd.startsWith("STOP")) {
      if(msg != null) {
        // Non-slash command specific
        var stopChannel = msg.channel;

        // advGameExists (function)
        var advGameExists = this.commands.playAdv.advGameExists;
    
        // Functions for admins
        if(isAdmin) {
          // Cancel advanced game setup if there is one
          if(advGameExists(stopChannel.id)) {
            this.commands.playAdv.cancelAdvGame(stopChannel.id);
            this.send(stopChannel, void 0, "Game setup cancelled.");
      
            return;
          }
    
          // Check if the input is for another channel.
          var channelInput = cmd.replace("STOP ","");
          if(channelInput !== "STOP" && msg.channel.type === ChannelType.GuildText) {
            // TODO Pull some of this channel-finding functionality into commands.triviaStop?
            var idInput = channelInput.replace("<#","").replace(">","");
            stopChannel = msg.guild.channels.cache.find((obj) => (obj.id === idInput));
            const stopGame = this.gameHandler.getActiveGame(stopChannel.id);
    
            if(stopChannel === null || typeof stopChannel === "undefined") {
              this.send(msg.channel, msg.author, `Could not find that channel. Check input and try again. (Example: <#${msg.channel.id}>)`);
              return;
            }
            else if(stopGame == null && !advGameExists(stopChannel.id)) {
              this.send(msg.channel, msg.author, "There is no game running in that channel.");
              return;
            }
            else {
              this.send(msg.channel, msg.author, `Stopping game in channel <#${stopChannel.id}>`);
              // No return here, need to actually stop the game below.
            }

            commands.triviaStop(reply, replyDirect, stopGame, isAdmin);
          } else {
            const stopGame = this.gameHandler.getActiveGame(msg.channel.id);
            commands.triviaStop(reply, replyDirect, stopGame, isAdmin);
          }
        }
      } else {
        // Slash commands
        const channelArgInput = args.getChannel("channel");
        stopChannel = channelArgInput ?? channel;
        const stopGame = this.gameHandler.getActiveGame(stopChannel.id);
        commands.triviaStop(reply, replyDirect, stopGame, isAdmin);
      }
    }
  
    if(cmd.startsWith("CONFIG")) {
      commands.triviaConfig(cmd, channel, member.user, isAdmin);
    }
  
    if(cmd.startsWith("RESET")) {
      if(isAdmin &&this.getConfig("config-commands-enabled")) {
        this.client.shard.send({evalStr: "manager.eCmds.exportexit(1);"});
      }
    }
  
    if(cmd.startsWith("PLAY ADVANCED") || (this.getConfig("use-slash-commands") && cmd === "SETUP")) {
      if(typeof game !== "undefined" && game.inProgress) {
        return;
      }
  
      commands.triviaPlayAdvanced(reply, replyDirect, void 0, channel.id, channel, member.user, cmd.replace("PLAY ADVANCED",""), undefined, undefined, args);
      return;
    }
  
    var categoryInput;
  
    if(cmd.startsWith("PLAY HANGMAN ") || cmd === "PLAY HANGMAN" || (msg === null && cmd === "HANGMAN")) {
      categoryInput = msg === null ? args.getString("category") : cmd.replace("PLAY HANGMAN ","");
  
      if(this.getConfig("databaseURL") === "https://opentdb.com") {
        reply("*(Beware: Some questions from OpenTDB are not designed for hangman-style gameplay)*");
      }
      
      commands.triviaPlay(reply, replyDirect, channel.id, member.user.id, guild, categoryInput, "hangman");
      this.postStat("commandPlayHangmanCount", 1);
      return;
    }

    if(cmd === "HELP") {
      commands.triviaHelp(reply, replyDirect, this.database);
      return;
    }
  
    if(cmd.startsWith("PLAY ") || cmd === "PLAY") {
      categoryInput = msg === null ? args.getString("category") : cmd.replace("PLAY ","");
      var mode;

      if(this.getConfig("hangman-mode")) {
        mode = "hangman";
      }
      else if(this.getConfig("use-reactions")) {
        mode = "reaction";
      }

      commands.triviaPlay(reply, replyDirect, channel.id, member.user.id, guild, categoryInput, mode);
      return;
    }
  
    if(cmd === "CATEGORIES") {
      commands.triviaCategories(reply, replyDirect, isDM, this);
      return;
    }
  
    if(cmd === "PING") {
      commands.triviaPing(reply);
      return;
    }
    
    if(cmd === "PONG") {
      commands.triviaPing(reply, true);
      return;
    }
  }

  checkAdmin(channel, member) {
    if(this.getConfig("disable-admin-commands", channel) !== true) {
      // Admin if there is a valid member object and they have permission.
      if(member !== null && member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return true;
      }
      else if(channel.type === ChannelType.DM) {
        // Admin if the game is run in a DM.
        return true;
      }
      else if(this.getConfig("command-whitelist", channel).length > 0) {
        // By this point, we know this person is whitelisted - auto admin
        return true;
      }
    }
  }

  parseSlash(commandName, interaction) {
    // Track this per interaction that we initiate.
    var interactionReplySent = false;

    const replyDirect = (response) => {
      var msg = parseMsg(response);

      let modifiedResponse;
      if(typeof msg === "object") {
        modifiedResponse = {
          ...msg,
          ephemeral: true
        };
      } else {
        modifiedResponse = {
          content: msg,
          ephemeral: true
        };
      }


      try {
        interactionReplySent = true;
        return interaction.reply(modifiedResponse);
      } catch(err) {
        console.error("Failed to direct reply to a message:", err);
        return null;
      }
    };

    const reply = async (response) => {
      var msg = parseMsg(response);

      const handleError = (error) => {
        if(error.message.includes("Missing Permissions")) {
          const message = "TriviaBot does not have sufficient permissions to run in this channel."
          + " The permissions required are \"View Channel\" \"Send Messages\" and \"Embed Links\".";

          try {
            // Use an ephemeral message if possible. Otherwise, DM the initiator of the command.
            if(!interactionReplySent && !interaction.replied) {
              replyDirect(message);
            }
            else {
              // In the rare event we DM the user -- for example, if an admin turns off permissions mid-game.
              interaction.user.send(message);
            }
            return true;
          } catch(err) {
            console.error(`Failed permissions check for interaction, and additionally failed to reply with error message: ${err}`);
            return false;
          }
        }
      };

      const member = interaction.guild.members.me;
      const perms = interaction.channel.permissionsFor(member);

      const hasChannelPerms = perms.has(
        PermissionsBitField.Flags.SendMessages &&
        PermissionsBitField.Flags.EmbedLinks &&
        PermissionsBitField.Flags.ViewChannel
      );

      if(!hasChannelPerms) {
        handleError(new Error("Missing Permissions for TriviaBot"));
        return null;
      }

      if(!interactionReplySent && !interaction.replied) {
        interactionReplySent = true;
        try {
          // Returns an InteractionResponse
          await interaction.reply(msg);
        }
        catch(err) {
          console.error("Failed to respond to a command in time: ", err);
        }

        return await interaction.fetchReply();
      } else {
        let interactionResponse = null;
        try {
          // Returns a message
          interactionResponse = await interaction.channel.send(msg);
        }
        catch(err) {
          if(!handleError(err)) {
          console.error("Failed to follow up to a command: ", err);
            return null;
          }
        }

        return interactionResponse;
      }

    };

    this.doCommand(interaction.commandName, reply, replyDirect, interaction.channel, interaction.member, interaction.guild, null, interaction.options);
  }

  // # this.parseText #
  parseText(str, msg) {
    // No games in fallback mode
    if(this.isFallbackMode(msg.channel.id)) {
      return;
    }

    // Str is always uppercase
    var id = msg.channel.id;
    var game = this.gameHandler.getActiveGame(id);
    var gameExists = typeof game !== "undefined";

    // Other bots can't use commands
    if(msg.author.bot === true && this.getConfig("allow-bots") !== true) {
      return;
    }

    var prefix = this.getConfig("prefix").toUpperCase();

    // ## Answers ##
    // Check for letters if not using reactions
    if(gameExists && game.gameMode !== "reaction" && game.gameMode !== "standard") {
      var name = this.filterName(msg.member !== null?msg.member.displayName:msg.author.username);
      var parse;

      if(game.gameMode === "hangman") {
        parse = this.parseAnswerHangman;
      }
      else {
        parse = this.parseAnswer;
      }

      var parsed = parse(game, str, msg.author.id, name);

      if(parsed !== -1) {
        if(game.getConfig("auto-delete-answers", msg.channel) && !game.isDMGame) { // TODO
          setTimeout(() => {
            msg.delete()
            .catch((err) => {
              if(err.message !== "Missing Permissions") {
                console.log(err);
                console.log("Failed to delete player answer: " + err.message);
              }
            });
          },this.getConfig("auto-delete-answers-timer", msg.channel));
        }

        return;
      }
    }

    // Check for command whitelist permissions before proceeding.
    var cmdWhitelist = this.getConfig("command-whitelist", msg.channel);
    var whitelistActive = (typeof cmdWhitelist !== "undefined" && cmdWhitelist.length !== 0);
    var isWhitelisted = (cmdWhitelist.indexOf(msg.author.tag) !== -1 || cmdWhitelist.indexOf(msg.author.id) !== -1);
    if(whitelistActive && !isWhitelisted) {
      return;
    }

    // Check the channel whitelist before proceeding.
    if(this.restrictedChannels.length !== 0) {
      // Cancel if the channel isn't on the whitelist.
      if(this.restrictedChannels.indexOf(msg.channel.id) === -1) {
        return;
      }
    }

    const isAdmin = this.checkAdmin(msg.channel, msg.member);

    // ## Advanced Game Args ##
    this.parseAdv(id, msg, isAdmin);

    // The function to send messages
    const reply = (response, authorOverride) => {
      const author = authorOverride ?? msg.author;
      return this.send(msg.channel, author, parseMsg(response));
    };

    // The function to send messages
    const replyDirect = (response) => {
      this.send(msg.author, null, response);
    };

    // # Text Commands # 
    // Anything past this point requires use-slash-commands to be off.
    if(this.getConfig("use-slash-commands")) {
      return;
    }

    // ## Help Command Parser ##
    if(str === prefix + "HELP" || str.includes(`<@!${this.client.user.id}>`)) {
      this.commands.triviaHelp(reply, replyDirect, this.database);
      return;
    }

    // ## Normal Commands ##
    // If the string starts with the specified prefix (converted to uppercase)
    if(str.startsWith(prefix)) {
      var cmd = str.replace(prefix, "");
      this.doCommand(cmd, reply, replyDirect, msg.channel, msg.member, msg.guild, msg);
    }
  }

  // Detect reaction answers
  async reactionAdd(reaction, user) {
    var id = reaction.message.channel.id;
    var game = this.gameHandler.getActiveGame(id);
    var str = reaction.emoji.name;

    if(typeof game === "undefined")
      return;
    
    if(typeof game.message === "undefined")
      return;
    
    if(game.gameMode !== "reaction") // Reaction mode only
      return;

    if(reaction.message.id !== game.messageId)
      return;
    
    if(user === this.client.user) // Ignore our own client
      return;

    if(str === "🇦") {
      str = "A";
    }
    else if(str === "🇧") {
      str = "B";
    }
    else if(str === "🇨") {
      str = "C";
    }
    else if(str === "🇩") {
      str = "D";
    }
    else {
      return; // The reaction isn't a letter, ignore it.
    }

    // Get the user's guild nickname, or regular name if in a DM.
    var msg = reaction.message;
    var username;

    if(msg.guild !== null) {
      // Fetch the guild member for this user.
      var guildMember = await msg.guild.members.fetch({user: user.id});
      username = guildMember.displayName;
    }
    else {
      username = user.username; 
    }

    username = this.filterName(username);

    this.parseAnswer(game, str, user.id, username);
  }

  doMaintenanceShutdown() {
    console.log(`Clearing ${this.gameHandler.getGameCount()} games on shard ${this.client.shard.ids}`);
    var gameDump = this.gameHandler.dumpGames();
    
    Object.keys(gameDump).forEach((key) => {
      var game = this.gameHandler.getActiveGame(key);
      game.endGame();
  
      game.broadcast("TriviaBot is being temporarily shut down for maintenance. Please try again in a few minutes.");
    });
  
    return;
  }

  filterName(name) {
    // Pass an escape character to Discord for this set of characters
    name = name.replace(/https:\/\//g, "https\\://");
    name = name.replace(/http:\/\//g, "http\\://");
    return name.replace(/[@*_`<>[\]<>]/g, "\\$&");
  }
  
  setConfigVal(value, newValue, skipOverride, localID) {
    var isLocal = typeof localID !== "undefined";
    if(skipOverride !== true || !this.getConfig("config-commands-enabled")) {
      // TEMPORARY: This is an extra failsafe to make sure this only runs when intended.
      return;
    }
  
    if(value.toLowerCase().includes("token")) {
      return -1;
    }
  
    var file = this.configData.configFile;
    var configToWrite = JSON.parse(JSON.stringify(this.config));
  
    if(isLocal) {
      if(isLocal) {
        file = `./Options/config_${localID}.json`;
      }
  
      // Get the value first so the file caches in case it hasn't already.
     this.getConfig(value, localID);
  
      if(fs.existsSync(file)) {
        configToWrite = fs.readFileSync(file).toString();
  
        configToWrite = JSON.parse(configToWrite);
      }
      // If the file doesn't exist, use the global config.
    }
  
    if(newValue === null) {
      delete configToWrite[value.toLowerCase()];
    }
    else {
      configToWrite[value.toLowerCase()] = newValue;
    }
  
    if(isLocal) {
      file = `./Options/config_${localID}.json`;
  
      // Filter out the options that are not global values.
      for(var key in configToWrite) {
        if(!this.configData.localOptions.includes(key)) {
          delete configToWrite[key];
        }
      }
    }
  
    fs.writeFile(file, JSON.stringify(configToWrite, null, "\t"), "utf8", (err) => {
      if(err) {
        throw err;
      }
    });
  }
  
  debugLog(str) {
    if(this.getConfig("debug-log")) {
      console.log("[Trivia Debug]", str);
    }
  }
  
  // Generic message sending function.
  // This is to avoid repeating the same error catchers throughout the script.
  
  //    channel: Channel ID
  //    author: Author ID (Omit to prevent error messages from going to the author's DMs)
  //    msg: Message Object
  //    noDelete: If enabled, message will not auto-delete even if configured to
  // TODO rewrite
  async send(channel, author, msg, callback, noDelete) {
    try {
      msg = await channel.send(parseMsg(msg));
    } catch(err) {
      if(typeof author === "undefined") {
        console.warn("Failed to send message to channel, user object nonexistent or not provided. Err: " + err.message);
        console.trace();
        console.log(msg);
        return;
      }

      if(channel.type === ChannelType.DM) {
        console.warn(`Failed to send message to user ${author.id}. (already in DM)`);
        return;
      }
      
      var str = "";
      var known = false;
      if(err.message.includes("Missing Permissions")) {
        str = "\n\nThe bot does not have sufficient permission to send messages in this channel. This bot requires the \"Send Messages\" and \"Embed Links\" permissions in order to work.";
        known = true;
      }

      if(err.message.includes("Missing Access")) {
        str = "\n\nThe bot does not have permission to view this channel. Ensure that TriviaBot has the \"View Channel\" permission for this channel.";
        known = true;
      }

      if(!known) {
        console.error(`Error sending a message: ${err.message}`);
        console.trace();
      }

      author.send({embeds: [{
        color: 14164000,
        description: `TriviaBot is unable to send messages in this channel:\n${err.message.replace("DiscordAPIError: ","")} ${str}`
      }]})
      .catch((err) => {
        console.warn(`Failed to send message to user ${author.id}, DM failed. Dumping message data...`);
        console.log(err);
        console.log(msg);
        console.log("Dumped message data.");
      });
      return null;
    }

    if(this.getConfig("auto-delete-msgs", channel) && noDelete !== true) {
      setTimeout(() => {
        msg.delete();
      },this.getConfig("auto-delete-msgs-timer", msg.channel));
    }
    
    return msg;
  }

  isFallbackMode(channel) {
    if(this.getConfig("fallback-mode")) {
      if(typeof this.getConfig("fallback-exceptions") !== "undefined" && this.getConfig("fallback-exceptions").indexOf(channel) !== -1) {
        // Return if specified channel is an exception
        return;
      }
      else {
        return true;
      }
    }
  }
  
  async updateGameButtons(game) {
    if(typeof game.buttons !== "undefined") {
      // Button handling
      for(let i in game.buttons.components) {
        if(typeof game.buttons.components[i] === "undefined") {
          console.warn(`Failed to retrieve component ${i} for game ${game.ID}. Buttons may not appear correctly.`);
          break;
        }
  
        var style = ButtonStyle.Secondary;

        if(!game.getConfig("hide-answers") && parseInt(i) === game.question.displayCorrectID) {
          style = ButtonStyle.Success;
        }
  
        game.buttons.components[i].setDisabled(true);
        game.buttons.components[i].setStyle(style);
      }

      if(typeof game.message === "undefined") {
        console.warn(`Failed to retrieve message for game ${game.id}. Game message may not update correctly.`);
        return;
      }
  
      var edit = { components: [ game.buttons ] };
      if(game.message.content !== "") {
        edit.content = game.message.content;
      }
  
      if(game.message.embeds.length !== 0) {
        edit.embeds = game.message.embeds;
      }
  
      // Wait for the message to edit, up to a timeout of 1000ms. After which, we will display a warning and continue.
      var timeout = new Promise((resolve) => { setTimeout(() => { resolve("TIMEDOUT"); }, 1000);});
      var editDone;
      try {
        editDone = await Promise.race([timeout, game.message.edit(edit)]);
      } 
      catch(err) {
        console.warn(`Failed to edit game message in channel ${game.ID}. Message may have been deleted. This will be ignored.`);
      }
  
      if(editDone === "TIMEDOUT") {
        console.warn(`Timed out while ending round for game ${game.ID}.`);
      }
    }
  }
  
  formatStr(str) {
    str = entities.decode(str);
    str = str.replace(/_/g, "\\_");
  
    return str;
  }
  
  // # parseAnswerHangman # //
  parseAnswerHangman(game, str, userId, username) {
    var input = str.toLowerCase();
    // Decode and remove all non-alphabetical characters
    var answer = game.formatStr(game.question.answer).toLowerCase().replace(/\W/g, "");
  
    // Return -1 if the input is a command.
    // If the input is much longer than the actual answer, assume that it is not an attempt to answer.
    if(input.startsWith(game.getConfig("prefix")) || input.length > answer.length*2) {
      return -1;
    }
  
    // Pass whether or not the answer is a match.
    return game.submitAnswer(userId, username, input.replace(/\W/g, "") === answer);
  }
  
  // # this.parseAnswer # //
  // Parses a user's letter answer and scores it accordingly.
  // Str: Letter answer -- userId: User identifier -- username: User screen name
  //    If undefined, automatically considered incorrect. If null, automatically considered correct.
  // scoreValue: Score value from the config file.
  parseAnswer(game, str, userId, username) {
    if(!game.inRound) {
      // Return -1 since there is no game.
      return -1;
    }
  
    // undefined, null, or A-D are considered valid inputs for parsing
    if(typeof str === "undefined" || str === null || str === "A" || str === "B" || (game.question.isTrueFalse !== 1 && (str === "C"|| str === "D"))) {
      var isCorrect = false;
  
      // Check if the answer is not undefined and is correct.
      // undefined or an invalid value are automatically considered incorrect. null is automatically correct.
      if(str === Letters[game.question.displayCorrectID] || str === null) {
        isCorrect = true;
      }
  
      game.submitAnswer(userId, username, isCorrect);
    }
    else {
      // Return -1 to indicate that the input is NOT a valid answer
      return -1;
    }
  }
  
  async addAnswerReactions(msg, game) {
    try {
      await msg.react("🇦");
      await msg.react("🇧");
  
      if(typeof game === "undefined" || !game.question.isTrueFalse) {
        await msg.react("🇨");
        await msg.react("🇩");
      }
    } catch (error) {
      console.log(`Failed to add reaction: ${error}`);
  
      this.send(msg.channel, void 0, {embed: {
        color: 14164000,
        description: "Error: Failed to add reaction. This may be due to the channel's configuration.\n\nMake sure that the bot has the \"Use Reactions\" and \"Read Message History\" permissions or disable reaction mode to play."
      }});
  
      msg.delete();
      game.endGame();
      return;
    }
  }
  
  // Creates button components.
  // Returns the button action row, and an array of the button components, with the one for the correct answer first.
  buildButtons(answers) {
    var buttons = new ActionRowBuilder();
  
    for(var i = 0; i <= answers.length-1; i++) {
      var style, text;
  
      text = `${Letters[i]}: ${this.formatStr(answers[i])}`;
      style = ButtonStyle.Secondary;
  
      if(text.length > 80) {
        text = text.slice(0, 77);
        text = `${text}...`;
      }
  
      buttons.addComponents(
        new ButtonBuilder()
        .setCustomId("answer_" + Letters[i])
        .setLabel(this.formatStr(text))
        .setStyle(style),
      );
    }
  
    return [ buttons ];
  }
  
  // Detect button answers
  buttonPress(interaction, answer, userId, username) {
    var game = this.gameHandler.getActiveGame(interaction.channel.id);
  
    // Return -1 to indicate that this is not a valid round.
    if(typeof game === "undefined" || interaction.message.id !== game.messageId || !game.inRound) return -1;

    // If they already answered and configured to do so, don't accept subsquent answers.
    if(game.getConfig("disallow-answer-changes", interaction.channel.id) && typeof game.usersActive[userId] !== "undefined") {
      interaction.reply({content: "You have already answered this question.", ephemeral: true});
      return;
    }

    this.parseAnswer(game, answer, userId, username, this.getConfig("score-value", interaction.message.channel));
    return Object.keys(game.usersActive).length;
  }
  
  async postStats() {
    var listings = new Listings(this.client.user.id, this.client.shard.ids);
    for(var site in this.config["listing-tokens"]) {
      listings.setToken(site, this.config["listing-tokens"][site]);
    }
  
    if(this.client.shard.ids[0] === this.client.shard.count-1) {
      var countArray = await this.client.shard.fetchClientValues("guilds.cache.size");
      var guildCount = countArray.reduce((prev, val) => prev + val, 0);
      var shardCount = this.client.shard.ids.length;
  
      listings.postBotStats(guildCount, shardCount);
    }
  }
}

process.on("exit", (code) => {
  if(code !== 0) {
    console.log("Exit with non-zero code, exporting game data...");
    //this.exportGame();
  }
});

module.exports = TriviaDiscord;
