const { MessageActionRow, MessageButton } = require("discord.js");
const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const JSON = require("circular-json");
const FileDB = require("./lib/database/filedb.js");
const MergerDB = require("./lib/database/mergerdb.js");
const OpenTDB = require("./lib/database/opentdb.js");
const GameHandler = require("./lib/game_handler.js");

const Listings = require("./lib/listings_discord");
var ConfigData = require("./lib/config.js")(process.argv[2]);

var Config = ConfigData.config;
var ConfigLocal = {};

var Trivia = exports;
Trivia.gameHandler = new GameHandler(Trivia);

// getConfigValue(value, channel, guild)
// channel: Unique identifier for the channel. If blank, falls back to guild.
//          If detected as a discord.js TextChannel object, automatically fills the
//          ID for itself and the guild.
// guild: Unique identifier for the server. If blank, falls back to global.
function getConfigVal(value, channel, guild) {
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

  var file = `./Options/config_${channel}.json`;
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
Trivia.getConfigVal = getConfigVal;

Trivia.postStat = async (stat, value) => {
  try {
    var post = { stats: {}};
    post.stats[stat] = value;
    global.client.shard.send(post);
  }
  catch(err) {
    console.warn(`Failed to post stat ${stat}: ${err}`);
  }

};

Trivia.filterName = (name) => {
  // Pass an escape character to Discord for this set of characters
  name = name.replace(/https:\/\//g, "https\\://");
  name = name.replace(/http:\/\//g, "http\\://");
  return name.replace(/[@*_`<>[\]<>]/g, "\\$&");
};

function setConfigVal(value, newValue, skipOverride, localID) {
  var isLocal = typeof localID !== "undefined";
  if(skipOverride !== true || !getConfigVal("config-commands-enabled")) {
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
    getConfigVal(value, localID);

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
Trivia.setConfigVal = setConfigVal;

function debugLog(str) {
  if(getConfigVal("debug-log")) {
    console.log(str);
  }
}
Trivia.debugLog = debugLog;

global.client.on("ready", () => {
  // Initialize restricted channels
  var restrictedChannelsInput = getConfigVal("channel-whitelist");
  Trivia.restrictedChannels = [];
  if(typeof restrictedChannelsInput !== "undefined" && restrictedChannelsInput.length !== 0) {
    // Can't use for..in here because is isn't supported by Map objects.
    global.client.channels.cache.forEach((channel) => {
      for(var i in restrictedChannelsInput) {
        var channelInput = restrictedChannelsInput[i];

        if(Trivia.restrictedChannels.length === restrictedChannelsInput.length) {
          break;
        }

        if(channelInput === channel.id.toString()) {
          Trivia.restrictedChannels.push(channel.id);
        }
        else if(channelInput.toString().replace("#", "").toLowerCase() === channel.name) {
          Trivia.restrictedChannels.push(channel.id);
        }
      }

    });
  }
});

// TODO: Use String.fromCharCode(65+letter) instead of this array?
const Letters = ["A", "B", "C", "D"];
// Convert the hex code to decimal so Discord can read it.
Trivia.embedCol = Buffer.from(getConfigVal("embed-color").padStart(8, "0"), "hex").readInt32BE(0);

// General game functions
Trivia.gameHandler.on("game_create", (game) => {
  var channel = global.client.channels.cache.find((obj) => (obj.id === game.ID));

  // Channel no-longer exists -- either something went wrong or the channel was deleted.
  if(typeof channel === "undefined") {
    game.endGame();
  }

  game.on("game_error", (err) => {
    if(err.code !== -1) {
      console.log("Database query error:");
      console.log(err);
    }
    Trivia.send(channel, void 0, {embed: {
      color: 14164000,
      description: `An error occurred while querying the trivia database: ${err}`
    }});
  });

  game.on("round_initialize", async (finalString) => {
    var msg;

    var components;
    if(game.gameMode === "standard") {
      components = buildButtons(game.question.answersDisplay, game.question.type === "boolean");
      game.buttons = components[0];
    }

    try {
      msg = await Trivia.send(channel, void 0, {embed: {
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
      addAnswerReactions(msg, game);
    }

    if(game.gameMode === "hangman" && getConfigVal("hangman-hints", channel) === true) {  // DELTA: Added deactivatable hangman hints
      // Show a hint halfway through.
      // No need for special handling here because it will auto-cancel if
      // the game ends before running.
      var answer = game.question.answer; // Pre-define to avoid errors.
      setTimeout(() => {
        game.doHangmanHint(answer);
      },
      getConfigVal("round-length", channel)/2);
    }
  });

  game.on("round_end", (finalStr, roundTimeout) => {
    if(finalStr === "") {
      return;
    }

    Trivia.send(channel, void 0, {embed: {
      color: game.color,
      image: {url: game.imageAnswer}, // If any is defined
      description: finalStr
    }})
    .catch(() => {
      game.endGame();
    })
    .then((msg) => {
      if(typeof game !== "undefined" && !game.cancelled) {
        setTimeout(() => {
          if(getConfigVal("auto-delete-msgs", channel)) {
            msg.delete()
            .catch((err) => {
              console.log(`Failed to delete message - ${err.message}`);
            });
          }          
        }, roundTimeout);
      }

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

        game.message.edit(edit);
      }
    });
  });

  game.on("game_msg", (msg) => {
    Trivia.send(channel, void 0, msg);
  });
});

var allowLongAnswers = getConfigVal("database-allow-long-answers") || getConfigVal("hangman-mode");

if(getConfigVal("database-merge")) {
  // TODO: Rather than killing the base process, the manager should
  // do this automatically when an initial error is thrown.
  if(!Config.databaseURL.startsWith("file://")) {
    console.error("A file path starting with 'file://' must be specified when the database merger is enabled.");
    global.client.shard.send({evalStr: "process.exit();"});
  }

  Trivia.database = new MergerDB(Config.databaseURL, allowLongAnswers);
}
else {
  // Check database protocol
  if(Config.databaseURL.startsWith("file://")) {
    Trivia.database = new FileDB(Config.databaseURL, allowLongAnswers);
  }
  else {
    Trivia.database = new OpenTDB(getConfigVal("databaseURL"));
  }
}

// Database events
Trivia.database.on("debuglog", Trivia.debugLog);

if(typeof Trivia.database === "undefined" || Trivia.database.error) {
  console.error("Failed to load the database.");
  global.client.shard.send({evalStr: "process.exit();"});
}

Trivia.questions = [];

// Generic message sending function.
// This is to avoid repeating the same error catchers throughout the script.

//    channel: Channel ID
//    author: Author ID (Omit to prevent error messages from going to the author's DMs)
//    msg: Message Object
//    noDelete: If enabled, message will not auto-delete even if configured to
// TODO rewrite
Trivia.send = async function(channel, author, msg, callback, noDelete) {
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
  if(getConfigVal("auto-delete-msgs", channel) && noDelete !== true) {
    setTimeout(() => {
      msg.delete();
    }, getConfigVal("auto-delete-msgs-timer", msg.channel));
  }
  
  return msg;
};

Trivia.commands = {};
var commands = Trivia.commands;

Trivia.isFallbackMode = (channel) => {
  if(getConfigVal("fallback-mode")) {
    if(typeof getConfigVal("fallback-exceptions") !== "undefined" && getConfigVal("fallback-exceptions").indexOf(channel) !== -1) {
      // Return if specified channel is an exception
      return;
    }
    else {
      return true;
    }
  }
};

// getTriviaQuestion
// Returns a promise, fetches a random question from the database.
// If initial is set to true, a question will not be returned. (For initializing the cache)
// If tokenChannel is specified (must be a discord.js TextChannel object), a token will be generated and used.
// TODO: We need to migrate this to event emitter format in order to iron out the tokenChannel usage
Trivia.getTriviaQuestion = async function(initial, tokenChannelID, tokenRetry, isFirstQuestion, category, typeInput, difficultyInput) {
  var length = Trivia.questions.length;
  var toReturn;

  var tokenChannel = global.client.channels.cache.find((obj) => (obj.id === tokenChannelID)); // TODO: Temporary

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
      options.amount = getConfigVal("database-cache-size");
    }

    options.type = typeInput;
    options.difficulty = difficultyInput;

    // Get a token if one is requested.
    var token;
    if(typeof tokenChannel !== "undefined") {
      try {
        token = await Trivia.database.getTokenByIdentifier(tokenChannel.id);

        if(getConfigVal("debug-mode")) {
          Trivia.send(tokenChannel, void 0, `*DB Token: ${token}*`);
        }
      } catch(error) {
        // Something went wrong. We'll display a warning but we won't cancel the game.
        console.log(`Failed to generate token for channel ${tokenChannel.id}: ${error.message}`);
        console.log(error.stack);

        // Skip display of session token messages if a pre-defined error message has been written.
        if(typeof Trivia.maintenanceMsg !== "string") {
          Trivia.send(tokenChannel, void 0, {embed: {
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
      json = await Trivia.database.fetchQuestions(options);

      if(getConfigVal("debug-database-flush") && !tokenRetry && typeof token !== "undefined") {
        err = new Error("Token override");
        err.code = 4;
        throw err;
      }
    } catch(error) {
      if(error.code === 4 && typeof token !== "undefined") {
        // Token empty, reset it and start over.
        if(tokenRetry !== 1) {
          try {
            await Trivia.database.resetToken(token);
          } catch(error) {
            console.log(`Failed to reset token - ${error.message}`);
            throw new Error(`Failed to reset token - ${error.message}`);
          }

          if(!isFirstQuestion) {
            if(typeof category === "undefined") {
              Trivia.send(tokenChannel, void 0, "You've played all of the available questions! Questions will start to repeat.");
            }
            else {
              Trivia.send(tokenChannel, void 0, "You've played all of the questions in this category! Questions will start to repeat.");
            }
          }

          // Start over now that we have a token.
          return await Trivia.getTriviaQuestion(initial, tokenChannelID, 1, isFirstQuestion, category, typeInput, difficultyInput);
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
        if(typeof Trivia.maintenanceMsg !== "string") {
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
          delete Trivia.database.tokens[tokenChannel.id];
        }

        // Author is passed through; Trivia.send will handle it if author is undefined.
        throw new Error(`Failed to query the trivia database with error code ${json.response_code} (${Trivia.database.responses[json.response_code]}; ${error.message})`);
      }
    }
    finally {
      Trivia.questions = json;
    }
  }

  if(!initial) {
    // Just in case, check the cached question count first.
    if(Trivia.questions.length < 1) {
      throw new Error("Received empty response while attempting to retrieve a Trivia question.");
    }
    else {
      toReturn = Trivia.questions[0];

      delete Trivia.questions[0];
      Trivia.questions = Trivia.questions.filter((val) => Object.keys(val).length !== 0);

      return toReturn;
    }
  }
};

// Initialize the question cache
if(!Config.databaseURL.startsWith("file://")) {
  Trivia.getTriviaQuestion(1)
  .catch((err) => {
    console.log(`An error occurred while attempting to initialize the question cache:\n ${err}`);
  });
}

Trivia.formatStr = (str) => {
  str = entities.decode(str);
  str = str.replace(/_/g, "\\_");

  return str;
};

// # parseAnswerHangman # //
Trivia.parseAnswerHangman = function(game, str, id, userId, username) {
  var input = str.toLowerCase();
  // Decode and remove all non-alphabetical characters
  var answer = Trivia.formatStr(game.question.answer).toLowerCase().replace(/\W/g, "");

  // Return -1 if the input is a command.
  // If the input is much longer than the actual answer, assume that it is not an attempt to answer.
  if(input.startsWith(getConfigVal("prefix", id)) || input.length > answer.length*2) {
    return -1;
  }

  // Pass whether or not the answer is a match.
  return game.submitAnswer(userId, username, input.replace(/\W/g, "") === answer);
};

// # Trivia.parseAnswer # //
// Parses a user's letter answer and scores it accordingly.
// TODO: Separate string parsing from scoring.
// Str: Letter answer -- id: channel identifier.
//    If undefined, automatically considered incorrect. If null, automatically considered correct.
// scoreValue: Score value from the config file.
Trivia.parseAnswer = function (game, str, channelId, userId, username) {
  if(!game.inRound) {
    // Return -1 since there is no game.
    return -1;
  }

  // If they already answered and configured to do so, don't accept subsquent answers.
  if(getConfigVal("accept-first-answer-only", channelId) && typeof game.activeParticipants[userId] !== "undefined") {
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
};

async function addAnswerReactions(msg, game) {
  try {
    await msg.react("🇦");
    await msg.react("🇧");

    if(typeof game === "undefined" || !game.isTrueFalse) {
      await msg.react("🇨");
      await msg.react("🇩");
    }
  } catch (error) {
    console.log(`Failed to add reaction: ${error}`);

    Trivia.send(msg.channel, void 0, {embed: {
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
function buildButtons(answers) {
  var buttons = new MessageActionRow();

  for(var i = 0; i <= answers.length-1; i++) {
    var style, text;

    text = `${Letters[i]}: ${Trivia.formatStr(answers[i])}`;
    style = "SECONDARY";

    if(text.length > 80) {
      text = text.slice(0, 77);
      text = `${text}...`;
    }

    buttons.addComponents(
      new MessageButton()
      .setCustomId("answer_" + Letters[i])
      .setLabel(Trivia.formatStr(text))
      .setStyle(style),
    );
  }

  return [ buttons ];
}

Trivia.stopGame = (game, channel, auto) => {
  if(auto !== 1) {
    Trivia.postStat("commandStopCount", 1);
  }

  // These are defined beforehand so we can refer to them after the game is deleted.
  let timeout = game.timeout;
  let inRound = game.inRound;
  let finalScoreStr = Trivia.gameHandler.leaderboard.makeScoreStr(game.scores, game.totalParticipants);
  let totalParticipantCount = Object.keys(game.totalParticipants).length;

  game.cancelled = 1;

  if(typeof timeout !== "undefined" && typeof timeout._onTimeout === "function") {
    var onTimeout = timeout._onTimeout;
    clearTimeout(timeout);

    // If a round is in progress, display the answers before cancelling the game.
    // The game will detect "cancelled" and display the proper message.
    if(game.inRound && typeof timeout !== "undefined") {
      onTimeout();
    }
  }

  // If there's still a game, clear it.
  if(typeof game !== "undefined") {
    game.endGame(true);
  }

  // Display a message if between rounds
  if(!inRound && !game.getConfig("use-fixed-rounds")) { // DELTA: Only if no fixed rounds are played.
    var headerStr = `**Final score${totalParticipantCount!==1?"s":""}:**`;

    Trivia.send(channel, void 0, {embed: {
      color: Trivia.embedCol,
      description: `Game ended by admin.${finalScoreStr!==""?`\n\n${headerStr}\n`:""}${finalScoreStr}`
    }});
  }
};

commands.playAdv = require("./lib/commands/play_advanced.js")(Trivia, global.client);
var parseAdv = commands.playAdv.parseAdv;
commands.triviaHelp = require("./lib/commands/help.js")(Config, Trivia);
commands.triviaCategories = require("./lib/commands/categories.js")(Config);
commands.triviaPlay = require("./lib/commands/play.js")(Config, Trivia, commands, getConfigVal);
commands.triviaPlayAdvanced = commands.playAdv.triviaPlayAdvanced;
commands.triviaStop = require("./lib/commands/stop.js")(Config, Trivia, commands, getConfigVal);
commands.triviaConfig = require("./lib/commands/config.js")(Trivia, ConfigData, Config);
commands.triviaPing = require("./lib/commands/ping.js")(Trivia);

Trivia.buildCategorySearchIndex = async () => {
  Trivia.categorySearchIndex = JSON.parse(JSON.stringify(await Trivia.database.getCategories()));

  for(var el in Trivia.categorySearchIndex) {
    var index = Trivia.categorySearchIndex[el];
    index.indexName = index.name.toUpperCase().replace(":", "").replace(" AND ", " & ");
  }
};

// getCategoryFromStr
// Returns a category based on the string specified. Returns undefined if no category is found.
Trivia.getCategoryFromStr = async (str) => {
  // Automatically give "invalid category" if query is shorter than 3 chars.
  if(str.length < 3) {
    return void 0;
  }

  // If we haven't already, initialize a category list index.
  if(typeof Trivia.categorySearchIndex === "undefined") {
    await Trivia.buildCategorySearchIndex();
  }

  var strCheck = str.toUpperCase().replace(":", "").replace(" AND ", " & ");
  return Trivia.categorySearchIndex.find((el) => {
    return el.indexName.toUpperCase().includes(strCheck);
  });
};

function parseCommand(msg, cmd, isAdmin) {
  var game = Trivia.gameHandler.getActiveGame(msg.channel.id);

  if(cmd.startsWith("STOP")) {
    commands.triviaStop(msg, cmd, isAdmin);
  }

  if(cmd.startsWith("CONFIG")) {
    commands.triviaConfig(cmd, msg.channel, msg.author, isAdmin);
  }

  if(cmd.startsWith("RESET")) {
    if(isAdmin && getConfigVal("config-commands-enabled")) {
      global.client.shard.send({evalStr: "manager.eCmds.exportexit(1);"});
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

    if(getConfigVal("databaseURL") === "https://opentdb.com") {
      Trivia.send(msg.channel, msg.author, "*(Beware: Some questions from OpenTDB are not designed for hangman-style gameplay)*");
    }
    
    commands.triviaPlay(msg, categoryInput, "hangman");
    Trivia.postStat("commandPlayHangmanCount", 1);
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
    commands.triviaCategories(msg, Trivia);
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

// # trivia.parse #
Trivia.parse = (str, msg) => {
  // No games in fallback mode
  if(Trivia.isFallbackMode(msg.channel.id)) {
    return;
  }

  // Str is always uppercase
  var id = msg.channel.id;
  var game = Trivia.gameHandler.getActiveGame(id);
  var gameExists = typeof game !== "undefined";

  // Other bots can't use commands
  if(msg.author.bot === true && getConfigVal("allow-bots") !== true) {
    return;
  }

  var prefix = getConfigVal("prefix").toUpperCase();

  // ## Answers ##
  // Check for letters if not using reactions
  if(gameExists && game.gameMode !== "reaction" && game.gameMode !== "standard") {
    var name = Trivia.filterName(msg.member !== null?msg.member.displayName:msg.author.username);
    var parse;

    if(game.gameMode === "hangman") {
      parse = Trivia.parseAnswerHangman;
    }
    else {
      parse = Trivia.parseAnswer;
    }
    var parsed = parse(game, str, id, msg.author.id, name);

    if(parsed !== -1) {
      if(getConfigVal("auto-delete-answers", msg.channel) && !game[id].isDMGame) { // TODO
        setTimeout(() => {
          msg.delete()
          .catch((err) => {
            if(err.message !== "Missing Permissions") {
              console.log(err);
              console.log("Failed to delete player answer: " + err.message);
            }
          });
        }, getConfigVal("auto-delete-answers-timer", msg.channel));
      }

      return;
    }
  }

  // Check for command whitelist permissions before proceeding.
  var cmdWhitelist = getConfigVal("command-whitelist", msg.channel);
  var whitelistActive = (typeof cmdWhitelist !== "undefined" && cmdWhitelist.length !== 0);
  var isWhitelisted = (cmdWhitelist.indexOf(msg.author.tag) !== -1 || cmdWhitelist.indexOf(msg.author.id) !== -1);
  if(whitelistActive && !isWhitelisted) {
    return;
  }

  // Check the channel whitelist before proceeding.
  if(Trivia.restrictedChannels.length !== 0) {
    // Cancel if the channel isn't on the whitelist.
    if(Trivia.restrictedChannels.indexOf(msg.channel.id) === -1) {
      return;
    }
  }

  // Admin check
  var isAdmin;
  if(getConfigVal("disable-admin-commands", msg.channel) !== true) {
    // Admin if there is a valid member object and they have permission.
    if(msg.member !== null && msg.member.permissions.has("MANAGE_GUILD")) {
      isAdmin = true;
    }
    else if(msg.channel.type === "DM") {
      // Admin if the game is run in a DM.
      isAdmin = true;
    }
    else if(getConfigVal("command-whitelist", msg.channel).length > 0) {
      // By this point, we know this person is whitelisted - auto admin
      isAdmin = true;
    }
  }

  // ## Advanced Game Args ##
  parseAdv(id, msg, isAdmin);

  // ## Help Command Parser ##
  if(str === prefix + "HELP" || str.includes(`<@!${global.client.user.id}>`)) {
    commands.triviaHelp(msg, Trivia.database);
    return;
  }

  // ## Normal Commands ##
  // If the string starts with the specified prefix (converted to uppercase)
  if(str.startsWith(prefix)) {
    var cmd = str.replace(prefix, "");
    parseCommand(msg, cmd, isAdmin);
  }
};

// triviaResumeGame
// Restores a game that does not have an active timeout.
async function triviaResumeGame(json, id) {
  var channel;
  var game = Trivia.gameHandler.getActiveGame(id);
  if(typeof json.userId !== "undefined") {
    // Find the DM channel
    channel = global.client.users.get(json.userId);

    // Re-create the dmChannel object.
    if(channel !== null) {
      channel.createDM()
      .then((dmChannel) => {
        channel = dmChannel;
      });
    }

  }
  else {
    channel = await global.client.channels.fetch(id);
  }

  if(!json.inProgress) {
    game.stopGame();
    return;
  }

  if(channel === null) {
    console.warn(`Unable to find channel '${id}' on shard ${global.client.shard.ids}. Game will not resume.`);
    game.stopGame();
    return;
  }

  json.resuming = 1;

  var date = game.date;
  if(typeof game.date === "undefined") {
    return;
  }

  var timeout;

  // If more than 60 seconds have passed, cancel the game entirely.
  if(new Date().getTime() > date.getTime()+60000) {
    console.log(`Imported game in channel ${id} is more than one minute old, aborting...`);
    game.stopGame();
    return;
  }

  if(json.inRound) {
    game = json;
    game.resuming = 1;

    // Calculate timeout based on game time
    // TODO: Account for hangman games properly
    date.setMilliseconds(date.getMilliseconds()+getConfigVal("round-length", channel));
    timeout = date-new Date();

    game.timeout = setTimeout(() => {
      game.endRound();
    }, timeout);
  }
  else {
    if(Object.keys(json.activeParticipants).length !== 0) {
      // Since date doesn't update between rounds, we'll have to add both the round's length and timeout
      date.setMilliseconds(date.getMilliseconds()+getConfigVal("round-timeout", channel)+getConfigVal("round-length", channel));
      timeout = date-new Date();

      var options = { category: json.category };
      game.timeout = setTimeout(() => {
        Trivia.gameHandler.createGame(Trivia.gameHandler, channel.id, channel.guild.id, void 0, options).initializeRound();
      }, timeout);
    }
  }
}

// Detect reaction answers
Trivia.reactionAdd = async function(reaction, user) {
  var id = reaction.message.channel.id;
  var game = Trivia.gameHandler.getActiveGame(id);
  var str = reaction.emoji.name;

  if(typeof game === "undefined")
    return;
  
  if(typeof game.message === "undefined")
    return;
  
  if(game.gameMode !== "reaction") // Reaction mode only
    return;

  if(reaction.message.id !== game.messageId)
    return;
  
  if(user === global.client.user) // Ignore our own client
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

  username = Trivia.filterName(username);

  Trivia.parseAnswer(str, id, user.id, username, getConfigVal("score-value", reaction.message.channel));
};

// Detect button answers
Trivia.buttonPress = (message, answer, userId, username) => {
  var id = message.channel.id;
  var game = Trivia.gameHandler.getActiveGame(id);

  // Return -1 to indicate that this is not a valid round.
  if(typeof game === "undefined" || message.id !== game.messageId || !game.inRound)
    return -1;

  Trivia.parseAnswer(game, answer, id, userId, username, getConfigVal("score-value", message.channel));

  return Object.keys(game.activeParticipants).length;
};

// # Game Exporter #
// Export the current game data to a file.
Trivia.exportGame = (file) => {
  // Copy the data so we don't modify the actual game object.
  var json = JSON.parse(JSON.stringify(Trivia.gameHandler.dumpGames()));

  // Remove the timeout so the game can be exported.
  Object.keys(json).forEach((key) => {
    if(typeof json[key].timeout !== "undefined") {
      delete json[key].timeout;
      delete json[key].message;
    }

    // If there is no guild ID, the game is a DM game.
    // DM games are re-assigned to make sure they show up last.
    // This ensures that the first key is always a non-DM game if possible.
    if(typeof json[key].guildId === "undefined") {
      var replace = json[key];
      delete json[key];
      json[key] = replace;
    }

    // Never export a game if it has already been exported before.
    // This helps ensure that a restart loop won't happen.
    if(json[key].imported) {
      delete json[key];
    }
  });

  file = file || "./game."  + global.client.shard.ids + ".json.bak";
  try {
    fs.writeFileSync(file, JSON.stringify(json, null, "\t"), "utf8");
    console.log(`Game exported to ${file}`);
  }
  catch(err) {
    console.error(`Failed to write to game.json.bak with the following err:\n${err}`);
  }
};

// # Game Importer #
// Import game data from JSON files.
// input: file string or valid JSON object
// unlink (bool): delete file after opening
Trivia.importGame = (input, unlink) => {
  console.log(`Importing games to shard ${global.client.shard.ids} from file...`);
  var json;
  if(typeof input === "string") {
    try {
      var file = fs.readFileSync(input).toString();

      // If specified to do so, delete the file before parsing it.
      // This is to help prevent a restart loop if things go horribly wrong.
      if(unlink) {
        fs.unlinkSync(input);
      }

      json = JSON.parse(file);
    } catch(error) {
      console.log(`Failed to parse JSON from ./game.${global.client.shard.ids}.json.bak`);
      console.log(error.message);
      return;
    }
  }
  else if(typeof input === "object") {
    json = input;
  }
  else {
    throw new Error("Attempting to import an invalid or undefined object as a game!");
  }

  console.log("Game importing WIP");
};

// # Maintenance Shutdown Command #
Trivia.doMaintenanceShutdown = () => {
  console.log(`Clearing ${Trivia.gameHandler.getGameCount()} games on shard ${global.client.shard.ids}`);
  var gameDump = this.gameHandler.dumpGames();

  Object.keys(gameDump).forEach((key) => {
    var channel = Trivia.gameHandler.getActiveGame(key);
    Trivia.stopGame(key, 1);

    game.broadcast("TriviaBot is being temporarily shut down for maintenance. Please try again in a few minutes.");
  });

  return;
};

Trivia.postStats = async () => {
  var listings = new Listings(global.client.user.id);
  for(var site in Config["listing-tokens"]) {
    listings.setToken(site, Config["listing-tokens"][site]);
  }

  if(global.client.shard.ids[0] === global.client.shard.count-1) {
    var countArray = await global.client.shard.fetchClientValues("guilds.cache.size");
    var guildCount = countArray.reduce((prev, val) => prev + val, 0);
    var shardCount = global.client.shard.ids.length;

    listings.postBotStats(guildCount, shardCount);
  }
};

process.on("exit", (code) => {
  if(code !== 0) {
    console.log("Exit with non-zero code, exporting game data...");
    Trivia.exportGame();
  }
});

process.on("SIGTERM", function() {
  console.log("Exit with termination signal, exporting game data...");
  Trivia.exportGame();
  process.exit();
});

// ## Import on Launch ## //
global.client.on("ready", () => {
  var file = `./game.${global.client.shard.ids}.json.bak`;
  if(fs.existsSync(file)) {
    // Import the file, then delete it.
    Trivia.importGame(file, 1);
  }
});

