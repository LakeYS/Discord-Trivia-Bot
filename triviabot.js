const { MessageActionRow, MessageButton } = require("discord.js");
const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const JSON = require("circular-json");
const Listings = require("./lib/listings_discord");
var ConfigData = require("./lib/config.js")(process.argv[2]);

var Config = ConfigData.config;
var ConfigLocal = {};

var Trivia = exports;

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
    if(typeof ConfigLocal[channel] === "undefined") {
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
    else {
      // This data is already in the cache, return it from there.
      if(typeof ConfigLocal[channel][value] !== "undefined") {
        return ConfigLocal[channel][value];
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

var Database = "";
if(getConfigVal("database-merge")) {
  // TODO: Rather than killing the base process, the manager should
  // do this automatically when an initial error is thrown.
  if(!Config.databaseURL.startsWith("file://")) {
    console.error("A file path starting with 'file://' must be specified when the database merger is enabled.");
    global.client.shard.send({evalStr: "process.exit();"});
  }

  Database = require("./lib/database/mergerdb.js")(Config);
}
else {
  Database = Config.databaseURL.startsWith("file://")?require("./lib/database/filedb.js")(Config):require("./lib/database/opentdb.js")(Config);
}

if(typeof Database === "undefined" || Database.error) {
  console.error("Failed to load the database.");
  global.client.shard.send({evalStr: "process.exit();"});
}

Trivia.database = Database;

var game = {};
global.questions = [];

// Generic message sending function.
// This is to avoid repeating the same error catchers throughout the script.
//    channel: Channel ID
//    author: Author ID (Omit to prevent error messages from going to the author's DMs)
//    msg: Message Object
//    callback: Callback Function (Can be used to detect error/success and react)
//    noDelete: If enabled, message will not auto-delete even if configured to
Trivia.send = function(channel, author, msg, callback, noDelete) {
  if(typeof msg !== "undefined" && typeof msg.embed !== "undefined") {
    msg.embeds = [ msg.embed ];
    delete msg.embed;
  }

  channel.send(msg)
  .catch((err) => {
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

    if(typeof callback === "function") {
      callback(void 0, err);
    }
  })
  .then((msg) => {
    if(typeof callback === "function") {
      callback(msg);
    }

    if(getConfigVal("auto-delete-msgs", channel) && noDelete !== true) {
      setTimeout(() => {
        msg.delete();
      }, getConfigVal("auto-delete-msgs-timer", msg.channel));
    }
  });
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
async function getTriviaQuestion(initial, tokenChannel, tokenRetry, isFirstQuestion, category, typeInput, difficultyInput) {
  var length = global.questions.length;
  var toReturn;

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
        token = await Database.getTokenByIdentifier(tokenChannel.id);

        if(getConfigVal("debug-mode")) {
          Trivia.send(tokenChannel, void 0, `*DB Token: ${token}*`);
        }
      } catch(error) {
        // Something went wrong. We'll display a warning but we won't cancel the game.
        console.log(`Failed to generate token for channel ${tokenChannel.id}: ${error.message}`);

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
      json = await Database.fetchQuestions(options);

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
            await Database.resetToken(token);
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
          return await getTriviaQuestion(initial, tokenChannel, 1, isFirstQuestion, category, typeInput, difficultyInput);
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
          delete Database.tokens[tokenChannel.id];
        }

        // Author is passed through; Trivia.send will handle it if author is undefined.
        throw new Error(`Failed to query the trivia database with error code ${json.response_code} (${Database.responses[json.response_code]}; ${error.message})`);
      }
    }
    finally {
      global.questions = json;
    }
  }

  if(!initial) {
    // Just in case, check the cached question count first.
    if(global.questions.length < 1) {
      throw new Error("Received empty response while attempting to retrieve a Trivia question.");
    }
    else {
      toReturn = global.questions[0];

      delete global.questions[0];
      global.questions = global.questions.filter((val) => Object.keys(val).length !== 0);

      return toReturn;
    }
  }
}

// Initialize the question cache
if(!Config.databaseURL.startsWith("file://")) {
  getTriviaQuestion(1)
  .catch((err) => {
    console.log(`An error occurred while attempting to initialize the question cache:\n ${err}`);
  });
}

// Function to end trivia games
function triviaEndGame(id) {
  if(typeof game[id] === "undefined") {
    console.warn("Attempting to clear empty game, ignoring.");
    return;
  }

  if(typeof game[id].timeout !== "undefined") {
    clearTimeout(game[id].timeout);
  }

  if(game[id].isLeagueGame) {
    Trivia.leaderboard.writeScores(game[id].scores, game[id].guildId, ["Monthly", "Weekly"], game[id].config.leagueName);
  }

  delete game[id];
}

Trivia.applyBonusMultiplier = (id, channel, userID) => {
  var score = getConfigVal("score-value", channel)[game[id].difficulty];

  var multiplier;

  var multiplierBase = getConfigVal("score-multiplier-max", channel);
  if(multiplierBase !== 0) {
    var index = Object.keys(game[id].participants).indexOf(userID)+1;

    // Score multiplier equation
    multiplier = multiplierBase/index+1;

    // Don't apply if the number is negative or passive.
    if(multiplier > 1) {
      var bonus = Math.floor((score*multiplier)-score);

      return bonus;
    }
  }
};

Trivia.formatStr = (str) => {
  str = entities.decode(str);
  str = str.replace(/_/g, "\\_");

  return str;
};

// # Trivia.doAnswerReveal #
// Ends the round, reveals the answer, and schedules a new round if necessary.
// TODO: Refactor (clean up and fix gameEndedMsg being relied on as a boolean check)
Trivia.doAnswerReveal = async (id, channel, answer, importOverride) => {
  if(typeof game[id] === "undefined" || !game[id].inProgress) {
    return;
  }

  game[id].config = game[id].config || {};

  var roundTimeout = getConfigVal("round-timeout", channel);

  if(typeof game[id].message !== "undefined" && getConfigVal("auto-delete-msgs", channel)) {
    game[id].message.delete()
    .catch((err) => {
      console.log(`Failed to delete message - ${err.message}`);
    });
  }
  else if(typeof game[id].buttons !== "undefined") {
    // Button handling
    for(let i in game[id].buttons.components) {
      if(typeof game[id].buttons.components[i] === "undefined") {
        console.warn(`Failed to retrieve component ${i} for game ${id}. Buttons may not appear correctly.`);
        break;
      }

      var style = parseInt(i) === game[id].correctId?"SUCCESS":"SECONDARY";

      game[id].buttons.components[i].setDisabled(true);
      game[id].buttons.components[i].setStyle(style);
    }

    var edit = { components: [ game[id].buttons ] };
    if(game[id].message.content !== "") {
      edit.content = game[id].message.content;
    }
    
    if(game[id].message.embeds.length !== 0) {
      edit.embeds = game[id].message.embeds;
    }

    // Wait for the message to edit, up to a timeout of 1000ms. After which, we will display a warning and continue.
    var timeout = new Promise((resolve) => { setTimeout(() => { resolve("TIMEDOUT"); }, 1000);});
    var editDone = await Promise.race([timeout, game[id].message.edit(edit)]);

    if(editDone === "TIMEDOUT") {
      console.warn(`Timed out while ending round for game ${id}.`);
    }
  }

  // Quick fix for timeouts not clearing correctly.
  if(answer !== game[id].answer && !importOverride) {
    console.warn(`WARNING: Mismatched answers in timeout for game ${id} (${answer}||${game[id].answer})`);
    return;
  }

  game[id].inRound = 0;

  // Custom options
  if(typeof game[id].config !== "undefined") {
    // Custom round count subtracts by 1 until reaching 0, then the game ends.
    if(typeof game[id].config.customRoundCount !== "undefined") {
      game[id].config.customRoundCount = game[id].config.customRoundCount-1;

      if(typeof game[id].config.intermissionTime !== "undefined" && game[id].config.customRoundCount <= game[id].config.totalRoundCount/2) {
        roundTimeout = game[id].config.intermissionTime;

        Trivia.send(channel, void 0, `Intermission - Game will resume in ${roundTimeout/60000} minute${roundTimeout/1000===1?"":"s"}.`);
        game[id].config.intermissionTime = void 0;
      }
    }
  }

  var correctUsersStr = "**Correct answers:**\n";

  var scoreStr = "";

  // If only one participant, we'll only need the first user's score.
  if(!getConfigVal("disable-score-display", channel)) {
    var scoreVal = game[id].scores[Object.keys(game[id].correctUsers)[0]];

    if(typeof scoreVal !== "undefined") {
      if(isNaN(game[id].scores[ Object.keys(game[id].correctUsers)[0] ])) {
        console.log("WARNING: NaN score detected, dumping game data...");
        console.log(game[id]);
      }

      scoreStr = `(${scoreVal.toLocaleString()} points)`;
    }
  }

  var gameEndedMsg = "", gameFooter = "";
  var doAutoEnd = 0;

  if(game[id].cancelled) {
    gameEndedMsg = "\n\n*Game ended by admin.*";
  }
  else if(game[id].config.useFixedRounds && game[id].config.customRoundCount <= 0) {
    // Custom round count is subtracted above -- If it's reached 0, auto end.
    gameEndedMsg = "\n\n*Game ended.*";
    doAutoEnd = 1;
  }
  else if(Object.keys(game[id].participants).length === 0 && !game[id].config.useFixedRounds) {
    // If there were no participants...
    // This is skipped in fixed rounds.
    if(game[id].emptyRoundCount+1 >= getConfigVal("rounds-end-after", channel)) {
      doAutoEnd = 1;
      gameEndedMsg = "\n\n*Game ended.*";
    } else {
      game[id].emptyRoundCount++;

      // Round end warning after we're halfway through the inactive round cap.
      if(!getConfigVal("round-end-warnings-disabled", channel) && game[id].emptyRoundCount >= Math.ceil(getConfigVal("rounds-end-after", channel)/2)) {
        var roundEndCount = getConfigVal("rounds-end-after", channel.id)-game[id].emptyRoundCount;
        gameFooter += `Game will end in ${roundEndCount} round${roundEndCount===1?"":"s"} if there is no activity.`;
      }
    }
  } else {
    // If there are participants and the game wasn't force-cancelled...
    game[id].emptyRoundCount = 0;
    doAutoEnd = 0;
  }

  if((gameEndedMsg === "" || getConfigVal("disable-score-display", channel)) && !getConfigVal("full-score-display", channel) ) {
    var truncateList = 0;

    if(Object.keys(game[id].correctUsers).length > 32) {
      truncateList = 1;
    }

    // ## Normal Score Display ## //
    if(Object.keys(game[id].correctUsers).length === 0) {
      if(Object.keys(game[id].participants).length === 1) {
        correctUsersStr = `Incorrect, ${Object.values(game[id].participants)[0]}!`;
      }
      else {
        correctUsersStr = correctUsersStr + "Nobody!";
      }
    }
    else {
      if(Object.keys(game[id].participants).length === 1) {
        // Only one player overall, simply say "Correct!"
        // Bonus multipliers don't apply for single-player games
        correctUsersStr = `Correct, ${Object.values(game[id].correctUsers)[0]}! ${scoreStr}`;
      }
      else  {
        // More than 10 correct players, player names are separated by comma to save space.
        var comma = ", ";
        var correctCount = Object.keys(game[id].correctUsers).length;

        // Only show the first 32 scores if there are a lot of players.
        // This prevents the bot from potentially overflowing the embed character limit.
        if(truncateList) {
          correctCount = 32;
        }

        for(var i = 0; i <= correctCount-1; i++) {
          if(i === correctCount-1) {
            comma = "";
          }
          else if(correctCount <= 10) {
            comma = "\n";
          }

          var score = game[id].scores[ Object.keys(game[id].correctUsers)[i] ];

          var bonusStr = "";
          var bonus = Trivia.applyBonusMultiplier(id, channel, Object.keys(game[id].correctUsers)[i]);

          if(getConfigVal("debug-log")) {
            console.log(`Applied bonus score of ${bonus} to user ${Object.keys(game[id].correctUsers)[i]}`);
          }

          if(score !== score+bonus && typeof bonus !== "undefined") {
            bonusStr = ` + ${bonus} bonus`;
          }
          else {
            bonus = 0;
          }

          if(!getConfigVal("disable-score-display", channel)) {
            scoreStr = ` (${score.toLocaleString()} pts${bonusStr})`;
          }

          // Apply bonus after setting the string.
          game[id].scores[ Object.keys(game[id].correctUsers)[i] ] = score+bonus;

          correctUsersStr = `${correctUsersStr}${Object.values(game[id].correctUsers)[i]}${scoreStr}${comma}`;
        }

        if(truncateList) {
          var truncateCount = Object.keys(game[id].correctUsers).length-32;
          correctUsersStr = `${correctUsersStr}\n*+ ${truncateCount} more*`;
        }
      }
    }
  }
  else {
    // ## Game-Over Score Display ## //
    var totalParticipantCount = Object.keys(game[id].totalParticipants).length;

    if(gameEndedMsg === "") {
      correctUsersStr = `**Score${totalParticipantCount!==1?"s":""}:**`;
    } else {
      correctUsersStr = `**Final score${totalParticipantCount!==1?"s":""}:**`;
    }

    if(totalParticipantCount === 0) {
      correctUsersStr = `${correctUsersStr}\nNone`;
    }
    else {
      correctUsersStr = `${correctUsersStr}\n${Trivia.leaderboard.makeScoreStr(game[id].scores, game[id].totalParticipants)}`;
    }
  }

  if(gameFooter !== "") {
    gameFooter = "\n\n" + gameFooter;
  }

  var answerStr = "";

  if(getConfigVal("reveal-answers", channel) === true) { // DELTA: Answers will be not shown in the Summary
    answerStr = `${game[id].gameMode!==2?`**${Letters[game[id].correctId]}:** `:""}${Trivia.formatStr(game[id].answer)}\n\n`;
  }

  if(typeof game[id].answerExtension !== "undefined") {
    answerStr = `${answerStr}${Trivia.formatStr(game[id].answerExtension)}\n\n`;
  }

  Trivia.send(channel, void 0, {embed: {
    color: game[id].color,
    image: {url: game[id].imageAnswer}, // If any is defined
    description: `${answerStr}${correctUsersStr}${gameEndedMsg}${gameFooter}`
  }}, (msg, err) => {
    if(typeof game[id] !== "undefined") {
      // NOTE: Participants check is repeated below in Trivia.doGame
      if(!err && !doAutoEnd) {
        game[id].timeout = setTimeout(() => {
          Trivia.doGame(id, channel, void 0, 1);
        }, roundTimeout);
      }
      else {
        game[id].timeout = void 0;
        triviaEndGame(id);
      }
    }
  });
};

// # parseAnswerHangman # //
// This works by parsing the string, and if it matches the answer, passing it
// to parseAnswer as the correct letter.
Trivia.parseAnswerHangman = function(str, id, userId, username, scoreValue) {
  var input = str.toLowerCase();
  // Decode and remove all non-alphabetical characters
  var answer = Trivia.formatStr(game[id].answer).toLowerCase().replace(/\W/g, "");

  // Return -1 if the input is a command.
  // If the input is much longer than the actual answer, assume that it is not an attempt to answer.
  if(input.startsWith(getConfigVal("prefix", id)) || input.length > answer.length*2) {
    return -1;
  }

  if(input.replace(/\W/g, "") === answer) {
    return Trivia.parseAnswer(Letters[game[id].correctId], id, userId, username, scoreValue);
  }
  else {
    // The string doesn't match, so we'll pass the first incorrect answer.
    var incorrect = Letters.slice(0); // Copy to avoid modifying it
    incorrect.splice(game[id].correctId, 1);
    return Trivia.parseAnswer(incorrect[0], id, userId, username, scoreValue);
  }
};

// # Trivia.parseAnswer # //
// Parses a user's letter answer and scores it accordingly.
// Str: Letter answer -- id: channel identifier
// scoreValue: Score value from the config file.
Trivia.parseAnswer = function (str, id, userId, username, scoreValue) {
  if(!game[id].inRound) {
    // Return -1 since there is no game.
    return -1;
  }

  // If they already answered and configured to do so, don't accept subsquent answers.
  if(getConfigVal("accept-first-answer-only", id) && typeof game[id].participants[userId] !== "undefined") {
    return;
  }

  if((str === "A" || str === "B" || game[id].isTrueFalse !== 1 && (str === "C"|| str === "D"))) {
    // Add to participants if they aren't already on the list
    if(game[id].inProgress && typeof game[id].participants[userId] === "undefined") {
      game[id].participants[userId] = username;

      game[id].totalParticipants[userId] = username;
    }

    // If their score doesn't exist, intialize it.
    game[id].scores[userId] = game[id].scores[userId] || 0;

    if(str === Letters[game[id].correctId]) {
      if(typeof game[id].correctUsers[userId] === "undefined") {
        game[id].correctUsers[userId] = username;

        var scoreChange = 0;
        if(typeof scoreValue[game[id].difficulty] === "number") {
          scoreChange = scoreValue[game[id].difficulty];
        }
        else {
          // Leave the score change at 0, display a warning.
          console.warn(`WARNING: Invalid difficulty value '${game[id].difficulty}' for the current question. User will not be scored.`);
        }

        if(getConfigVal("debug-log")) {
          console.log(`Updating score of user ${userId} (Current value: ${game[id].scores[userId]}) + ${scoreChange}.`);
        }

        game[id].scores[userId] += scoreChange;

        if(getConfigVal("debug-log")) {
          console.log(`New score for user ${userId}: ${game[id].scores[userId]}`);
        }
      }
    }
    else {
      // If the answer is wrong, remove them from correctUsers if necessary
      if(typeof game[id].correctUsers[userId] !== "undefined") {

        if(getConfigVal("debug-log")) {
          console.log(`User ${userId} changed answers, reducing score (Current value: ${game[id].scores[userId]}) by ${scoreValue[game[id].difficulty]}.`);
        }

        game[id].scores[userId] -= scoreValue[game[id].difficulty];

        if(getConfigVal("debug-log")) {
          console.log(`New score for user ${userId}: ${game[id].scores[userId]}`);
        }

        // Now that the name is removed, we can remove the ID.
        delete game[id].correctUsers[userId];
      }
    }
  }
  else {
    // Return -1 to indicate that the input is NOT a valid answer
    return -1;
  }
};

async function addAnswerReactions(msg, id) {
  try {
    await msg.react("🇦");
    await msg.react("🇧");

    if(typeof game[id] === "undefined" || !game[id].isTrueFalse) {
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
    triviaEndGame(id);
    return;
  }
}

function createObscuredAnswer(answer, hint) {
  var obscuredAnswer = "";
  var skipChars = [];

  if(hint) {
    // Randomly reveal up to 1/3 of the answer.
    var charsToReveal = answer.length/3;
    for(var i = 0; i <= charsToReveal; i++) {
      var skipChar = Math.floor(Math.random() * answer.length);
      skipChars.push(skipChar);
    }
  }

  for(var charI = 0; charI <= answer.length-1; charI++) {
    var char = answer.charAt(charI);

    if(char === " ") {
      obscuredAnswer = `${obscuredAnswer} `;
    }
    else if(skipChars.includes(charI) || char === "," || char === "\"" || char === "'" || char === ":" || char === "(" || char === ")") {
      // If this character is set to be revealed or contains an exception, show it.
      obscuredAnswer = `${obscuredAnswer}${char}`;
    }
    else {
      // A thin space character (U+2009) is used so the underscores have
      // a small distinguishing space between them.
      // ESLint really doesn't like this, but it works great!
      obscuredAnswer = `${obscuredAnswer}\\_ `;
    }
  }

  return obscuredAnswer;
}

function doHangmanHint(channel, answer) {
  var id = channel.id;

  // Verify that the game is still running and that it's the same game.
  if(typeof game[id] === "undefined" || !game[id].inRound || answer !== game[id].answer) {
    return;
  }

  answer = Trivia.formatStr(answer);

  // If the total string is too small, skip showing a hint.
  if(answer.length < 4) {
    return;
  }

  var hintStr = createObscuredAnswer(answer, true);

  Trivia.send(channel, void 0, {embed: {
    color: Trivia.embedCol,
    description: `Hint: ${hintStr}`
  }});
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
      .setLabel(text)
      .setStyle(style),
    );
  }

  return [ buttons ];
}

// # Trivia.doGame #
// TODO: Refactor and reduce args
// - id: The unique identifier for the channel that the game is in.
// - channel: The channel object that correlates with the game.
// - author: The user that started the game. Can be left 'undefined'
//           if the game is scheduled.
// - scheduled: Set to true if starting a game scheduled by the bot.
//              Keep false if starting on a user's command. (must
//              already have a game initialized to start)
//
Trivia.doGame = async function(id, channel, author, scheduled, config, category, typeInput, difficultyInput, modeInput) {
  // Check if there is a game running. If there is one, make sure it isn't frozen.
  // Checks are excepted for games that are being resumed from cache or file.
  if(typeof game[id] !== "undefined" && !game[id].resuming) {
    if(!scheduled && typeof  game[id].timeout !== "undefined" && game[id].timeout._called === true) {
      // The timeout should never be stuck on 'called' during a round.
      // Dump the game in the console, clear it, and continue.
      console.error(`ERROR: Unscheduled game '${id}' timeout appears to be stuck in the 'called' state. Cancelling game...`);
      triviaEndGame(id);
    }
    else if(typeof game[id].timeout !== "undefined" && game[id].timeout._idleTimeout === -1) {
      // This check may not be working, have yet to see it catch any games.
      // The timeout reads -1. (Can occur if clearTimeout is called without deleting.)
      // Dump the game in the console, clear it, and continue.
      console.error(`ERROR: Game '${id}' timeout reads -1. Game will be cancelled.`);
      triviaEndGame(id);
    }
    else if(typeof game[id].answer === "undefined") {
      console.error(`ERROR: Game '${id}' is missing information. Game will be cancelled.`);
      triviaEndGame(id);
    }
    else if(!scheduled && game[id].inProgress === 1) {
      return; // If there's already a game in progress, don't start another unless scheduled by the script.
    }
  }

  if(commands.playAdv.advGameExists(id)) {
    return;
  }

  // ## Permission Checks ##
  // Start with the game value if defined, otherwise default to 0.
  var gameMode = -1;
  
  if(typeof game[id] !== "undefined" && typeof game[id].gameMode !== "undefined") {
    gameMode = game[id].gameMode;
  }
  else {
    if(channel.type !== "DM" && typeof modeInput === "undefined") {
      if(getConfigVal("use-reactions", channel)) {
        gameMode = 1;
      }
      else if(getConfigVal("hangman-mode", channel)) {
        gameMode = 2;
      }
    }
  
    if(modeInput === -1) {
      gameMode = -1;
    }
    if(modeInput === 0) {
      gameMode = 0;
    }
    else if(modeInput === 1) {
      gameMode = 1;
    }
    else if(modeInput === 2) {
      gameMode = 2;
    }
  
    if(gameMode === 2) {
      typeInput = "multiple"; // Override to get rid of T/F questions
    }
  }

  var isFirstQuestion = typeof game[id] === "undefined";

  // ## Game ##
  // Define the variables for the new game.
  // NOTE: This is run between rounds, plan accordingly.
  game[id] = {
    "inProgress": 1,
    "inRound": 1,

    "guildId": channel.type==="GUILD_TEXT"?channel.guild.id:void 0,
    "userId": channel.type!=="DM"?void 0:channel.recipient.id,

    "isDMGame": channel.type==="DM",

    gameMode,
    "category": typeof game[id]!=="undefined"?game[id].category:category,
    "difficulty": void 0, // Will be defined later

    "typeInput": typeof game[id]!=="undefined"?game[id].typeInput:typeInput,
    "difficultyInput": typeof game[id]!=="undefined"?game[id].difficultyInput:difficultyInput,

    "participants": [],
    "correctUsers": {},

    "totalParticipants": typeof game[id]!=="undefined"?game[id].totalParticipants:{},
    "scores": typeof game[id]!=="undefined"?game[id].scores:{},

    "prevParticipants": typeof game[id]!=="undefined"?game[id].participants:null,
    "emptyRoundCount": typeof game[id]!=="undefined"?game[id].emptyRoundCount:null,

    "isLeagueGame": typeof game[id]!=="undefined"?game[id].isLeagueGame:false,
    "config": typeof game[id]!=="undefined"?game[id].config:config
  };
  // DELTA - Adding fixed number of rounds game
if(isFirstQuestion && getConfigVal("use-fixed-rounds", channel) === true) {
  game[id].config.customRoundCount = getConfigVal("rounds-fixed-number", channel);
  game[id].config.useFixedRounds = 1;
  if(getConfigVal("debug-log")) { console.log("Setting CustomRoundCount to: " + game[id].config.customRoundCount);  } // DELTA - Debug output
}
// DELTA - Adding fixed number of rounds game - END

  var question, answers = [], difficultyReceived, correct_answer;
  try {
    question = await getTriviaQuestion(0, channel, 0, isFirstQuestion, game[id].category, game[id].typeInput, game[id].difficultyInput);

    // Stringify the answers in the try loop so we catch it if anything is wrong.
    answers[0] = question.correct_answer.toString();
    answers = answers.concat(question.incorrect_answers);
    difficultyReceived = question.difficulty.toString();
    correct_answer = question.correct_answer.toString();
  } catch(err) {
    if(typeof Trivia.maintenanceMsg === "string") {
      Trivia.send(channel, author, {embed: {
        color: 14164000,
        description: `An error occurred while querying the trivia database:\n*${Trivia.maintenanceMsg}*`
      }});
    }
    else {
      if(err.code !== -1) {
        console.log("Database query error:");
        console.log(err);
      }

      Trivia.send(channel, author, {embed: {
        color: 14164000,
        description: `An error occurred while querying the trivia database:\n*${err.message}*`
      }});
    }

    triviaEndGame(id);
  }

  // Make sure the game wasn't cancelled while querying the database.
  if(!game[id]) {
    return;
  }

  if(question.incorrect_answers.length === 1) {
    game[id].isTrueFalse = 1;
  }

  var color = Trivia.embedCol;
  if(getConfigVal("hide-difficulty", channel) !== true) {
    switch(difficultyReceived) {
      case "easy":
        color = 4249664;
        break;
      case "medium":
        color = 12632064;
        break;
      case "hard":
        color = 14164000;
        break;
    }
  }
  game[id].color = color;

  var answerString = "";
  if(gameMode === 2) {
    var answer = Trivia.formatStr(correct_answer);

    var obscuredAnswer = createObscuredAnswer(answer);
    answerString = "**Hint:** " + obscuredAnswer;

    if(getConfigVal("debug-mode")) {
      answerString = `${answerString} *(Answer: ${Trivia.formatStr(correct_answer)})*`;
    }

    game[id].correctId = 0;
  }
  else {
    // Sort the answers in reverse alphabetical order.
    answers.sort((a, b) => a.localeCompare(b));
    answers.reverse();

    for(var i = 0; i <= answers.length-1; i++) {
      answers[i] = answers[i].toString();

      if(answers[i] === correct_answer) {
        game[id].correctId = i;
      }

      answerString = `${answerString}**${Letters[i]}:** ${Trivia.formatStr(answers[i])}${getConfigVal("debug-mode")&&i===game[id].correctId?" *(Answer)*":""}\n`;
    }
  }

  // Hide answers in button mode
  if(gameMode === -1) {
    answerString = "";
  }

  var categoryString = Trivia.formatStr(question.category);

  var timer = getConfigVal("round-length", channel);

  if(gameMode === 2) {
    // Hangman games get an extra ten seconds for balance.
    timer = timer+10000;
  }

  var infoString = "";
  if(!scheduled) {
    if(gameMode === 2) {
      infoString = `${infoString}\nType your answer! `;
    }
    else if(gameMode === 0) {
      infoString = `${infoString}Type a letter to answer! `;
    }

    infoString = `${infoString}The answer will be revealed in ${timer/1000} seconds.`;

    // Add an extra initial message to let users know the game will insta-end with no answers.
    if(!getConfigVal("round-end-warnings-disabled", channel) && getConfigVal("rounds-end-after", channel) === 1 && !game[id].config.customRoundCount) {
      infoString += "\nThe game will end when there is no activity in a round.";
    }
  }

  var footerObj;
  var components;
  if(infoString !== "") {
    footerObj = { text: infoString };
  }

  if(gameMode === -1) {
    components = buildButtons(answers, correct_answer);
    game[id].buttons = components[0];
  }

  Trivia.send(channel, author, {embed: {
    color: game[id].color,
    image: {url: question.question_image},
    description: `*${categoryString}*\n**${Trivia.formatStr(question.question)}**\n${answerString}`,
    footer: footerObj
  }, components}, (msg, err) => {
    if(err) {
      game[id].timeout = void 0;
      triviaEndGame(id);
    }
    else if(typeof msg !== "undefined" && typeof game[id] !== "undefined") {

      if(game[id].category) {
        // Stat: Rounds played - custom
        Trivia.postStat("roundsPlayedCustom", 1);

        // Stat: Rounds played - this category
        Trivia.postStat(`roundsPlayedCat${game[id].category}`, 1);

        if(!scheduled) {
          // Stat: Games played - custom
          Trivia.postStat("gamesPlayedCustom", 1);

          // Stat: Games played - this category
          Trivia.postStat(`gamesPlayedCat${game[id].category}`, 1);
        }
      }
      else {
        // Stat: Rounds played - normal
        Trivia.postStat("roundsPlayedNormal", 1);

        if(!scheduled) {
          // Stat: Games played - normal
          Trivia.postStat("gamesPlayedNormal", 1);
        }
      }

      game[id].message = msg;
      game[id].messageId = msg.id;

      // Add reaction emojis if configured to do so.
      if(gameMode === 1) {
        addAnswerReactions(msg, id);
      }

      if(typeof game[id] !== "undefined") {
        game[id].difficulty = question.difficulty;
        game[id].answer = question.correct_answer;
        game[id].answerExtension = question.answer_extension;
        game[id].imageAnswer = question.answer_image;
        game[id].date = new Date();

        if(gameMode === 2 && getConfigVal("hangman-hints", channel) === true) {  // DELTA: Added deactivatable hangman hints
          // Show a hint halfway through.
          // No need for special handling here because it will auto-cancel if
          // the game ends before running.
          var answer = game[id].answer; // Pre-define to avoid errors.
          setTimeout(() => {
            doHangmanHint(channel, answer);
          },
          timer/2);
        }

        // Reveal the answer after the time is up
        game[id].timeout = setTimeout(() => {
           Trivia.doAnswerReveal(id, channel, question.correct_answer);
        }, timer);
      }
    }
  }, true);

  return game[id];
};

Trivia.stopGame = (channel, auto) => {
  if(auto !== 1) {
    Trivia.postStat("commandStopCount", 1);
  }

  // These are defined beforehand so we can refer to them after the game is deleted.
  let id = channel.id;
  let timeout = game[id].timeout;
  let inRound = game[id].inRound;
  let finalScoreStr = Trivia.leaderboard.makeScoreStr(game[id].scores, game[id].totalParticipants);
  let totalParticipantCount = Object.keys(game[id].totalParticipants).length;
  let useFixedRounds = game[id].config.useFixedRounds;

  game[id].cancelled = 1;

  if(typeof timeout !== "undefined" && typeof timeout._onTimeout === "function") {
    var onTimeout = timeout._onTimeout;
    clearTimeout(timeout);

    // If a round is in progress, display the answers before cancelling the game.
    // The game will detect "cancelled" and display the proper message.
    if(game[id].inRound && typeof timeout !== "undefined") {
      onTimeout();
    }
  }

  // If there's still a game, clear it.
  if(typeof game[id] !== "undefined") {
    triviaEndGame(id);
  }

  // Display a message if between rounds
  if(!inRound && !useFixedRounds) { // DELTA: Only if no fixed rounds are played.
    var headerStr = `**Final score${totalParticipantCount!==1?"s":""}:**`;

    Trivia.send(channel, void 0, {embed: {
      color: Trivia.embedCol,
      description: `Game ended by admin.${finalScoreStr!==""?`\n\n${headerStr}\n`:""}${finalScoreStr}`
    }});
  }
};

Trivia.leaderboard = require("./lib/leaderboard.js")(getConfigVal);
commands.playAdv = require("./lib/cmd_play_advanced.js")(Trivia, global.client);
var parseAdv = commands.playAdv.parseAdv;
commands.triviaHelp = require("./lib/cmd_help.js")(Config, Trivia);
commands.triviaCategories = require("./lib/cmd_categories.js")(Config);
commands.triviaPlay = require("./lib/cmd_play.js")(Config, Trivia, commands, getConfigVal, game);
commands.triviaPlayAdvanced = commands.playAdv.triviaPlayAdvanced;
commands.triviaStop = require("./lib/cmd_stop.js")(Config, Trivia, commands, getConfigVal);
commands.triviaPing = require("./lib/cmd_ping.js")(Trivia);

Trivia.buildCategorySearchIndex = async () => {
  Trivia.categorySearchIndex = JSON.parse(JSON.stringify(await Database.getCategories()));

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
  var id = msg.channel.id;

  if(cmd.startsWith("STOP")) {
    commands.triviaStop(msg, cmd, isAdmin);
  }

  if(cmd.startsWith("CONFIG")) {
    if(isAdmin && getConfigVal("config-commands-enabled")) {
      var cmdInput = cmd.replace("CONFIG ","");

      if(cmdInput === "CONFIG") {
        Trivia.send(msg.channel, void 0, `Must specify an option to configure. \`${getConfigVal("prefix")}config <option> <value>\``);
        return;
      }

      if(cmdInput.startsWith("LIST") && cmdInput.indexOf("-") === -1) {

        var listID;
        if(cmdInput !== "CONFIG LIST ") {
          listID = cmdInput.replace("LIST <#","").replace(">","");

          if(isNaN(listID)) {
            listID = void 0;
          }
        }

        var configStr = `**__Config Options__**\nThese are the config options that are currently loaded${typeof listID!=="undefined"?` in the channel <#${listID}>`:""}. Some options require a restart to take effect. Type '${getConfigVal("prefix")}reset' to apply changes.`;

        for(var i in Config) {
          if(i.toString().includes("token") || i.toString().includes("comment") || i.includes("configFile")) {
            continue;
          }
          else {
            var value = getConfigVal(i, listID);

            var outputStr = value;
            if(typeof outputStr === "object") {
              outputStr = JSON.stringify(outputStr);
            }
            else if(outputStr.toString().startsWith("http")) {
              outputStr = `\`${outputStr}\``; // Surround it with '`' so it doesn't show as a link
            }

            configStr = `${configStr}\n**${i}**: ${outputStr}`;
          }
        }


        if(msg.channel.type !== "DM") {
          Trivia.send(msg.channel, void 0, "Config has been sent to you via DM.");
        }

        Trivia.send(msg.author, void 0, `${configStr}`);
      }
      else {
        var configSplit = cmd.split(" ");
        var configKey = configSplit[1];
        var configVal = cmd.replace(`CONFIG ${configKey} `, "");

        var localID;
        if(configVal.endsWith(">")) {
          var configChannelStr = configVal.slice(configVal.indexOf(" <"), configVal.length);
          localID = configChannelStr.replace(" <#","").replace(">","");
          if(!ConfigData.localOptions.includes(configKey.toLowerCase())) {
            Trivia.send(msg.channel, void 0, "The option specified either does not exist or can only be changed globally.");
            return;
          }

          if(isNaN(localID)) {
            return;
          }

          configVal = configVal.substring(0, configVal.indexOf(" <"));
        }

        // echo is the value that will be sent back in the confirmation message
        var echo = configVal.toLowerCase();
        if(configVal === `CONFIG ${configKey}`) {
          Trivia.send(msg.channel, void 0, `Must specify a value. \`${getConfigVal("prefix")}config <option> <value>\``);
          return;
        }

        if(configVal === "TRUE") {
          configVal = true;
        }
        else if(configVal === "FALSE") {
          configVal = false;
        }
        else if(!isNaN(configVal)) {
          configVal = parseFloat(configVal);
        }
        else if(configVal.startsWith("[") || configVal.startsWith("{")) {
          try {
            configVal = JSON.parse(configVal.toLowerCase());
          } catch(err) {
            Trivia.send(msg.channel, void 0, `The config value specified has failed to parse with the following error:\n${err}`);
            return;
          }

          echo = `\`${JSON.stringify(configVal)}\``;
        }
        else {
          configVal = configVal.toString().toLowerCase();

          if(configVal.startsWith("\"") && configVal.lastIndexOf("\"") === configVal.length-1) {
            configVal = configVal.substr(1, configVal.length-2);
          }

          echo = configVal;
        }

        if(configVal === getConfigVal(configKey.toLowerCase(), msg.channel)) {
          Trivia.send(msg.channel, void 0, `Option ${configKey} is already set to "${echo}" (${typeof configVal}).`);
        }
        else {
          if(configVal === "null") {
            configVal = null;
          }

          var result = setConfigVal(configKey, configVal, true, localID);
          if(result === -1) {
            Trivia.send(msg.channel, void 0, `Unable to modify the option "${configKey}".`);

          }
          else if(configVal === null) {
            Trivia.send(msg.channel, void 0, `Removed option ${configKey} successfully.`);
          }
          else {
            Trivia.send(msg.channel, void 0, `Set option ${configKey} to "${echo}" (${typeof configVal}) ${typeof localID !== "undefined"?`in channel <#${localID}> `:""}successfully.`);
          }
        }
      }
    }
  }

  if(cmd.startsWith("RESET")) {
    if(isAdmin && getConfigVal("config-commands-enabled")) {
      global.client.shard.send({evalStr: "manager.eCmds.exportexit(1);"});
    }
  }

  if(cmd.startsWith("PLAY ADVANCED")) {
    if(typeof game[id] !== "undefined" && game[id].inProgress) {
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
    
    commands.triviaPlay(msg, categoryInput, 2);
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
  var gameExists = typeof game[id] !== "undefined";

  // Other bots can't use commands
  if(msg.author.bot === true && getConfigVal("allow-bots") !== true) {
    return;
  }

  var prefix = getConfigVal("prefix").toUpperCase();

  // ## Answers ##
  // Check for letters if not using reactions
  if(gameExists && game[id].gameMode !== 1 && game[id].gameMode !== -1) {
    var name = Trivia.filterName(msg.member !== null?msg.member.displayName:msg.author.username);
    var parse;

    if(game[id].gameMode === 2) {
      parse = Trivia.parseAnswerHangman;
    }
    else {
      parse = Trivia.parseAnswer;
    }
    var parsed = parse(str, id, msg.author.id, name, getConfigVal("score-value", msg.channel));

    if(parsed !== -1) {
      if(getConfigVal("auto-delete-answers", msg.channel) && !game[id].isDMGame) {
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
    commands.triviaHelp(msg, Database);
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
    delete game[id];
    return;
  }

  if(channel === null) {
    console.warn(`Unable to find channel '${id}' on shard ${global.client.shard.ids}. Game will not resume.`);
    delete game[id];
    return;
  }

  json.resuming = 1;

  var date = game[id].date;
  var timeout;

  // If more than 60 seconds have passed, cancel the game entirely.
  if(new Date().getTime() > date.getTime()+60000) {
    console.log(`Imported game in channel ${id} is more than one minute old, aborting...`);
    delete game[id];
    return;
  }

  if(json.inRound) {
    game[id] = json;
    game[id].resuming = 1;

    // Calculate timeout based on game time
    // TODO: Account for hangman games properly
    date.setMilliseconds(date.getMilliseconds()+getConfigVal("round-length", channel));
    timeout = date-new Date();

    game[id].timeout = setTimeout(() => {
      Trivia.doAnswerReveal(id, channel, void 0, 1);
    }, timeout);
  }
  else {
    if(Object.keys(json.participants).length !== 0) {
      // Since date doesn't update between rounds, we'll have to add both the round's length and timeout
      date.setMilliseconds(date.getMilliseconds()+getConfigVal("round-timeout", channel)+getConfigVal("round-length", channel));
      timeout = date-new Date();

      game[id].timeout = setTimeout(() => {
        Trivia.doGame(id, channel, void 0, 0, {}, json.category);
      }, timeout);
    }
  }
}

// Read game data
Trivia.getGame = () => {
  return game;
};

// Detect reaction answers
Trivia.reactionAdd = async function(reaction, user) {
  var id = reaction.message.channel.id;
  var str = reaction.emoji.name;

  if(typeof game[id] === "undefined")
    return;
  
  if(typeof game[id].message === "undefined")
    return;
  
  if(game[id].gameMode !== 1) // Reaction mode only
    return;

  if(reaction.message.id !== game[id].messageId)
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

  // Return -1 to indicate that this is not a valid round.
  if(typeof game[id] === "undefined" || message.id !== game[id].messageId || !game[id].inRound)
    return -1;

  Trivia.parseAnswer(answer, id, userId, username, getConfigVal("score-value", message.channel));

  return Object.keys(game[id].participants).length;
};

// # Game Exporter #
// Export the current game data to a file.
Trivia.exportGame = (file) => {
  // Copy the data so we don't modify the actual game object.
  var json = JSON.parse(JSON.stringify(game));

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

  Object.keys(json).forEach((key) => {
    if(typeof game[key] === "undefined") {
      // Create a holder game object to complete what is left of the timeout.
      game[key] = json[key];

      // Mark it as imported so the exporter doesn't re-export it
      game[key].imported = 1;

      json[key].date = new Date(json[key].date);
      triviaResumeGame(json[key], key);
    }
  });
};

// # Maintenance Shutdown Command #
Trivia.doMaintenanceShutdown = () => {
  console.log(`Clearing ${Object.keys(game).length} games on shard ${global.client.shard.ids}`);

  Object.keys(game).forEach((key) => {
    var channel = game[key].message.channel;
    Trivia.stopGame(game[key].message.channel, 1);

    Trivia.send(channel, void 0, {embed: {
      color: Trivia.embedCol,
      description: "TriviaBot is being temporarily shut down for maintenance. Please try again in a few minutes."
    }});
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

// # Fallback Mode Functionality #
if(getConfigVal("fallback-mode") && !getConfigVal("fallback-silent")) {
  global.client.on("messageCreate", (msg) => {
      console.log(`Msg - ${msg.author === global.client.user?"(self)":""} Shard ${global.client.shard.ids} - Channel ${msg.channel.id}`);
  });
}

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

