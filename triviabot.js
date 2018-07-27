const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const JSON = require("circular-json");

var config = require("./lib/config.js")(process.argv[2]);

const infoFooter = "([Support TriviaBot on Patreon](https://www.patreon.com/LakeYS)) ([Contribute questions to the database](http://lakeys.net/triviabot/contribute))";

const footerString = `Commands: \`${config.prefix}play <category>\`, \`${config.prefix}help\`, \`${config.prefix}categories\`, \`${config.prefix}stop\`
*Bot by [Lake Y](http://lakeys.net). Powered by discord.js ${require("./package.json").dependencies["discord.js"].replace("^","")}\
${config.databaseURL==="https://opentdb.com"?" and the [Open Trivia Database](https://opentdb.com/)*":"*"}.\n*${infoFooter}*`;

const letters = ["A", "B", "C", "D"];
const embedCol = config["beta-mode"]?8609529:27903;
const scoreValue = config["score-value"];

const Database = require("./lib/database/opentdb.js")(config);

var game = {};
global.questions = [];

// These two functions rely on each other, so we'll initialize them ahead of time.
var doTriviaGame, triviaRevealAnswer;

// Generic message sending function.
// This is to avoid repeating the same error catchers throughout the script.
//    channel: Channel ID -- author: Author ID -- msg: Message Object -- callback: Callback Function
//    noDelete: If enabled, message will not auto-delete even if configured to
var triviaSend = function(channel, author, msg, callback, noDelete) {
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

    if(config["auto-delete-msgs"] && noDelete !== 1) {
      setTimeout(() => {
        msg.delete();
      }, 15000);
    }
  });
};

function isFallbackMode(channel) {
  if(config["fallback-mode"]) {
    if(typeof config["fallback-exceptions"] !== "undefined" && config["fallback-exceptions"].indexOf(channel) !== -1) {
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
async function getTriviaQuestion(initial, category, tokenChannel, tokenRetry) {
  var length = global.questions.length;
  var toReturn;
  var args = "";

  // To keep the question response quick, the bot always stays one question ahead.
  // This way, we're never waiting for the database to respond.
  if(typeof length === "undefined" || length < 2 || typeof category !== "undefined") {
    // We need a new question, either due to an empty cache or because we need a specific category.
    // TODO: Check the cache for a question in the category
    if(typeof category !== "undefined") {
      args += `?amount=1&category=${category}`;
    }
    else {
      args += `?amount=${config["database-cache-size"]}`;
    }

    // Get a token if one is requested.
    var token;
    if(typeof tokenChannel !== "undefined") {
      try {
        token = await Database.getTokenByIdentifier(tokenChannel.id);
      } catch(error) {
        // Something went wrong. We'll display a warning but we won't cancel the game.
        console.log(error);
        console.log(`Failed to generate token for channel ${tokenChannel.id}: ${error.message}`);
        triviaSend(tokenChannel, void 0, {embed: {
          color: 14164000,
          description: `Error: Failed to generate a session token for this channel. You may see repeating questions.\n(${error.message})`
        }});
      }

      if(typeof token !== "undefined" && typeof  category !== "undefined") {
        // Set the token and continue.
        args += `&token=${token}`;
      }
    }

    var json = await Database.parseURL(config.databaseURL + `/api.php${args}`);
    if(json.response_code === 4 && typeof token !== "undefined") {
      // Token empty, reset it and start over.
      if(tokenRetry !== 1) {
        try {
          await Database.resetToken(token);
        } catch(error) {
          console.log(`Failed to reset token - ${error.message}`);
          throw new Error(`Failed to reset token - ${error.message}`);
        }
        triviaSend(tokenChannel, void 0, "You've played all of the questions in this category! Questions will start to repeat.");

        // Start over now that we have a token.
        return await getTriviaQuestion(initial, category, tokenChannel, 1);
      }
      else {
        // This shouldn't ever happen.
        throw new Error("Token reset loop.");
      }
    }
    else if(json.response_code !== 0) {
      console.log("Received error from the trivia database..");
      console.log(json);

      // Delete the token so we'll generate a new one next time.
      // This is to fix the game in case the cached token is invalid.
      if(typeof token !== "undefined") {
        delete Database.tokens[tokenChannel.id];
      }

      // Author is passed through; triviaSend will handle it if author is undefined.
      throw new Error(`Failed to query the trivia database with error code ${json.response_code} (${Database.responses[json.response_code]})`);
    }
    else {
      global.questions = json.results;
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
getTriviaQuestion(1)
.catch((err) => {
  console.log(`An error occurred while attempting to initialize the question cache:\n ${err}`);
});

// Function to end trivia games
function triviaEndGame(id) {
  if(typeof game[id] === "undefined") {
    console.warn("Attempting to clear empty game, ignoring.");
    return;
  }

  if(typeof game[id].timeout !== "undefined") {
    clearTimeout(game[id].timeout);
  }

  delete game[id];
}

// # fetchFinalScores # //
// Returns a string containing a game's complete leaderboard.
function fetchFinalScores(id) {
  var scoreArray = [];
  var finalStr = "";
  for(var user in game[id].totalParticipants) {
    scoreArray.push(user);
  }

  var scoreA, scoreB;
  scoreArray.sort((a, b) => {
    scoreA = game[id].scores[a] || 0;
    scoreB = game[id].scores[b] || 0;

    return scoreB - scoreA;
  });

  scoreArray.forEach((userB) => {
    var score;
    if(typeof game[id].scores[userB] === "undefined") {
      score = 0;
    }
    else {
      score = game[id].scores[userB];
    }

    finalStr = `${finalStr}${finalStr!==""?"\n":""}${game[id].totalParticipants[userB]}: ${score}`;
  });

  return finalStr;
}

// # triviaRevealAnswer #
// Ends the round, reveals the answer, and schedules a new round if necessary.
// TODO: Refactor
triviaRevealAnswer = (id, channel, answer, importOverride) => {
  if(typeof game[id] === "undefined" || !game[id].inProgress) {
    return;
  }

  if(typeof game[id].message !== "undefined" && config["auto-delete-msgs"]) {
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
  if(!config["disable-score-display"]) {
    scoreStr = `(${game[id].scores[game[id].correctUsers[0]]} points)`;
  }

  var gameEndedMsg = "";
  var doAutoEnd = 0;
  if(game[id].cancelled) {
    gameEndedMsg = "\n\n*Game ended by admin.*";
  }
  else if(game[id].participants.length === 0) {
    // If there were no participants...
    if(game[id].emptyRoundCount+1 >= config["rounds-end-after"]) {
      doAutoEnd = 1;
      gameEndedMsg = "\n\n*Game ended.*";
    } else {
      game[id].emptyRoundCount++;
    }
  } else {
    // If there are participants and the game wasn't force-cancelled...
    game[id].emptyRoundCount = 0;
    doAutoEnd = 0;
  }

  if(gameEndedMsg === "" || config["disable-score-display"]) {
    // ## Normal Score Display ## //
    if(game[id].correctUsers.length === 0) {
      if(game[id].participants.length === 1) {
        correctUsersStr = `Incorrect, ${game[id].participantNames[0]}!`;
      }
      else {
        correctUsersStr = correctUsersStr + "Nobody!";
      }
    }
    else {
      if(game[id].participants.length === 1) {
        correctUsersStr = `Correct, ${Object.values(game[id].correctNames)[0]}! ${scoreStr}`; // Only one player overall, simply say "Correct!"
      }
      else  {
        // More than 10 correct players, player names are separated by comma to save space.
        var comma = ", ";
        for(var i = 0; i <= game[id].correctUsers.length-1; i++) {
          if(i === game[id].correctUsers.length-1) {
            comma = "";
          }
          else if(game[id].correctUsers.length <= 10) {
            comma = "\n";
          }

          if(!config["disable-score-display"]) {
            scoreStr = `(${game[id].scores[game[id].correctUsers[i]]} points)`;
          }

          correctUsersStr = `${correctUsersStr}${game[id].correctNames[game[id].correctUsers[i]]} ${scoreStr}${comma}`;
        }
      }
    }
  }
  else {
    // ## Game-Over Score Display ## //
    var totalParticipantCount = Object.keys(game[id].totalParticipants).length;

    correctUsersStr = `**Final score${totalParticipantCount!==1?"s":""}:**`;

    if(totalParticipantCount === 0) {
      correctUsersStr = `${correctUsersStr}\nNone`;
    }
    else {
      correctUsersStr = `${correctUsersStr}\n${fetchFinalScores(id)}`;
    }
  }

  triviaSend(channel, void 0, {embed: {
    color: game[id].color,
    description: `**${letters[game[id].correctId]}:** ${entities.decode(game[id].answer)}\n\n${correctUsersStr}${gameEndedMsg}`
  }}, (msg, err) => {
    if(typeof game[id] !== "undefined") {
      // NOTE: Participants check is repeated below in doTriviaGame
      if(!err && !doAutoEnd) {
        game[id].timeout = setTimeout(() => {
          if(config["auto-delete-msgs"]) {
            msg.delete()
            .catch((err) => {
              console.log(`Failed to delete message - ${err.message}`);
            });
          }
          doTriviaGame(id, channel, void 0, 1);
        }, config["round-timeout"]);
      }
      else {
        game[id].timeout = void 0;
        triviaEndGame(id);
      }
    }
  }, 1);
};

// # parseTriviaAnswer # //
// Parses a user's letter answer and scores it accordingly.
// Str: Letter answer -- id: channel identifier
function parseTriviaAnswer(str, id, userId, username) {
  // inProgress is always true when a game is active, even between rounds.

  if((str === "A" || str === "B" || game[id].isTrueFalse !== 1 && (str === "C"|| str === "D"))) {
    // Add to participants if they aren't already on the list
    if(game[id].inProgress && game[id].participants.includes(userId) === false) {
      game[id].participants.push(userId);
      game[id].participantNames.push(username);

      game[id].totalParticipants[userId] = username;
    }

    if(str === letters[game[id].correctId]) {
      if(!game[id].correctUsers.includes(userId)) {
        game[id].correctUsers.push(userId);
        game[id].correctNames[userId] = username;

        game[id].scores[userId] = game[id].scores[userId] || 0;

        game[id].scores[userId] += scoreValue[game[id].difficulty];
      }
    }
    else {
      // If the answer is wrong, remove them from correctUsers if necessary
      if(game[id].correctUsers.includes(userId) === true) {
        // Remove the name using the index of the ID. (This is important in case the user changes names)
        delete game[id].correctNames[userId];

        game[id].scores[userId] -= scoreValue[game[id].difficulty];

        // Now that the name is removed, we can remove the ID.
        game[id].correctUsers.splice(game[id].correctUsers.indexOf(userId), 1);
      }
    }
  }
}

async function addAnswerReactions(msg, id) {
  try {
    await msg.react("🇦");
    await msg.react("🇧");

    if(typeof game[id] == "undefined" || !game[id].isTrueFalse) {
      await msg.react("🇨");
      await msg.react("🇩");
    }
  } catch (error) {
    console.log(`Failed to add reaction: ${error}`);

    triviaSend(msg.channel, void 0, {embed: {
      color: 14164000,
      description: "Error: Failed to add reaction. This may be due to the channel's configuration.\n\nMake sure that the bot has the \"Use Reactions\" and \"Read Message History\" permissions or disable reaction mode to play."
    }});

    msg.delete();
    triviaEndGame(id);
    return;
  }
}

// # doTriviaGame #
// - id: The unique identifier for the channel that the game is in.
// - channel: The channel object that correlates with the game.
// - author: The user that started the game. Can be left 'undefined'
//           if the game is scheduled.
// - scheduled: Set to true if starting a game scheduled by the bot.
//              Keep false if starting on a user's command. (must
//              already have a game initialized to start)
doTriviaGame = (id, channel, author, scheduled, category) => {
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
    if(config["use-reactions"]) {
      useReactions = 1;
    }
  }

  // ## Game ##
  // Define the variables for the new game.
  // NOTE: This is run between rounds, plan accordingly.
  game[id] = {
    "inProgress": 1,
    "inRound": 1,

    "guildId": channel.type==="dm"?void 0:channel.guild.id,
    "userId": channel.type!=="dm"?void 0:channel.recipient.id,

    useReactions,
    "category": typeof game[id]!=="undefined"?game[id].category:category,

    "participants": [],
    "participantNames": [],
    "correctUsers": [],
    "correctNames": {},

    "totalParticipants": typeof game[id]!=="undefined"?game[id].totalParticipants:{},
    "scores": typeof game[id]!=="undefined"?game[id].scores:{},

    "prevParticipants": typeof game[id]!=="undefined"?game[id].participants:null,
    "emptyRoundCount": typeof game[id]!=="undefined"?game[id].emptyRoundCount:null
  };

  getTriviaQuestion(0, game[id].category, scheduled?void 0:channel)
  .then((question) => {
    // Make sure the game wasn't cancelled while querying the database.
    if(!game[id]) {
      return;
    }

    var answers = [];
    answers[0] = question.correct_answer;
    answers = answers.concat(question.incorrect_answers);

    if(question.incorrect_answers.length === 1) {
      game[id].isTrueFalse = 1;
    }

    var color = embedCol;
    if(config["hide-difficulty"] !== true) {
      switch(question.difficulty) {
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
      if(answers[i] === question.correct_answer) {
        game[id].correctId = i;
      }

      answerString = `${answerString}**${letters[i]}:** ${entities.decode(answers[i])}${config["debug-mode"]&&i===game[id].correctId?" *(Answer)*":""}\n`;
    }

    var categoryString = entities.decode(question.category);

    var infoString = "";
    if(!scheduled) {
      infoString = "\n";

      if(!useReactions) {
        infoString = `${infoString}Type a letter to answer! `;
      }

      infoString = `${infoString}The answer will be revealed in ${config["round-length"]/1000} seconds.`;
    }

    triviaSend(channel, author, {embed: {
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

          if(!scheduled) {
            // Stat: Games played - custom
            global.client.shard.send({stats: { gamesPlayedCustom: 1 }});
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
             triviaRevealAnswer(id, channel, question.correct_answer);
          }, config["round-length"]);
        }
      }
    }, 1);
  })
  .catch((err) => {
    triviaSend(channel, author, {embed: {
      color: 14164000,
      description: `An error occurred while attempting to query the trivia database:\n*${err.message}*`
    }});

    console.log(`Database query error: ${err.message}`);

    triviaEndGame(id);
  });
};

async function doTriviaHelp(msg) {
  var res = "Let's play trivia! Type 'trivia play' to start a game.";

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
  res = res + `\nThere are ${apiCountGlobal.toLocaleString()} total questions.`;

  // Guild count
  var guildCount;
  try {
    var guildCountArray = await global.client.shard.fetchClientValues("guilds.size");
    guildCount = guildCountArray.reduce((prev, val) => prev + val, 0);
  }
  catch(err) {
    console.log(`Error while parsing help cmd guildCount: ${err.message}`);
    guildCount = "*(unknown)*";
  }
  res = res + ` Currently in ${guildCount.toLocaleString()} guild${guildCount!==1?"s":""}.`;

  // Commands and links
  res = `${res}\n\n${footerString}`;

  return triviaSend(msg.channel, msg.author, {embed: {
    color: embedCol,
    description: res
  }});
}

async function doTriviaCategories(msg) {
  var json;
  var json2;
  try {
    json = await Database.getCategories();
    json2 = await Database.getGlobalCounts();
  } catch(err) {
    // List was queried successfully, but the question was not received.
    triviaSend(msg.channel, msg.author, {embed: {
      color: 14164000,
      description: `Failed to query category counts.\n${err}`
    }});
    console.log(`Failed to retrieve category counts for 'trivia categories'.\n${err}`);
    return;
  }

  var categoryListStr = "**Categories:** ";
  var i = 0;
  //console.log(json2);
  for(i in json) {
    categoryListStr = `${categoryListStr}\n${json[i].name} - ${json2.categories[json[i].id].total_num_of_verified_questions} questions`;
  }

  var str = "A list has been sent to you via DM.";
  if(msg.channel.type === "dm") {
    str = "";
  }

  triviaSend(msg.author, void 0, categoryListStr, (msg2, err) => {
    if(err) {
      str = "Unable to send you the list because you cannot receive DMs.";
    }
    else {
      i++;
      triviaSend(msg.channel, void 0, `There ${i===1?"is":"are"} ${i} categor${i===1?"y":"ies"}. ${str}`);
    }
  });
}

function parseCommand(msg, cmd) {
  var id = msg.channel.id;

  if(cmd === "STOP" || cmd === "CANCEL" || cmd === "ADMIN STOP" || cmd === "ADMIN CANCEL") {
    if(typeof game[id] !== "undefined" && game[id].inProgress) {
      if(((msg.member !== null && msg.member.permissions.has("MANAGE_GUILD")) || msg.channel.type === "dm") && config["disable-admin-commands"] !== true) {
        // These are defined beforehand so we can refer to them after the game is deleted.
        let timeout = game[id].timeout;
        let inRound = game[id].inRound;
        let finalScoreStr = fetchFinalScores(id);

        game[id].cancelled = 1;

        if(typeof timeout !== "undefined") {
          var onTimeout = timeout._onTimeout;
          clearTimeout(timeout);

          // If a round is in progress, display the answers before cancelling the game.
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
          triviaSend(msg.channel, void 0, {embed: {
            color: embedCol,
            description: `Game ended by admin.${finalScoreStr!==""?"\n\n**Final scores:**\n":""}${finalScoreStr}`
          }});
        }
      }
      else {
        triviaSend(msg.channel, void 0, `Trivia games will end automatically if the game is inactive for more than ${config["rounds-end-after"]-1} round${config["rounds-end-after"]-1===1?"":"s"}. Only users with the "Manage Server" permission can force-end a game.`);
      }
    }
  }

  if(cmd.startsWith("PLAY ") || cmd === "PLAY") {
    if(typeof game[id] !== "undefined" && game[id].inProgress) {
      return;
    }

    var categoryInput = cmd.replace("PLAY ","");
    if(categoryInput !== "PLAY") {

      var categoryList;
      new Promise((resolve, reject) => {
        // Automatically give "invalid category" if query is shorter than 3 chars.
        if(categoryInput.length < 3) {
          categoryInput = void 0;
        }

        // Get the category list.
        Database.getCategories()
        .then((json) => {
          // Success, we'll continue as normal.
          categoryList = json;
          resolve();
        })
        .catch((err) => {
          // Should this fail, the error will be passed to the check below.
          reject(err);
        });
      })
      .then(() => {
        var category = categoryList.find((el) => {
          return el.name.toUpperCase().includes(categoryInput);
        });

        if(typeof category === "undefined") {
          triviaSend(msg.channel, msg.author, {embed: {
            color: 14164000,
            description: "Unable to find the category you specified.\nType `trivia play` to play in random categories, or type `trivia categories` to see a list of categories."
          }});
          return;
        }
        else {
          doTriviaGame(msg.channel.id, msg.channel, msg.author, 0, category.id);
        }
      })
      .catch((err) => {
        triviaSend(msg.channel, msg.author, {embed: {
          color: 14164000,
          description: `Failed to retrieve the category list:\n${err}`
        }});
        console.log(`Failed to retrieve category list:\n${err}`);
        return;
      });
    }
    else {
      // No category specified, start a normal game. (The database will pick a random category for us)
      doTriviaGame(msg.channel.id, msg.channel, msg.author, 0);
    }
  }

  if(cmd === "CATEGORIES") {
    doTriviaCategories(msg);
  }
}

// # trivia.parse #
exports.parse = (str, msg) => {
  // No games in fallback mode
  if(isFallbackMode(msg.channel.id)) {
    return;
  }

  // Str is always uppercase
  var id = msg.channel.id;

  // Other bots can't use commands
  if(msg.author.bot === true && config["allow-bots"] !== true) {
    return;
  }

  var prefix = config.prefix.toUpperCase();

  // ## Answers ##
  // Check for letters if not using reactions
  if(typeof game[id] !== "undefined" && !game[id].useReactions) {
    var name = msg.member !== null?msg.member.displayName:msg.author.username;

    parseTriviaAnswer(str, id, msg.author.id, name);
  }

  // ## Help Command Parser ##
  if(str === prefix + "HELP" || str.includes(`<@${global.client.user.id}>`)) {
    doTriviaHelp(msg);
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
    channel = global.client.users.find("id", json.userId);

    // Re-create the dmChannel object.
    if(channel !== null) {
      channel.createDM()
      .then((dmChannel) => {
        channel = dmChannel;
      });
    }

  }
  else {
    channel = global.client.channels.find("id", id);
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

    date.setMilliseconds(date.getMilliseconds()+config["round-length"]);
    timeout = date-new Date();

    game[id].timeout = setTimeout(() => {
      triviaRevealAnswer(id, channel, void 0, 1);
    }, timeout);
  }
  else {
    if(json.participants.length !== 0) {
      // Since date doesn't update between rounds, we'll have to add both the round's length and timeout
      date.setMilliseconds(date.getMilliseconds()+config["round-timeout"]+config["round-length"]);
      timeout = date-new Date();

      game[id].timeout = setTimeout(() => {
        doTriviaGame(id, channel, void 0, 0, json.category);
      }, timeout);
    }
  }
}

// Read game data
exports.getGame = () => {
  return game;
};

// Detect reaction answers
exports.reactionAdd = function(reaction, user) {
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
    var username = reaction.message.guild.members.find("id", user.id).displayName;
    parseTriviaAnswer(str, id, user.id, username);
  }
};

// # Game Exporter #
// Export the current game data to a file.
exports.exportGame = (file) => {
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
exports.importGame = (input, unlink) => {
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

// # Console Commands #
if(config["allow-eval"] === true) {
  process.stdin.on("data", (text) => {
    if(text.toString() === "export\r\n") {
      exports.exportGame();
    }

    if(text.toString() === "import\r\n") {
      exports.importGame(`"./game.${global.client.shard.id}.json.bak`);
    }
  });
}

// # Fallback Mode Functionality #
if(config["fallback-mode"] && !config["fallback-silent"]) {
  global.client.on("message", (msg) => {
      console.log(`Msg - ${msg.author === global.client.user?"(self)":""} Shard ${global.client.shard.id} - Channel ${msg.channel.id}`);
  });
}

process.on("exit", (code) => {
  if(code !== 0) {
    console.log("Exit with non-zero code, exporting game data...");
    exports.exportGame();
  }
});

// ## Import on Launch ## //
global.client.on("ready", () => {
  var file = `./game.${global.client.shard.id}.json.bak`;
  if(fs.existsSync(file)) {
    // Import the file, then delete it.
    exports.importGame(file, 1);
  }
});
