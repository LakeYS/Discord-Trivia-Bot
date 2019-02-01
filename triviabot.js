const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const JSON = require("circular-json");

var config = require("./lib/config.js")(process.argv[2]);

var Trivia = exports;

// getConfigValue(value, channel, guild)
// channel: Unique identifier for the channel. If blank, falls back to guild.
//          If detected as a discord.js TextChannel object, automatically fills the
//          ID for itself and the guild.
// guild: Unique identifier for the server. If blank, falls back to global.
function getConfigVal(value, channel, guild) {
  if(typeof channel !== "undefined") {
    // discord.js class auto-detection
    if(channel.type === "TextChannel") {
      guild = channel.guild.id;
      channel = channel.id;
    }
    else if(channel.type === "DMChannel") {
      channel = channel.id;
    }
  }

  channel, guild;

  return config[value];
}

Trivia.getConfigVal = getConfigVal;

// TODO: Use String.fromCharCode(65+letter) instead of this array?
const letters = ["A", "B", "C", "D"];
// Convert the hex code to decimal so Discord can read it.
Trivia.embedCol = Buffer.from(getConfigVal("embed-color").padStart(8, "0"), "hex").readInt32BE(0);

var Database = "";
if(getConfigVal("database-merge")) {
  // TODO: Rather than killing the base process, the manager should
  // do this automatically when an initial error is thrown.
  if(!config.databaseURL.startsWith("file://")) {
    console.error("A file path starting with 'file://' must be specified when the database merger is enabled.");
    global.client.shard.send({evalStr: "process.exit();"});
  }

  Database = require("./lib/database/mergerdb.js")(config);
}
else {
  Database = config.databaseURL.startsWith("file://")?require("./lib/database/filedb.js")(config):require("./lib/database/opentdb.js")(config);
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
//    channel: Channel ID -- author: Author ID -- msg: Message Object -- callback: Callback Function
//    noDelete: If enabled, message will not auto-delete even if configured to
Trivia.send = function(channel, author, msg, callback, noDelete) {
  channel.send(msg)
  .catch((err) => {
    if(typeof author !== "undefined") {
      if(channel.type !== "dm") {
        var str = "";
        if(err.message.includes("Missing Permissions")) {
          str = "\n\nThis bot requires the \"Send Messages\" and \"Embed Links\" permissions in order to work.";
        }

        author.send({embed: {
          color: 14164000,
          description: `TriviaBot is unable to send messages in this channel:\n${err.message.replace("DiscordAPIError: ","")} ${str}`
        }})
        .catch(() => {
          console.warn(`Failed to send message to user ${author.id}. (DM failed)`);
        });
      }
      else {
        console.warn(`Failed to send message to user ${author.id}. (already in DM)`);
      }
    }
    else {
      console.warn("Failed to send message to channel. (no user)");
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
      }, 15000);
    }
  });
};

Trivia.commands = {};
var commands = Trivia.commands;

function isFallbackMode(channel) {
  if(getConfigVal("fallback-mode")) {
    if(typeof getConfigVal("fallback-exceptions") !== "undefined" && getConfigVal("fallback-exceptions").indexOf(channel) !== -1) {
      // Return if specified channel is an exception
      return;
    }
    else {
      return true;
    }
  }
}

// getTriviaQuestion
// Returns a promise, fetches a random question from the database.
// If initial is set to true, a question will not be returned. (For initializing the cache)
// If tokenChannel is specified (must be a discord.js TextChannel object), a token will be generated and used.
async function getTriviaQuestion(initial, tokenChannel, tokenRetry, isFirstQuestion, category, type, difficulty) {
  var length = global.questions.length;
  var toReturn;

  // Check if there are custom arguments
  var isCustom = false;
  if(typeof category !== "undefined" || typeof type !== "undefined" || typeof difficulty !== "undefined") {
    isCustom = true;
  }

  // To keep the question response quick, the bot always stays one question ahead.
  // This way, we're never waiting for the database to respond.
  if(typeof length === "undefined" || length < 2 || isCustom) {
    // We need a new question, either due to an empty cache or because we need a specific category.
    var options = {};
    options.category = category; // Pass through the category, even if it's undefined.

    if(isCustom || config.databaseURL.startsWith("file://")) {
      options.amount = 1;
    }
    else {
      options.amount = getConfigVal("database-cache-size");
    }

    options.type = type;
    options.difficulty = difficulty;

    // Get a token if one is requested.
    var token;
    if(typeof tokenChannel !== "undefined") {
      try {
        token = await Database.getTokenByIdentifier(tokenChannel.id);

        if(getConfigVal("debug-mode")) {
          Trivia.send(tokenChannel, void 0, `*Token: ${token}*`);
        }
      } catch(error) {
        // Something went wrong. We'll display a warning but we won't cancel the game.
        console.log(`Failed to generate token for channel ${tokenChannel.id}: ${error.message}`);
        Trivia.send(tokenChannel, void 0, {embed: {
          color: 14164000,
          description: `Error: Failed to generate a session token for this channel. You may see repeating questions. (${error.message})`
        }});
      }

      if(typeof token !== "undefined" && (isCustom || config.databaseURL.startsWith("file://")) ) {
        // Set the token and continue.
        options.token = token;
      }
    }

    var json = {};
    var err;
    try {
      json = await Database.fetchQuestions(options);

      if(getConfigVal("debug-token-flush") && !tokenRetry && typeof token !== "undefined") {
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

          if(isFirstQuestion) {
            err = new Error("There are no questions available under the current configuration.");
            err.code = -1;
            throw err;
          }
          else if(typeof category === "undefined") {
            Trivia.send(tokenChannel, void 0, "You've played all of the available questions! Questions will start to repeat.");
          }
          else {
            Trivia.send(tokenChannel, void 0, "You've played all of the questions in this category! Questions will start to repeat.");
          }

          // Start over now that we have a token.
          return await getTriviaQuestion(initial, tokenChannel, 1, isFirstQuestion, category, type, difficulty);
        }
        else {
          // This shouldn't ever happen.
          throw new Error("Token reset loop.");
        }
      }
      else {
        console.log("Received error from the trivia database!");
        console.log(error);
        console.log(json);

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
if(!config.databaseURL.startsWith("file://")) {
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
    Trivia.leaderboard.writeScores(game[id].scores, game[id].guildId, ["Monthly", "Weekly"], game[id].leagueName);
  }

  delete game[id];
}

// # Trivia.doAnswerReveal #
// Ends the round, reveals the answer, and schedules a new round if necessary.
// TODO: Refactor (clean up and fix gameEndedMsg being relied on as a boolean check)
Trivia.doAnswerReveal = (id, channel, answer, importOverride) => {
  if(typeof game[id] === "undefined" || !game[id].inProgress) {
    return;
  }

  if(typeof game[id].message !== "undefined" && getConfigVal("auto-delete-msgs", channel)) {
    game[id].message.delete()
    .catch((err) => {
      console.log(`Failed to delete message - ${err.message}`);
    });
  }

  // Quick fix for timeouts not clearing correctly.
  if(answer !== game[id].answer && !importOverride) {
    console.warn(`WARNING: Mismatched answers in timeout for game ${id} (${answer}||${game[id].answer})`);
    return;
  }

  game[id].inRound = 0;

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
  else if(Object.keys(game[id].participants).length === 0) {
    // If there were no participants...
    if(game[id].emptyRoundCount+1 >= getConfigVal("rounds-end-after", channel)) {
      doAutoEnd = 1;
      gameEndedMsg = "\n\n*Game ended.*";
    } else {
      game[id].emptyRoundCount++;

      // Round end warning after we're halfway through the inactive round cap.
      if(!getConfigVal("round-end-warnings-disabled", channel) && game[id].emptyRoundCount >= Math.ceil(getConfigVal("rounds-end-after", channel)/2)) {
        var roundEndCount = getConfigVal("rounds-end-after")-game[id].emptyRoundCount;
        gameFooter += `Game will end in ${roundEndCount} round${roundEndCount===1?"":"s"} if nobody participates.`;
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
        correctUsersStr = `Correct, ${Object.values(game[id].correctUsers)[0]}! ${scoreStr}`; // Only one player overall, simply say "Correct!"
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

          if(!getConfigVal("disable-score-display", channel)) {
            scoreStr = ` (${game[id].scores[ Object.keys(game[id].correctUsers)[i] ].toLocaleString()} pts)`;
          }

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

  Trivia.send(channel, void 0, {embed: {
    color: game[id].color,
    description: `**${letters[game[id].correctId]}:** ${entities.decode(game[id].answer)}\n\n${correctUsersStr}${gameEndedMsg}${gameFooter}`
  }}, (msg, err) => {
    if(typeof game[id] !== "undefined") {
      // NOTE: Participants check is repeated below in Trivia.doGame
      if(!err && !doAutoEnd) {
        game[id].timeout = setTimeout(() => {
          if(getConfigVal("auto-delete-msgs", channel)) {
            msg.delete()
            .catch((err) => {
              console.log(`Failed to delete message - ${err.message}`);
            });
          }
          Trivia.doGame(id, channel, void 0, 1);
        }, getConfigVal("round-timeout", channel));
      }
      else {
        game[id].timeout = void 0;
        triviaEndGame(id);
      }
    }
  }, true);
};

// # parseTriviaAnswer # //
// Parses a user's letter answer and scores it accordingly.
// Str: Letter answer -- id: channel identifier
// scoreValue: Score value from the config file.
function parseTriviaAnswer(str, id, userId, username, scoreValue) {
  if(!game[id].inRound) {
    // Return -1 since there is no game.
    return -1;
  }

  // If they already answered and configured to do so, don't accept subsquent answers.
  if(getConfigVal("accept-first-answer-only") && typeof game[id].participants[userId] !== "undefined") {
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

    if(str === letters[game[id].correctId]) {
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
          console.log(`Updating score of user ${game[id].participants[userId]} (Current value: ${game[id].scores[userId]}) + ${scoreChange}.`);
        }

        game[id].scores[userId] += scoreChange;

        if(getConfigVal("debug-log")) {
          console.log(`New score for user ${game[id].participants[userId]}: ${game[id].scores[userId]}`);
        }
      }
    }
    else {
      // If the answer is wrong, remove them from correctUsers if necessary
      if(typeof game[id].correctUsers[userId] !== "undefined") {

        if(getConfigVal("debug-log")) {
          console.log(`User ${game[id].participants[userId]} changed answers, reducing score (Current value: ${game[id].scores[userId]}) by ${scoreValue[game[id].difficulty]}.`);
        }

        game[id].scores[userId] -= scoreValue[game[id].difficulty];

        if(getConfigVal("debug-log")) {
          console.log(`New score for user ${game[id].participants[userId]}: ${game[id].scores[userId]}`);
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
}

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

// # Trivia.doGame #
// TODO: Refactor and convert to an async function
// - id: The unique identifier for the channel that the game is in.
// - channel: The channel object that correlates with the game.
// - author: The user that started the game. Can be left 'undefined'
//           if the game is scheduled.
// - scheduled: Set to true if starting a game scheduled by the bot.
//              Keep false if starting on a user's command. (must
//              already have a game initialized to start)
Trivia.doGame = async function(id, channel, author, scheduled, category, type, difficultyInput) {
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

  // ## Permission Checks ##
  var useReactions = 0;

  if(channel.type !== "dm") {
    if(getConfigVal("use-reactions", channel)) {
      useReactions = 1;
    }
  }

  var isFirstQuestion = typeof game[id] === "undefined";

  // ## Game ##
  // Define the variables for the new game.
  // NOTE: This is run between rounds, plan accordingly.
  game[id] = {
    "inProgress": 1,
    "inRound": 1,

    "guildId": channel.type==="text"?channel.guild.id:void 0,
    "userId": channel.type!=="dm"?void 0:channel.recipient.id,

    useReactions,
    "category": typeof game[id]!=="undefined"?game[id].category:category,
    "type": typeof game[id]!=="undefined"?game[id].type:type,
    "difficulty": typeof game[id]!=="undefined"?game[id].difficulty:difficultyInput,

    "participants": [],
    "correctUsers": {},

    "totalParticipants": typeof game[id]!=="undefined"?game[id].totalParticipants:{},
    "scores": typeof game[id]!=="undefined"?game[id].scores:{},

    "prevParticipants": typeof game[id]!=="undefined"?game[id].participants:null,
    "emptyRoundCount": typeof game[id]!=="undefined"?game[id].emptyRoundCount:null,

    "isLeagueGame": typeof game[id]!=="undefined"?game[id].isLeagueGame:false
  };

  var question, answers = [], difficultyReceived, correct_answer;
  try {
    question = await getTriviaQuestion(0, channel, 0, isFirstQuestion, game[id].category, game[id].type, game[id].difficulty);

    // Stringify the answers in the try loop so we catch it if anything is wrong.
    answers[0] = question.correct_answer.toString();
    answers = answers.concat(question.incorrect_answers);
    difficultyReceived = question.difficulty.toString();
    correct_answer = question.correct_answer.toString();
  } catch(err) {
    if(err.code !== -1) {
      console.log("Database query error:");
      console.log(err);
    }

    Trivia.send(channel, author, {embed: {
      color: 14164000,
      description: `An error occurred while querying the trivia database:\n*${err.message}*`
    }});

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

  // Sort the answers in reverse alphabetical order.
  answers.sort();
  answers.reverse();

  var answerString = "";
  for(var i = 0; i <= answers.length-1; i++) {
    answers[i] = answers[i].toString();

    if(answers[i] === correct_answer) {
      game[id].correctId = i;
    }

    answerString = `${answerString}**${letters[i]}:** ${entities.decode(answers[i])}${getConfigVal("debug-mode")&&i===game[id].correctId?" *(Answer)*":""}\n`;
  }

  var categoryString = entities.decode(question.category);

  var infoString = "";
  if(!scheduled) {
    infoString = "\n";

    if(!useReactions) {
      infoString = `${infoString}Type a letter to answer! `;
    }

    infoString = `${infoString}The answer will be revealed in ${getConfigVal("round-length", channel)/1000} seconds.`;

    // Add an extra initial message to let users know the game will insta-end with no answers.
    if(!getConfigVal("round-end-warnings-disabled", channel) && getConfigVal("rounds-end-after", channel) === 1) {
      infoString += "\nThe game will end automatically if nobody participates.";
    }
  }

  Trivia.send(channel, author, {embed: {
    color: game[id].color,
    description: `*${categoryString}*\n**${entities.decode(question.question)}**\n${answerString}${infoString}`
  }}, (msg, err) => {
    if(err) {
      game[id].timeout = void 0;
      triviaEndGame(id);
    }
    else if(typeof msg !== "undefined" && typeof game[id] !== "undefined") {

      if(game[id].category) {
        // Stat: Rounds played - custom
        global.client.shard.send({stats: { roundsPlayedCustom: 1 }});

        // Stat: Rounds played - this category
        global.client.shard.send( JSON.parse(`{"stats": { "roundsPlayedCat${game[id].category}": 1 }}`) );

        if(!scheduled) {
          // Stat: Games played - custom
          global.client.shard.send({stats: { gamesPlayedCustom: 1 }});

          // Stat: Games played - this category
          global.client.shard.send( JSON.parse(`{"stats": { "gamesPlayedCat${game[id].category}": 1 }}`) );
        }
      }
      else {
        // Stat: Rounds played - normal
        global.client.shard.send({stats: { roundsPlayedNormal: 1 }});

        if(!scheduled) {
          // Stat: Games played - normal
          global.client.shard.send({stats: { gamesPlayedNormal: 1 }});
        }
      }

      game[id].message = msg;

      // Add reaction emojis if configured to do so.
      if(useReactions) {
        addAnswerReactions(msg, id);
      }

      if(typeof game[id] !== "undefined") {
        game[id].difficulty = question.difficulty;
        game[id].answer = question.correct_answer;
        game[id].date = new Date();

        // Reveal the answer after the time is up
        game[id].timeout = setTimeout(() => {
           Trivia.doAnswerReveal(id, channel, question.correct_answer);
        }, getConfigVal("round-length", channel));
      }
    }
  }, true);

  return game[id];
};

function doTriviaPing(msg) {
  var tBefore = Date.now();

  global.client.shard.send({stats: { commandPingCount: 1 }});

  Trivia.send(msg.channel, msg.author, {embed: {
    color: Trivia.embedCol,
    title: "Pong!",
    description: "Measuring how long that took..."
  }}, (sent) => {
    var tAfter = Date.now();

    sent.edit({embed: {
      color: Trivia.embedCol,
      title: "Pong!",
      description: `That took ${tAfter-tBefore}ms.\nAverage client heartbeat: ${Math.round(global.client.ping)}ms\n${!config.databaseURL.startsWith("file://")?`Last database response: ${Database.pingLatest}ms\n`:""}Shard ${global.client.shard.id} of ${global.client.shard.count-1}`
    }});
  });
}

function doTriviaStop(channel, auto) {
  if(auto !== 1) {
    global.client.shard.send({stats: { commandStopCount: 1 }});
  }

  // These are defined beforehand so we can refer to them after the game is deleted.
  let id = channel.id;
  let timeout = game[id].timeout;
  let inRound = game[id].inRound;
  let finalScoreStr = Trivia.leaderboard.makeScoreStr(game[id].scores, game[id].totalParticipants);
  let totalParticipantCount = Object.keys(game[id].totalParticipants).length;

  game[id].cancelled = 1;

  if(typeof timeout !== "undefined") {
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
  if(!inRound) {
    var headerStr = `**Final score${totalParticipantCount!==1?"s":""}:**`;

    Trivia.send(channel, void 0, {embed: {
      color: Trivia.embedCol,
      description: `Game ended by admin.${finalScoreStr!==""?`\n\n${headerStr}\n`:""}${finalScoreStr}`
    }});
  }
}

Trivia.leaderboard = require("./lib/leaderboard.js")(getConfigVal);
commands.playAdv = require("./lib/cmd_play_advanced.js")(Trivia);
var parseAdv = commands.playAdv.parseAdv;
commands.triviaHelp = require("./lib/cmd_help.js")(config);
commands.triviaCategories = require("./lib/cmd_categories.js")(config);
commands.triviaPlayAdvanced = commands.playAdv.triviaPlayAdvanced;

// getCategoryFromStr
// Returns a category based on the string specified. Returns undefined if no category is found.
Trivia.getCategoryFromStr = async (str) => {
  var categoryList;
  // Automatically give "invalid category" if query is shorter than 3 chars.
  if(str.length < 3) {
    return void 0;
  }

  // Get the category list.
  categoryList = await Database.getCategories();

  var strCheck = str.toUpperCase();
  return categoryList.find((el) => {
    return el.name.toUpperCase().includes(strCheck);
  });
};

function parseCommand(msg, cmd) {
  var id = msg.channel.id;

  if(cmd === "PING") {
    doTriviaPing(msg);
    return;
  }

  if(cmd.startsWith("STOP")) {
    var stopChannel = msg.channel;

    var isAdmin;
    if(((msg.member !== null && msg.member.permissions.has("MANAGE_GUILD")) || msg.channel.type === "dm") && getConfigVal("disable-admin-commands", msg.channel) !== true) {
      isAdmin = true;

      var channelInput = cmd.replace("STOP ","");

      if(channelInput !== "STOP") {
        var idInput = channelInput.replace("<#","").replace(">","");
        stopChannel = msg.guild.channels.find((obj) => (obj.id === idInput));

        if(stopChannel === null) {
          Trivia.send(msg.channel, msg.author, `Could not find that channel. Check input and try again. (Example: <#${msg.channel.id}>)`);
          return;
        }
        else if(typeof game[stopChannel.id] === "undefined") {
          Trivia.send(msg.channel, msg.author, "There is no game running in that channel.");
          return;
        }
        else {
          Trivia.send(msg.channel, msg.author, `Stopping game in channel <#${stopChannel.id}>`);
          return;
        }
      }
    }

    if(commands.playAdv.advGameExists(id)) {
      commands.playAdv.cancelAdvGame(id);
      Trivia.send(stopChannel, void 0, "Game cancelled.");

      return;
    }

    if(typeof game[stopChannel.id] !== "undefined" && game[stopChannel.id].inProgress) {
      if(isAdmin) {
        doTriviaStop(stopChannel);
      }
      else {
        Trivia.send(msg.channel, void 0, `Trivia games will end automatically if the game is inactive for more than ${getConfigVal("rounds-end-after", msg.channel)-1} round${getConfigVal("rounds-end-after", msg.channel)-1===1?"":"s"}. Only users with the "Manage Server" permission can force-end a game.`);
      }

      return;
    }
  }

  if(cmd.startsWith("PLAY ADVANCED")) {
    if(typeof game[id] !== "undefined" && game[id].inProgress) {
      return;
    }

    commands.triviaPlayAdvanced(void 0, msg.channel.id, msg.channel, msg.author);
    return;
  }

  if(cmd.startsWith("PLAY ") || cmd === "PLAY") {
    if(typeof game[id] !== "undefined" && game[id].inProgress) {
      return;
    }

    var categoryInput = cmd.replace("PLAY ","");
    if(categoryInput !== "PLAY") {
      Trivia.getCategoryFromStr(categoryInput)
      .then((category) => {
        if(typeof category === "undefined") {
          Trivia.send(msg.channel, msg.author, {embed: {
            color: 14164000,
            description: "Unable to find the category you specified.\nType `trivia play` to play in random categories, or type `trivia categories` to see a list of categories."
          }});
          return;
        }
        else {
          Trivia.doGame(msg.channel.id, msg.channel, msg.author, 0, category.id);
          return;
        }
      })
      .catch((err) => {
        Trivia.send(msg.channel, msg.author, {embed: {
          color: 14164000,
          description: `Failed to retrieve the category list:\n${err}`
        }});
        console.log(`Failed to retrieve category list:\n${err}`);
        return;
      });
    }
    else {
      // No category specified, start a normal game. (The database will pick a random category for us)
      Trivia.doGame(msg.channel.id, msg.channel, msg.author, 0);
      return;
    }
  }

  if(typeof commands.leagueParse !== "undefined" && cmd.startsWith("LEAGUE ")) {
    commands.leagueParse(msg.channel.id, msg.channel, msg.author, msg.member, cmd);
    return;
  }

  if(cmd === "CATEGORIES") {
    commands.triviaCategories(msg, Trivia); // TODO: Refactor
    return;
  }
}

// # trivia.parse #
Trivia.parse = (str, msg) => {
  // No games in fallback mode
  if(isFallbackMode(msg.channel.id)) {
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
  if(gameExists && !game[id].useReactions) {
    var name = msg.member !== null?msg.member.displayName:msg.author.username;
    var parsed = parseTriviaAnswer(str, id, msg.author.id, name, getConfigVal("score-value", msg.channel));

    if(parsed !== -1) {
      if(getConfigVal("auto-delete-answers", msg.channel)) {
        setTimeout(() => {
          msg.delete()
          .catch((err) => {
            if(err.message !== "Missing Permissions") {
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
  if(typeof cmdWhitelist !== "undefined" && cmdWhitelist.length !== 0 && cmdWhitelist.indexOf(msg.author.tag)) {
    return;
  }

  // # Advanced Game Args ##
  // Override all except "trivia categories" and "trivia help" if we're awaiting input in this channel.
  // TODO: Fix non-override commands still working, move these overrides to cmd_play_advanced.js
  if(str !== prefix + "CATEGORIES" && str !== prefix + "STOP") {
    parseAdv(id, msg)
    .then((result) => {
      if(result !== -1) {
        return;
      }
    });
  }

  // ## Help Command Parser ##
  if(str === prefix + "HELP" || str.includes(`<@${global.client.user.id}>`)) {
    commands.triviaHelp(msg, Database)
    .then((res) => {

      Trivia.send(msg.channel, msg.author, {embed: {
        color: Trivia.embedCol,
        description: res
      }});
    });
    return;
  }

  // ## Normal Commands ##
  // If the string starts with the specified prefix (converted to uppercase)
  if(str.startsWith(prefix)) {
    var cmd = str.replace(prefix, "");
    parseCommand(msg, cmd);
  }
};

// triviaResumeGame
// Restores a game that does not have an active timeout.
function triviaResumeGame(json, id) {
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
    channel = global.client.channels.get(id);
  }

  if(!json.inProgress) {
    delete game[id];
    return;
  }

  if(channel === null) {
    console.warn(`Unable to find channel '${id}' on shard ${global.client.shard.id}. Game will not resume.`);
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
        Trivia.doGame(id, channel, void 0, 0, json.category);
      }, timeout);
    }
  }
}

// Read game data
Trivia.getGame = () => {
  return game;
};

// Detect reaction answers
Trivia.reactionAdd = function(reaction, user) {
  var id = reaction.message.channel.id;
  var str = reaction.emoji.name;

  // If a game is in progress, the reaction is on the right message, the game uses reactions, and the reactor isn't the TriviaBot client...
  if(typeof game[id] !== "undefined" && typeof game[id].message !== "undefined" && reaction.message.id === game[id].message.id && game[id].useReactions && user !== global.client.user) {
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

    // Get the user's nickname.
    var username = reaction.message.guild.members.get(user.id).displayName;
    parseTriviaAnswer(str, id, user.id, username, getConfigVal("score-value", reaction.message.channel));
  }
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

  file = file || "./game."  + global.client.shard.id + ".json.bak";
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
  console.log(`Importing games to shard ${global.client.shard.id} from file...`);
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
      console.log(`Failed to parse JSON from ./game.${global.client.shard.id}.json.bak`);
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
  console.log(`Clearing ${Object.keys(game).length} games on shard ${global.client.shard.id}`);

  Object.keys(game).forEach((key) => {
    var channel = game[key].message.channel;
    doTriviaStop(game[key].message.channel, 1);

    Trivia.send(channel, void 0, {embed: {
      color: Trivia.embedCol,
      description: "TriviaBot is being temporarily shut down for maintenance. Please try again in a few minutes."
    }});
  });

  return;
};

// # Fallback Mode Functionality #
if(getConfigVal("fallback-mode") && !getConfigVal("fallback-silent")) {
  global.client.on("message", (msg) => {
      console.log(`Msg - ${msg.author === global.client.user?"(self)":""} Shard ${global.client.shard.id} - Channel ${msg.channel.id}`);
  });
}

process.on("exit", (code) => {
  if(code !== 0) {
    console.log("Exit with non-zero code, exporting game data...");
    Trivia.exportGame();
  }
});

// ## Import on Launch ## //
global.client.on("ready", () => {
  var file = `./game.${global.client.shard.id}.json.bak`;
  if(fs.existsSync(file)) {
    // Import the file, then delete it.
    Trivia.importGame(file, 1);
  }
});
