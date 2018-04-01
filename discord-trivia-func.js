const https = require("https");
const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const JSON = require("circular-json");

var config = require("./lib/config.js")(process.argv[2]);

const letters = ["A", "B", "C", "D"];
const embedCol = config["beta-mode"]?8609529:27903;

const openTDBResponses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

const OpenTDB = require("./lib/opentdb.js")(config);

global.game = {};
global.questions = [];
global.tokens = {};

// parseURL
// Returns a promise. Queries the specified URL and parses the data as JSON.
function parseURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      var data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          var json =  JSON.parse(data);
          resolve(json);
        } catch(error) {
          global.JSONData = data;
          reject(error);
        }
      });
    }).on("error", (error) => {
      reject(error);
    });
  });
}

// Generic message sending function.
// This is to avoid repeating the same error catchers throughout the script.
var triviaSend = function(channel, author, msg, callback) {
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
          description: "TriviaBot is unable to send messages in this channel:\n" + err.message.replace("DiscordAPIError: ","") + str
        }})
        .catch(() => {
          console.warn("Failed to send message to user " + author.id + ". (DM failed)");
        });
      }
      else {
        console.warn("Failed to send message to user " + author.id + ". (already in DM)");
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
  });
};

function initCategories() {
  // Initialize the categories
  return new Promise((resolve, reject) => {
    parseURL(config.databaseURL + "/api_category.php")
    .then((data) => {
      global.categories = data.trivia_categories;
      resolve(global.categories);
    })
    .catch((err) => {
      reject(err);
      return;
    });
  });
}

initCategories()
.catch((err) => {
  console.log("Failed to retrieve category list:\n" + err);
});

// getTriviaToken
// Returns a promise, fetches a token for the specified discord.js TextChannel object.
// If no token exists, one will be requested from OpenTDB.
// If tokenChannel is undefined, the promise will automatically resolve with 'undefined'.
function getTriviaToken(tokenChannel) {
  return new Promise((resolve, reject) => {
    if(typeof tokenChannel === "undefined") {
      // No token requested, return without one.
      resolve(void 0);
      return;
    }
    else if(typeof global.tokens[tokenChannel.id] !== "undefined") {
      // Check if 6 hours have passed since the token was created.
      // If >6 hours have passed, we'll need to generate a new one.
      if(new Date().getTime() > global.tokens[tokenChannel.id].time.getTime()+2.16e+7) {
        // Token already exists but is expired, delete it and generate a new one.
        delete global.tokens[tokenChannel.id];
      }
      else {
        // Token already exists and is valid, return it and continue.
        resolve(global.tokens[tokenChannel.id].token);
        return;
      }
    }

    // No token exists, so we'll generate one.
    parseURL(config.databaseURL + "/api_token.php?command=request")
    .then((tokenContainer) => {
      try {
        if(tokenContainer.response_code !== 0) {
          reject(new Error("Received response code " + tokenContainer.response_code + ": " + openTDBResponses[tokenContainer.response_code]) + " while attempting to request a new token.");
        }
        else {
          global.tokens[tokenChannel.id] = { token: tokenContainer.token, time: new Date() };
          resolve(tokenContainer.token);
        }
      } catch(error) {
        reject(error);
      }
    })
    .catch((err) => {
      reject(err);
    });
  });
}

// resetTriviaToken
function resetTriviaToken(token) {
  return new Promise((resolve, reject) => {
    parseURL(config.databaseURL + "/api_token.php?command=reset&token=" + token)
    .then((json) => {
      if(json.response_code !== 0) {
        reject(new Error("Failed to reset token - received response code " + json.response_code + "(" + openTDBResponses[json.response_code] + ")"));
        return;
      }

      resolve(json);
    })
    .catch((err) => {
      reject(err);
      return;
    });
  });
}


// getTriviaQuestion
// Returns a promise, fetches a random question from the database.
// If initial is set to true, a question will not be returned. (For initializing the cache)
// If tokenChannel is specified (must be a discord.js TextChannel object), a token will be generated and used.
function getTriviaQuestion(initial, category, tokenChannel, tokenRetry) {
  return new Promise((resolve, reject) => {
    var length = global.questions.length;

    // To keep the question response quick, the bot always stays one question ahead.
    // This way, we're never waiting for OpenTDB to respond.
    if(typeof length === "undefined" || length < 2 || typeof category !== "undefined") {
      // We need a new question, either due to an empty cache or because we need a specific category.
      var args = "";

      // TODO: Check the cache for a question in the category
      if(typeof category !== "undefined") {
        args += "?amount=1&category=" + category;
      }
      else {
        args += "?amount=" + config["database-cache-size"];
      }

      // Get a token if one is requested.
      getTriviaToken(tokenChannel)
      .catch((error) => {
        // Something went wrong. We'll display a warning but we won't cancel the game.
        console.log("Failed to generate token for channel " + tokenChannel.id + ": " + error.message);
        triviaSend(tokenChannel, void 0, "Failed to generate a session token for this channel. You may see repeating questions in this category.\n(" + error.message + ")");
      })
      .then((token) => {
        if(typeof token !== "undefined" && typeof  category !== "undefined") {
          // Set the token and continue.
          args += "&token=" + token;
        }

        parseURL(config.databaseURL + "/api.php" + args)
        .then((json) => {
          if(json.response_code === 4) {
            // Token empty, reset it and start over.
            if(tokenRetry !== 1) {
              resetTriviaToken(token)
              .then(() => {
                triviaSend(tokenChannel, void 0, "You've played all of the questions in this category! Questions will start to repeat.");

                // Start over now that we have a token.
                getTriviaQuestion(initial, category, tokenChannel, 1)
                .then((question) => {
                  resolve(question);
                  return;
                })
                .catch((err) => {
                  reject(err);
                  return;
                });
              })
              .catch((err) => {
                console.log("Failed to reset token - " + err.message);
                reject(new Error("Failed to reset token - " + err.message));
                return;
              });
            }
            else {
            // This shouldn't ever happen.
            reject(new Error("Token reset loop."));
            }
          }
          else if(json.response_code !== 0) {
            console.log("Received error from OpenTDB.");
            console.log(json);

            // Author is passed through; triviaSend will handle it if author is undefined.
            reject(new Error("Failed to query the trivia database with error code " + json.response_code + " (" + openTDBResponses[json.response_code] + ")"));

            // Delete the token so we'll generate a new one next time.
            // This is to fix the game in case the cached token is invalid.
            delete global.tokens[tokenChannel.id];
          }
          else {
            global.questions = json.results;

            // Now we'll return a question from the cache.
            ////////// **Copied below**
            if(!initial) {
              // Just in case, check the cached question count first.
              if(global.questions.length < 1) {
                reject(new Error("Received empty response while attempting to retrieve a Trivia question."));
              }
              else {

                resolve(global.questions[0]);

                delete global.questions[0];
                global.questions = global.questions.filter((val) => Object.keys(val).length !== 0);

              }
            }
            //////////
            return;
          }
        })
        .catch((err) => {
          reject(err);
          return;
        });
      });
    }
    else {
      ////////// **Copied above**
      if(!initial) {
        // Just in case, check the cached question count first.
        if(global.questions.length < 1) {
          reject(new Error("Received empty response while attempting to retrieve a Trivia question."));
        }
        else {
          resolve(global.questions[0]);

          delete global.questions[0];
          global.questions = global.questions.filter((val) => Object.keys(val).length !== 0);

        }
      }
      //////////
    }
  });
}

// Initialize the question cache
getTriviaQuestion(1)
.catch((err) => {
  console.log("An error occurred while attempting to initialize the question cache:\n" + err);
});

// Function to end trivia games
function triviaEndGame(id) {
  if(typeof global.game[id] === "undefined") {
    console.warn("Attempting to clear empty game, ignoring.");
    return;
  }

  if(typeof global.game[id].timeout !== "undefined") {
    clearTimeout(global.game[id].timeout);
  }

  delete global.game[id];
}

// # triviaRevealAnswer #
// Ends the round, reveals the answer, and schedules a new round if necessary.
function triviaRevealAnswer(id, channel, answer, importOverride) {
  if(typeof global.game[id] === "undefined" || !global.game[id].inProgress) {
    return;
  }

  // Stat: Inc rounds played
  global.client.shard.send({stats: { roundsPlayed: 1 }});

  // Quick fix for timeouts not clearing correctly.
  if(answer !== global.game[id].answer && !importOverride) {
    console.warn("WARNING: Mismatched answers in timeout for global.game " + id + " (" + answer + "||" + global.game[id].answer + ")");
    return;
  }

  global.game[id].inRound = 0;

  var correct_users_str = "**Correct answers:**\n";

  if(global.game[id].correct_names.length === 0) {
    correct_users_str = correct_users_str + "Nobody!";
  }
  else {
    if(global.game[id].participants.length === 1) {
      correct_users_str = "Correct!"; // Only one player overall, simply say "Correct!"
    }
    else if(global.game[id].correct_names.length > 10) {
      // More than 10 correct players, player names are separated by comma to save space.
      var comma = ", ";
      for(var i = 0; i <= global.game[id].correct_names.length-1; i++) {
        if(i === global.game[id].correct_names.length-1) {
          comma = "";
        }

        correct_users_str = correct_users_str + global.game[id].correct_names[i] + comma;
      }
    }
    else {
      // Less than 10 correct players, all names are on their own line.
      for(var i2 = 0; i2 <= global.game[id].correct_names.length-1; i2++) {
        correct_users_str = correct_users_str + global.game[id].correct_names[i2] + "\n";
      }
    }
  }

  triviaSend(channel, void 0, {embed: {
    color: global.game[id].color,
    description: "**" + letters[global.game[id].correct_id] + ":** " + entities.decode(global.game[id].answer) + "\n\n" + correct_users_str
  }}, (msg, err) => {
    if(typeof global.game[id] !== "undefined") {
      var participants = global.game[id].participants;
      // NOTE: Participants check is repeated below in doTriviaGame
      if(!err && participants.length !== 0) {
        global.game[id].timeout = setTimeout(() => {
          doTriviaGame(id, channel, void 0, 1);
        }, config["round-timeout"]);
      }
      else {
        global.game[id].timeout = void 0;
        triviaEndGame(id);
      }
    }
  });
}

// # doTriviaGame #
// - id: The unique identifier for the channel that the game is in.
// - channel: The channel object that correlates with the game.
// - author: The user that started the game. Can be left 'undefined'
//           if the game is scheduled.
// - scheduled: Set to true if starting a game scheduled by the bot.
//              Keep false if starting on a user's command. (must
//              already have a game initialized to start)
function doTriviaGame(id, channel, author, scheduled, category) {
  // Check if there is a game running. If there is one, make sure it isn't frozen.
  // Checks are excepted for games that are being resumed from cache or file.
  if(typeof global.game[id] !== "undefined" && !global.game[id].resuming) {
    if(!scheduled && typeof  global.game[id].timeout !== "undefined" && global.game[id].timeout._called === true) {
      // The timeout should never be stuck on 'called' during a round.
      // Dump the game in the console, clear it, and continue.
      console.error("ERROR: Unscheduled game '" + id + "' timeout appears to be stuck in the 'called' state. Cancelling game...");
      triviaEndGame(id);
    }
    else if(typeof global.game[id].timeout !== "undefined" && global.game[id].timeout._idleTimeout === -1) {
      // This check may not be working, have yet to see it catch any games.
      // The timeout reads -1. (Can occur if clearTimeout is called without deleting.)
      // Dump the game in the console, clear it, and continue.
      console.error("ERROR: Game '" + id + "' timeout reads -1. Game will be cancelled.");
      triviaEndGame(id);
    }
    else if(typeof global.game[id].answer === "undefined") {
      console.error("ERROR: Game '" + id + "' is missing information. Game will be cancelled.");
      triviaEndGame(id);
    }
    else if(!scheduled && global.game[id].inProgress === 1) {
      return; // If there's already a game in progress, don't start another unless scheduled by the script.
    }
  }

  // ## Permission Checks ##
  var useReactions = 0;

  if(channel.type !== "dm" && typeof author !== "undefined") {
    if(config["use-reactions"]) {
      useReactions = 1;
    }
  }

  // ## Game ##
  // Define the variables for the new game.
  global.game[id] = {
    "inProgress": 1,
    "inRound": 1,

    useReactions,
    "category": typeof global.game[id]!=="undefined"?global.game[id].category:category,

    "participants": [],
    "correct_users": [],
    "correct_names": [],
    "correct_times": [], // Not implemented

    "prev_participants": typeof global.game[id]!=="undefined"?global.game[id].participants:null
  };

  getTriviaQuestion(0, global.game[id].category, channel)
  .then((question) => {
    // Make sure the global.game wasn't cancelled while querying OpenTDB.
    if(!global.game[id]) {
      return;
    }

    var answers = [];
    answers[0] = question.correct_answer;
    answers = answers.concat(question.incorrect_answers);

    if(question.incorrect_answers.length === 1) {
      global.game[id].isTrueFalse = 1;
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
    global.game[id].color = color;

    // Sort the answers in reverse alphabetical order.
    answers.sort();
    answers.reverse();

    var answerString = "";
    for(var i = 0; i <= answers.length-1; i++) {
      if(answers[i] === question.correct_answer) {
        global.game[id].correct_id = i;
      }

      answerString = answerString + "**" + letters[i] + ":** " + entities.decode(answers[i]) + "\n";
    }

    var categoryString = entities.decode(question.category);

    triviaSend(channel, author, {embed: {
      color: global.game[id].color,
      description: "*" + categoryString + "*\n**" + entities.decode(question.question) + "**\n" + answerString + (!scheduled&&!useReactions?"\nType a letter to answer!":"")
    }}, (msg, err) => {
      if(err) {
        global.game[id].timeout = void 0;
        triviaEndGame(id);
      }
      else if(typeof msg !== "undefined") {
        global.game[id].message = msg;

        // Add reaction emojis if configured to do so.
        // Blahhh. Can this be simplified?
        if(useReactions) {
          var error = 0; // This will be set to 1 if something goes wrong.
          msg.react("🇦")
          .catch((err) => {
            console.log("Failed to add reaction A: " + err);
            error = 1;
          })
          .then(() => {
            msg.react("🇧")
            .catch((err) => {
              console.log("Failed to add reaction B: " + err);
              error = 1;
            })
            .then(() => {
              // Only add C and D if it isn't a true/false question.
              // Reactions will stop here if the game has since been cancelled.
              if(typeof global.game[id] == "undefined" || !global.game[id].isTrueFalse) {
                msg.react("🇨")
                .catch((err) => {
                  console.log("Failed to add reaction C: " + err);
                  error = 1;
                })
                .then(() => {
                  msg.react("🇩")
                  .catch((err) => {
                    console.log("Failed to add reaction D: " + err);
                    error = 1;
                  });
                });
              }

              process.nextTick(() => {
                if(error) {
                  triviaSend(channel, author, {embed: {
                    color: 14164000,
                    description: "Error: Failed to add reaction. This may be due to the channel's configuration.\n\nMake sure that the bot has the \"Use Reactions\" and \"Read Message History\" permissions or disable reaction mode to play."
                  }});

                  msg.delete();
                  triviaEndGame(id);
                  return;
                }
              });

            });
          });
        }

        if(typeof global.game[id] !== "undefined") {
          global.game[id].difficulty = question.difficulty;
          global.game[id].answer = question.correct_answer;
          global.game[id].date = new Date();

          // Reveal the answer after the time is up
          global.game[id].timeout = setTimeout(() => {
             triviaRevealAnswer(id, channel, question.correct_answer);
          }, config["round-length"]);
        }
      }
    });
  })
  .catch((err) => {
    triviaSend(channel, author, {embed: {
      color: 14164000,
      description: "An error occurred while attempting to query the trivia database:\n*" + err.message + "*"
    }});

    console.log("Database query error: " + err.message);

    triviaEndGame(id);
  });
}

// # trivia.parse #
exports.parse = (str, msg) => {
  // No games in fallback mode
  if(config["fallback-mode"]) {
    return;
  }

  // Str is always uppercase
  var id = msg.channel.id;

  // Other bots can't use commands
  if(msg.author.bot === 1 && config["allow-bots"] !== true) {
    return;
  }

  var prefix = config.prefix.toUpperCase();

  // ## Answers ##
  // Check for letters if not using reactions
  ////////// **Note that this is copied below for reaction mode.**
  if(typeof global.game[id] !== "undefined" && !global.game[id].useReactions) {
    // inProgress is always true when a game is active, even between rounds.

    // Make sure they haven't already submitted an answer
    if(global.game[id].inProgress && global.game[id].participants.includes(msg.author.id) === false) {
      if(str === letters[global.game[id].correct_id]) {
        global.game[id].correct_users.push(msg.author.id);
        global.game[id].correct_names.push(msg.author.username);
      }

      if((str === "A" || str === "B" || global.game[id].isTrueFalse !== 1 && (str === "C"|| str === "D"))) {
        global.game[id].participants.push(msg.author.id);
      }
    }
  }

  // ## Help Command Parser ##
  if(str === prefix + "HELP" || str.includes("<@" + global.client.user.id + ">")) {
    doTriviaHelp(msg);
  }

  // ## Normal Commands ##
  // If the string starts with the specified prefix (converted to uppercase)
  if(str.startsWith(prefix)) {
    var cmd = str.replace(prefix, "");

    if(cmd === "STOP" || cmd === "CANCEL") {
      triviaSend(msg.channel, msg.author, "Trivia games will stop automatically if nobody participates after two rounds.\nServer managers can type 'trivia admin cancel' to force-cancel a round.");
    }

    if(cmd.startsWith("PLAY")) {
      var categoryInput = cmd.replace("PLAY ","");

      if(typeof global.game[id] !== "undefined" && global.game[id].inProgress) {
        return;
      }

      if(categoryInput.length >= 3 && categoryInput !== "PLAY") {
        new Promise((resolve, reject) => {
          if(typeof global.categories === "undefined") {
            // Categories are missing, so we'll try to re-initialize them.
            initCategories()
            .then(() => {
              // Success, we'll continue as normal.
              resolve();
            })
            .catch((err) => {
              // Should this fail, the error will be passed to the check below.
              reject(err);
            });
          }
          else {
            // Categories are already defined and ready to use, so we'll continue.
            resolve();
          }
        })
        .then(() => {
          var category = global.categories.find((el) => {
            return el.name.toUpperCase().includes(categoryInput);
          });

          if(typeof category === "undefined") {
            triviaSend(msg.channel, msg.author, {embed: {
              color: 14164000,
              description: "Unable to find the category you specified.\nType `trivia play` to play in a random category, or type `trivia categories` to see a list of categories."
            }});
            return;
          }
          else {
            doTriviaGame(msg.channel.id, msg.channel, msg.author, 0, category.id);

            // Stat: Games played, custom category games played
            global.client.shard.send({stats: { gamesPlayed: 1, gamesPlayedCustom: 1 }});
          }
        })
        .catch((err) => {
          triviaSend(msg.channel, msg.author, {embed: {
            color: 14164000,
            description: "Failed to retrieve the category list:\n" + err
          }});
          console.log("Failed to retrieve category list:\n" + err);
          return;
        });
      }
      else { // No category specified, start a normal game. (OpenTDB will pick a random category for us)
        doTriviaGame(msg.channel.id, msg.channel, msg.author, 0);

        // Stat: Games played
        global.client.shard.send({stats: { gamesPlayed: 1, gamesPlayedNormal: 1 }});
      }
    }

    if(cmd === "CATEGORIES") {
      doTriviaCategories(msg);
    }

    // **Admin Commands** //
    if(msg.member !== null && msg.member.permissions.has("MANAGE_GUILD") && config["disable-admin-commands"] !== true) {
      if(cmd === "ADMIN STOP" || cmd === "ADMIN CANCEL") {
        if(typeof global.game[id] !== "undefined" && global.game[id].inProgress) {
          let timeout = global.game[id].timeout;

          if(typeof timeout !== "undefined") {
            var onTimeout = timeout._onTimeout;
            clearTimeout(timeout);

            // If a round is in progress, display the answers before cancelling the game.
            if(global.game[id].inRound && typeof timeout !== "undefined") {
              onTimeout();
            }
          }

          // If there's still a game, clear it.
          if(typeof global.game[id] !== "undefined") {
            triviaEndGame(id);
          }

          triviaSend(msg.channel, void 0, {embed: {
            color: 14164000,
            description: "Game stopped by admin."
          }});
        }
      }
    }
  }
};

async function doTriviaHelp(msg) {
  var res = "Let's play trivia! Type 'trivia play' to start a game.";

  // Question count
  var apiCountGlobal;
  try {
    var json = await OpenTDB.getGlobalCounts();
    apiCountGlobal = json.overall.total_num_of_verified_questions;
  }
  catch(err) {
    console.log("Error while parsing help cmd apiCountGlobal: " + err.message);
    apiCountGlobal = "*(unknown)*";
  }
  res = res + `\nThere are ${apiCountGlobal} total questions.`;

  // Guild count
  var guildCount;
  try {
    var guildCountArray = await global.client.shard.fetchClientValues("guilds.size");
    guildCount = guildCountArray.reduce((prev, val) => prev + val, 0);
  }
  catch(err) {
    console.log("Error while parsing help cmd guildCount: " + err.message);
    guildCount = "*(unknown)*";
  }
  res = res + ` Currently in ${guildCount} guild${guildCount!==1?"s":""}.`;

  // Commands and links
  res = res + `\n\nCommands: \`${config.prefix}play <category>\`, \`${config.prefix}help\`, \`${config.prefix}categories\`\nBot by Lake Y - [LakeYS.net](http://lakeys.net). ${config.databaseURL==="https://opentdb.com"?"Powered by the [Open Trivia Database](https://opentdb.com/).":""}`;

  return triviaSend(msg.channel, msg.author, {embed: {
    color: embedCol,
    description: res
  }});
}

async function doTriviaCategories(msg) {
  try {
    var json = await OpenTDB.getCategories();
    var json2 = await OpenTDB.getGlobalCounts();
  } catch(err) {
    // List was queried successfully, but the question was not received.
    triviaSend(msg.channel, msg.author, {embed: {
      color: 14164000,
      description: "Failed to query category counts.\n" + err
    }});
    console.log("Failed to retrieve category counts for 'trivia categories'.\n" + err);
    return;
  }

  var categoryListStr = "**Categories:** ";
  var i = 0;
  //console.log(json2);
  for(i in json) {
    categoryListStr = categoryListStr + "\n" + json[i].name + " - " + json2.categories[json[i].id].total_num_of_verified_questions + " questions";
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

// triviaResumeGame
// Restores a game that does not have an active timeout.
function triviaResumeGame(json, id) {
  var channel = global.client.channels.find("id", id);

  if(!json.inProgress) {
    delete global.game[id];
    return;
  }

  if(channel === null) {
    console.warn("Unable to find channel '" + id + "'. Game will not resume.");
    delete global.game[id];
    return;
  }

  json.resuming = 1;

  var date = global.game[id].date;
  var timeout;

  // If more than 60 seconds have passed, cancel the game entirely.
  if(new Date().getTime() > date.getTime()+60000) {
    console.log(`Imported game in channel ${id} is more than one minute old, aborting...`);
    delete global.game[id];
    return;
  }

  if(json.inRound) {
    global.game[id] = json;
    global.game[id].resuming = 1;

    // Calculate timeout based on game time

    date.setMilliseconds(date.getMilliseconds()+config["round-length"]);
    timeout = date-new Date();

    global.game[id].timeout = setTimeout(() => {
      triviaRevealAnswer(id, channel, void 0, 1);
    }, timeout);
  }
  else {
    if(json.participants.length !== 0) {
      // Since date doesn't update between rounds, we'll have to add both the round's length and timeout
      date.setMilliseconds(date.getMilliseconds()+config["round-timeout"]+config["round-length"]);
      timeout = date-new Date();

      global.game[id].timeout = setTimeout(() => {
        doTriviaGame(id, channel, void 0, 0, json.category);
      }, timeout);
    }
  }
}

// Detect reaction answers
exports.reactionAdd = function(reaction, user) {
  var id = reaction.message.channel.id;
  var str = reaction.emoji.name;

  // If a game is in progress, the reaction is on the right message, the game uses reactions, and the reactor isn't the TriviaBot client...
  if(typeof global.game[id] !== "undefined" && typeof global.game[id].message !== "undefined" && reaction.message.id === global.game[id].message.id && global.game[id].useReactions && user !== global.client.user) {
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

    ////////// **Note that the following is copied and modified from above.**
    if(global.game[id].inProgress && global.game[id].participants.includes(user.id) === false) {
      if(str === letters[global.game[id].correct_id]) {
        // Only counts if this is the first time they type an answer
        global.game[id].correct_users.push(user.id);
        global.game[id].correct_names.push(user.username);
      }

      if((str === "A" || str === "B" || global.game[id].isTrueFalse !== 1 && (str === "C"|| str === "D"))) {
        global.game[id].participants.push(user.id);
      }
    }
  }
};

// # Game Exporter #
// Export the current game data to a file.
exports.exportGame = (file) => {
  // Copy the data so we don't modify the actual game object.
  var json = JSON.parse(JSON.stringify(global.game));

  // Remove the timeout so the game can be exported.
  Object.keys(json).forEach((key) => {
    if(typeof json[key].timeout !== "undefined") {
      delete json[key].timeout;
      delete json[key].message;
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
    console.log("Game exported to " + file);
  }
  catch(err) {
    console.error("Failed to write to game.json.bak with the following err:\n" + err + "\nMake sure your config file is not read-only or missing.");
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
      console.log("Failed to parse JSON from ./game." + global.client.shard.id + ".json.bak");
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
    if(typeof global.game[key] === "undefined") {
      // Create a holder game object to complete what is left of the timeout.
      global.game[key] = json[key];

      // Mark it as imported so the exporter doesn't re-export it
      global.game[key].imported = 1;

      json[key].date = new Date(json[key].date);
      triviaResumeGame(json[key], key);
    }
  });
};

// # Console Commands #
process.stdin.on("data", (text) => {
  if(text.toString() === "export\r\n") {
    exports.exportGame();
  }

  if(text.toString() === "import\r\n") {
    exports.importGame("./game." + global.client.shard.id + ".json.bak");
  }
});

// # Fallback Mode Functionality #
if(config["fallback-mode"] && !config["fallback-silent"]) {
  global.client.on("message", (msg) => {
    if(msg.author === global.client.user) {
      console.log("Msg (Self) - Shard " + global.client.shard.id + " - Channel " + msg.channel.id);
    }
    else {
      console.log("Msg - Shard " + global.client.shard.id + " - Channel " + msg.channel.id);
    }
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
  var file = "./game." + global.client.shard.id + ".json.bak";
  if(fs.existsSync(file)) {
    // Import the file, then delete it.
    exports.importGame(file, 1);
  }
});
