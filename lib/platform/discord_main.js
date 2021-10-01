const { MessageActionRow, MessageButton } = require("discord.js");
const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const JSON = require("circular-json");
const Trivia = require("./platform_common.js");
const FileDB = require("../database/filedb.js");
const MergerDB = require("../database/mergerdb.js");
const OpenTDB = require("../database/opentdb.js");
const GameHandler = require("../game_handler.js");
const GameDebugger = require("../game_debug.js");
const Listings = require("../listings_discord");
var ConfigData = require("../config.js")(process.argv[2]);

// TODO: Use String.fromCharCode(65+letter) instead of this array?
const Letters = ["A", "B", "C", "D"];
var Config = ConfigData.config;
var ConfigLocal = {};

// TriviaDiscord
// This class serves Discord-specific functionality.
class TriviaDiscord extends Trivia {
  constructor(client) {
    super(client);
    
    this.gameHandler = this.initGameHandler();

    // Question cache container. See: getTriviaQuestion
    this.questions = {};

    var getConfigVal = this.getConfigVal;
    // Client init
    client.on("ready", () => {
      // Initialize restricted channels
      var restrictedChannelsInput = this.getConfigVal("channel-whitelist");
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
    this.embedCol = Buffer.from(this.getConfigVal("embed-color").padStart(8, "0"), "hex").readInt32BE(0);

    var allowLongAnswers =this.getConfigVal("database-allow-long-answers") ||this.getConfigVal("hangman-mode");

    if(this.getConfigVal("database-merge")) {
      // TODO: Rather than killing the base process, the manager should
      // do this automatically when an initial error is thrown.
      if(!Config.databaseURL.startsWith("file://")) {
        console.error("A file path starting with 'file://' must be specified when the database merger is enabled.");
        client.shard.send({evalStr: "process.exit();"});
      }

      this.database = new MergerDB(Config.databaseURL, allowLongAnswers);
    }
    else {
      // Check database protocol
      if(Config.databaseURL.startsWith("file://")) {
        this.database = new FileDB(Config.databaseURL, allowLongAnswers);
      }
      else {
        this.database = new OpenTDB(this.getConfigVal("databaseURL"));
      }
    }

    // Database events
    this.database.on("debuglog", this.debugLog);

    if(typeof this.database === "undefined" || this.database.error) {
      console.error("Failed to load the database.");
      client.shard.send({evalStr: "process.exit();"});
    }

    this.questions = [];

    // Initialize the question cache
    if(!Config.databaseURL.startsWith("file://")) {
      this.getTriviaQuestion(1)
      .catch((err) => {
        console.log(`An error occurred while attempting to initialize the question cache:\n ${err}`);
        console.log(err.stack);
      });
    }

    // Special handling for advanced game command.
    var playAdv = require("../commands/play_advanced.js")(this, client);

    this.commands = {
      playAdv,
      triviaHelp: require("../commands/help.js")(Config, this, client),
      triviaCategories: require("../commands/categories.js")(Config),
      triviaPlay: require("../commands/play.js")(Config, this, getConfigVal),
      triviaPlayAdvanced: playAdv.triviaPlayAdvanced,
      triviaStop: require("../commands/stop.js")(Config, this, getConfigVal),
      triviaConfig: require("../commands/config.js")(this, ConfigData, Config),
      triviaPing: require("../commands/ping.js")(this)
    };

    this.parseAdv = this.commands.playAdv.parseAdv;
  }

  // initGameHandler()
  initGameHandler() {
    this.gameHandler = new GameHandler(this);

    // GameHandler init
    this.gameHandler.on("game_create", async (game) => {
      var channel = this.client.channels.cache.find((obj) => (obj.id === game.ID));
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
        this.send(channel, void 0, {embed: {
          color: 14164000,
          description: `An error occurred while querying the trivia database: ${err}`
        }});
      });
    
      game.on("round_initialize", async (finalString) => {
        var msg;
    
        // Set a timer to reveal the answer
        // Insert updateGameButtons to precede the round end.
        game.timeout = setTimeout(async () => {
          await this.updateGameButtons(game);
          game.endRound();
        }, game.timer);
    
        var components;
        if(game.gameMode === "standard") {
          components = this.buildButtons(game.question.answersDisplay, game.question.type === "boolean");
          game.buttons = components[0];
        }
    
        try {
          msg = await this.send(channel, void 0, {embed: {
            color: game.color,
            image: { url: game.imageQuestion }, // If any is defined
            description: finalString
          }, components});
    
        } catch(err) {
          game.endGame();
          throw err;
        }
    
        game.startRound();
        game.message = msg;
        game.messageId = msg.id;
        game.roundID = msg.channel.id;
    
        // Add reaction emojis if configured to do so.
        if(game.gameMode === "reaction") {
          this.addAnswerReactions(msg, game);
        }
    
        if(game.gameMode === "hangman" && this.getConfigVal("hangman-hints", channel) === true) {  // DELTA: Added deactivatable hangman hints
          // Show a hint halfway through.
          // No need for special handling here because it will auto-cancel if
          // the game ends before running.
          var answer = game.question.answer; // Pre-define to avoid errors.
          setTimeout(() => {
            game.doHangmanHint(answer);
          },
          this.getConfigVal("round-length", channel)/2);
        }
      });
    
      game.on("round_end", async (endInfo) => {
        if(endInfo.str === "") {
          return;
        }
    
        if(!endInfo.gameIsEnding) {
          game.timeout = setTimeout(() => {
            game.initializeRound();
          }, endInfo.roundTimeout);
        }
    
        var msg;
        try {
          msg = await this.send(channel, void 0, {embed: {
            color: game.color,
            image: {url: game.imageAnswer}, // If any is defined
            description: endInfo.str
          }});
        }
        catch(err) {
          game.endGame();
        }
    
        if(typeof game !== "undefined" && !game.cancelled) {
          setTimeout(() => {
            if(this.getConfigVal("auto-delete-msgs", channel)) {
              msg.delete()
              .catch((err) => {
                console.log(`Failed to delete message - ${err.message}`);
              });
            }          
          }, endInfo.roundTimeout);
        }
      });
    
      game.on("game_end", (msg) => {
        if(typeof msg !== "undefined") {
          this.send(channel, void 0, {embed: {
            color: this.embedCol,
            description: msg
          }});
        }
      });
    
      game.on("game_msg", (msg) => {
        this.send(channel, void 0, msg);
      });
    });

    return this.gameHandler;
  }

  // getConfigValue(value, channel, guild)
  // channel: Unique identifier for the channel. If blank, falls back to guild.
  //          If detected as a discord.js TextChannel object, automatically fills the
  //          ID for itself and the guild.
  // guild: Unique identifier for the server. If blank, falls back to global.
 getConfigVal(value, channel, guild) {
    if(typeof channel !== "undefined") {
      // discord.js class auto-detection
      if(channel.type === "GUILD_TEXT") {
        guild = channel.guild.id;
        channel = channel.id;
      }
      else if(channel.type === "DM") {
        channel = channel.id;
      }
    }

    // "channel" refers to the channel's ID.

    var file = `../../Options/config_${channel}.json`;
    if(typeof channel !== "undefined" && fs.existsSync(file)) {
      // If data is already in the cache, return it from there.
      if(typeof ConfigLocal[channel][value] !== "undefined") {
        return ConfigLocal[channel][value];
      }
      
      // If the data isn't in the cache, load it from file.
      if(ConfigData.localOptions.includes(value)) {
        var currentConfig;
        try {
          currentConfig = fs.readFileSync(file).toString();

          currentConfig = JSON.parse(currentConfig);

          // Cache the data so it doesn't need to be re-read.
          // This also eliminates issues if the file is changed without restarting.
          ConfigLocal[channel] = currentConfig;

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
      throw new Error("Attempting to retrieve a token through getConfigVal. This may indicate a bad module or other security risk.");
    }

    return Config[value];
  }

  async postStat(stat, value) {
    try {
      var post = { stats: {}};
      post.stats[stat] = value;
      this.client.shard.send(post);
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
  async getTriviaQuestion(initial, tokenChannelID, tokenRetry, isFirstQuestion, category, typeInput, difficultyInput) {
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

      if(isCustom || Config.databaseURL.startsWith("file://")) {
        options.amount = 1;
      }
      else {
        options.amount =this.getConfigVal("database-cache-size");
      }

      options.type = typeInput;
      options.difficulty = difficultyInput;

      // Get a token if one is requested.
      var token;
      if(typeof tokenChannel !== "undefined") {
        try {
          token = await this.database.getTokenByIdentifier(tokenChannel.id);

          if(this.getConfigVal("debug-mode")) {
            this.send(tokenChannel, void 0, `*DB Token: ${token}*`);
          }
        } catch(error) {
          // Something went wrong. We'll display a warning but we won't cancel the game.
          console.log(`Failed to generate token for channel ${tokenChannel.id}: ${error.message}`);
          console.log(error.stack);

          // Skip display of session token messages if a pre-defined error message has been written.
          if(typeof this.maintenanceMsg !== "string") {
            this.send(tokenChannel, void 0, {embed: {
              color: 14164000,
              description: `Error: Failed to generate a session token for this channel. You may see repeating questions. (${error.message})`
            }});
          }
        }

        if(typeof token !== "undefined" && (isCustom || Config.databaseURL.startsWith("file://")) ) {
          // Set the token and continue.
          options.token = token;
        }
      }

      var json = {};
      var err;
      try {
        json = await this.database.fetchQuestions(options);

        if(this.getConfigVal("debug-database-flush") && !tokenRetry && typeof token !== "undefined") {
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
                this.send(tokenChannel, void 0, "You've played all of the available questions! Questions will start to repeat.");
              }
              else {
                this.send(tokenChannel, void 0, "You've played all of the questions in this category! Questions will start to repeat.");
              }
            }

            // Start over now that we have a token.
            return await this.getTriviaQuestion(initial, tokenChannelID, 1, isFirstQuestion, category, typeInput, difficultyInput);
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
          throw new Error(`Failed to query the trivia database with error code ${json.response_code} (${this.database.responses[json.response_code]}; ${error.message})`);
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

  parseCommand(msg, cmd, isAdmin) {
    var game = this.gameHandler.getActiveGame(msg.channel.id);
    var commands = this.commands;
  
    if(cmd.startsWith("STOP")) {
      commands.triviaStop(msg, cmd, isAdmin);
    }
  
    if(cmd.startsWith("CONFIG")) {
      commands.triviaConfig(cmd, msg.channel, msg.author, isAdmin);
    }
  
    if(cmd.startsWith("RESET")) {
      if(isAdmin &&this.getConfigVal("config-commands-enabled")) {
        this.client.shard.send({evalStr: "manager.eCmds.exportexit(1);"});
      }
    }
  
    if(cmd.startsWith("PLAY ADVANCED")) {
      if(typeof game !== "undefined" && game.inProgress) {
        return;
      }
  
      commands.triviaPlayAdvanced(void 0, msg.channel.id, msg.channel, msg.author, cmd.replace("PLAY ADVANCED",""));
      return;
    }
  
    var categoryInput;
  
    if(cmd.startsWith("PLAY HANGMAN ") || cmd === "PLAY HANGMAN") {
      categoryInput = cmd.replace("PLAY HANGMAN ","");
  
      if(this.getConfigVal("databaseURL") === "https://opentdb.com") {
        this.send(msg.channel, msg.author, "*(Beware: Some questions from OpenTDB are not designed for hangman-style gameplay)*");
      }
      
      commands.triviaPlay(msg, categoryInput, "hangman");
      this.postStat("commandPlayHangmanCount", 1);
      return;
    }
  
    if(cmd.startsWith("PLAY ") || cmd === "PLAY") {
      categoryInput = cmd.replace("PLAY ","");
      commands.triviaPlay(msg, categoryInput);
      return;
    }
  
    if(typeof commands.leagueParse !== "undefined" && cmd.startsWith("LEAGUE ")) {
      commands.leagueParse(msg, cmd);
      return;
    }
  
    if(cmd === "CATEGORIES") {
      commands.triviaCategories(msg, this);
      return;
    }
  
    if(cmd === "PING") {
      commands.triviaPing(msg);
      return;
    }
    
    if(cmd === "PONG") {
      commands.triviaPing(msg, true);
      return;
    }
  }

  // # this.parse #
  parse(str, msg) {
    // No games in fallback mode
    if(this.isFallbackMode(msg.channel.id)) {
      return;
    }

    // Str is always uppercase
    var id = msg.channel.id;
    var game = this.gameHandler.getActiveGame(id);
    var gameExists = typeof game !== "undefined";

    // Other bots can't use commands
    if(msg.author.bot === true &&this.getConfigVal("allow-bots") !== true) {
      return;
    }

    var prefix =this.getConfigVal("prefix").toUpperCase();

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
      var parsed = parse(game, str, id, msg.author.id, name);

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
          },this.getConfigVal("auto-delete-answers-timer", msg.channel));
        }

        return;
      }
    }

    // Check for command whitelist permissions before proceeding.
    var cmdWhitelist =this.getConfigVal("command-whitelist", msg.channel);
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

    // Admin check
    var isAdmin;
    if(this.getConfigVal("disable-admin-commands", msg.channel) !== true) {
      // Admin if there is a valid member object and they have permission.
      if(msg.member !== null && msg.member.permissions.has("MANAGE_GUILD")) {
        isAdmin = true;
      }
      else if(msg.channel.type === "DM") {
        // Admin if the game is run in a DM.
        isAdmin = true;
      }
      else if(this.getConfigVal("command-whitelist", msg.channel).length > 0) {
        // By this point, we know this person is whitelisted - auto admin
        isAdmin = true;
      }
    }

    // ## Advanced Game Args ##
    this.parseAdv(id, msg, isAdmin);

    // ## Help Command Parser ##
    if(str === prefix + "HELP" || str.includes(`<@!${this.client.user.id}>`)) {
      this.commands.triviaHelp(msg, this.database);
      return;
    }

    // ## Normal Commands ##
    // If the string starts with the specified prefix (converted to uppercase)
    if(str.startsWith(prefix)) {
      var cmd = str.replace(prefix, "");
      this.parseCommand(msg, cmd, isAdmin);
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

    this.parseAnswer(str, id, user.id, username,this.getConfigVal("score-value", reaction.message.channel));
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
    if(skipOverride !== true || !this.getConfigVal("config-commands-enabled")) {
      // TEMPORARY: This is an extra failsafe to make sure this only runs when intended.
      return;
    }
  
    if(value.toLowerCase().includes("token")) {
      return -1;
    }
  
    var file = ConfigData.configFile;
    var configToWrite = JSON.parse(JSON.stringify(Config));
  
    if(isLocal) {
      if(isLocal) {
        file = `./Options/config_${localID}.json`;
      }
  
      // Get the value first so the file caches in case it hasn't already.
     this.getConfigVal(value, localID);
  
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
        if(!ConfigData.localOptions.includes(key)) {
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
    if(this.getConfigVal("debug-log")) {
      console.log(str);
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
      if(typeof msg !== "undefined" && typeof msg.embed !== "undefined") {
        msg.embeds = [ msg.embed ];
        delete msg.embed;
      }
      
      msg = await channel.send(msg);
    } catch(err) {
      console.warn("Message send error: " + err);
      console.trace();
      if(typeof author !== "undefined") {
        if(channel.type !== "DM") {
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
        }
        else {
          console.warn(`Failed to send message to user ${author.id}. (already in DM)`);
        }
      }
      else {
        console.warn("Failed to send message to channel, user object nonexistent. Dumping message data...");
        console.log(msg);
      }
    }
    if(this.getConfigVal("auto-delete-msgs", channel) && noDelete !== true) {
      setTimeout(() => {
        msg.delete();
      },this.getConfigVal("auto-delete-msgs-timer", msg.channel));
    }
    
    return msg;
  }

  isFallbackMode (channel) {
    if(this.getConfigVal("fallback-mode")) {
      if(typeof this.getConfigVal("fallback-exceptions") !== "undefined" &&this.getConfigVal("fallback-exceptions").indexOf(channel) !== -1) {
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
  
        var style = parseInt(i) === game.question.displayCorrectID?"SUCCESS":"SECONDARY";
  
        game.buttons.components[i].setDisabled(true);
        game.buttons.components[i].setStyle(style);
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
      var editDone = await Promise.race([timeout, game.message.edit(edit)]);
  
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
  parseAnswerHangman(game, str, id, userId, username) {
    var input = str.toLowerCase();
    // Decode and remove all non-alphabetical characters
    var answer = game.Trivia.formatStr(game.question.answer).toLowerCase().replace(/\W/g, "");
  
    // Return -1 if the input is a command.
    // If the input is much longer than the actual answer, assume that it is not an attempt to answer.
    if(input.startsWith(game.getConfig("prefix", id)) || input.length > answer.length*2) {
      return -1;
    }
  
    // Pass whether or not the answer is a match.
    return game.submitAnswer(userId, username, input.replace(/\W/g, "") === answer);
  }
  
  // # this.parseAnswer # //
  // Parses a user's letter answer and scores it accordingly.
  // Str: Letter answer -- id: channel identifier.
  //    If undefined, automatically considered incorrect. If null, automatically considered correct.
  // scoreValue: Score value from the config file.
  parseAnswer(game, str, channelId, userId, username) {
    if(!game.inRound) {
      // Return -1 since there is no game.
      return -1;
    }
  
    // If they already answered and configured to do so, don't accept subsquent answers.
    if(game.getConfig("accept-first-answer-only", channelId) && typeof game.usersActive[userId] !== "undefined") {
      return;
    }
  
    // undefined, null, or A-D are considered valid inputs for parsing
    if(typeof str === "undefined" || str === null || str === "A" || str === "B" || (game.isTrueFalse !== 1 && (str === "C"|| str === "D"))) {
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
  
      if(typeof game === "undefined" || !game.isTrueFalse) {
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
    var buttons = new MessageActionRow();
  
    for(var i = 0; i <= answers.length-1; i++) {
      var style, text;
  
      text = `${Letters[i]}: ${this.formatStr(answers[i])}`;
      style = "SECONDARY";
  
      if(text.length > 80) {
        text = text.slice(0, 77);
        text = `${text}...`;
      }
  
      buttons.addComponents(
        new MessageButton()
        .setCustomId("answer_" + Letters[i])
        .setLabel(this.formatStr(text))
        .setStyle(style),
      );
    }
  
    return [ buttons ];
  }
  
  async buildCategorySearchIndex() {
    this.categorySearchIndex = JSON.parse(JSON.stringify(await this.database.getCategories()));
  
    for(var el in this.categorySearchIndex) {
      var index = this.categorySearchIndex[el];
      index.indexName = index.name.toUpperCase().replace(":", "").replace(" AND ", " & ");
    }
  }
  
  // getCategoryFromStr
  // Returns a category based on the string specified. Returns undefined if no category is found.
  async getCategoryFromStr(str) {
    // Automatically give "invalid category" if query is shorter than 3 chars.
    if(str.length < 3) {
      return void 0;
    }
  
    // If we haven't already, initialize a category list index.
    if(typeof this.categorySearchIndex === "undefined") {
      await this.buildCategorySearchIndex();
    }
  
    var strCheck = str.toUpperCase().replace(":", "").replace(" AND ", " & ");
    return this.categorySearchIndex.find((el) => {
      return el.indexName.toUpperCase().includes(strCheck);
    });
  }
  
  // Detect button answers
  buttonPress(message, answer, userId, username) {
    var id = message.channel.id;
    var game = this.gameHandler.getActiveGame(id);
  
    // Return -1 to indicate that this is not a valid round.
    if(typeof game === "undefined" || message.id !== game.messageId || !game.inRound)
      return -1;
  
    this.parseAnswer(game, answer, id, userId, username,this.getConfigVal("score-value", message.channel));
  
    return Object.keys(game.usersActive).length;
  }
  
  async postStats() {
    var listings = new Listings(this.client.user.id, this.client.shard.ids);
    for(var site in Config["listing-tokens"]) {
      listings.setToken(site, Config["listing-tokens"][site]);
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

process.on("SIGTERM", function() {
  console.log("Exit with termination signal, exporting game data...");
  //this.exportGame();
  process.exit();
});

module.exports = TriviaDiscord;
