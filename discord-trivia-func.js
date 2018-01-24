/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;
const fs = require("fs");
const util = require("util");

const config = require(process.argv[2]);

const letters = ["A", "B", "C", "D"];

const openTDBResponses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

global.game = {};
global.questions = [];

// Initialize missing config options to their defaults
if(config["round-timeout"] === undefined)
  config["round-timeout"] = 5500;

if(config["round-length"] === undefined)
  config["round-length"] = 15000;

function initCategories() {
  // Initialize the categories
  // TODO: Error handling
  return new Promise((resolve, reject) => {
    https.get("https://opentdb.com/api_category.php", (res) => {
      var data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          global.categories = JSON.parse(data).trivia_categories;
          resolve(global.categories);
        } catch(error) {
          global.JSONData = data;
          reject(error);
        }
      });
    })
    .on("error", (error) => {
      reject(error);
    });
  });
}
initCategories()
.catch((err) => {
  console.log("Failed to retrieve category list:\n" + err);
});

// getTriviaQuestion
// Returns a promise, fetches a random question from the database.
// If initial is set to true, a question will not be returned. (For initializing the cache)
function getTriviaQuestion(initial, category) {
  return new Promise((resolve, reject) => {
    var length = global.questions.length;

    // To keep the question response quick, the bot always stays one question ahead.
    // This way, we're never waiting for OpenTDB to respond.
    if(length === undefined || length < 2 || category !== undefined) {
      var data = "";
      var args = "";

      // TODO: Check the cache for a question in the category
      if(category !== undefined)
        args += "?amount=1&category=" + category;
      else {
        args += "?amount=32";
      }

      https.get("https://opentdb.com/api.php" + args, (res) => {
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          var json = "";
          try {
            json = JSON.parse(data.toString());
          } catch(error) {
            global.JSONData = data;
            reject(error);
            return;
          }

          if(json.response_code !== 0) {
            console.log("Received error from OpenTDB.");
            console.log(json);

            // Author is passed through; triviaSend will handle it if author is undefined.
            reject(new Error("Failed to query the trivia database with error code " + json.response_code + " (" + openTDBResponses[json.response_code] + ")"));
            return;
          }
          //console.log(json);

          global.questions = json.results;

          // Now we'll return a question from the cache.
          ////////// **Copied below**
          if(!initial) {
            // Just in case, check the cached question count first.
            if(global.questions.length < 1)
              reject(new Error("Received empty response while attempting to retrieve a Trivia question."));
            else {

              resolve(global.questions[0]);

              delete global.questions[0];
              global.questions = global.questions.filter(val => Object.keys(val).length !== 0);

            }
          }
          //////////
          return;
        });
      })
      .on("error", (error) => {
        reject(error);
      });
    }
    else {
      ////////// **Copied above**
      if(!initial) {
        // Just in case, check the cached question count first.
        if(global.questions.length < 1)
          reject(new Error("Received empty response while attempting to retrieve a Trivia question."));
        else {
          resolve(global.questions[0]);

          delete global.questions[0];
          global.questions = global.questions.filter(val => Object.keys(val).length !== 0);

        }
      }
      //////////
    }
  });
}

// Initialize the question cache
getTriviaQuestion(1)
.catch(err => {
  console.log("An error occurred while attempting to initialize the question cache:\n" + err);
});

// Generic message sending function.
// This is to avoid repeating the same error catchers throughout the script.
// Beware: This is not used for every message. For corner cases, 'channel.send' is used.
function triviaSend(channel, author, msg) {
  return channel.send(msg)
  .catch((err) => {
    if(author !== undefined) {
      if(channel.type !== "dm") {
        author.send({embed: {
          color: 14164000,
          description: "Unable to send messages in this channel:\n" + err.toString().replace("DiscordAPIError: ","")
        }})
        .catch(() => {
          console.warn("Failed to send message to user " + author.id + ". (DM failed)");
        });
      }
      else {
          console.warn("Failed to send message to user " + author.id + ". (already in DM)");
        }
      }
      else
        console.warn("Failed to send message to channel. (no user)");
    });
}

// Function to end trivia games
function triviaEndGame(id) {
  if(global.game[id] === undefined) {
    console.warn("Attempting to clear empty game, ignoring.");
    return;
  }
  if(global.game[id].timeout !== undefined)
    clearTimeout(global.game[id].timeout);

  delete global.game[id];
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
  if(global.game[id] !== undefined) {
    if(!scheduled && global.game[id].timeout !== undefined && global.game[id].timeout._called == true) {
      // The timeout should never be stuck on 'called' during a round.
      // Dump the game in the console, clear it, and continue.
      console.error("ERROR: Unscheduled game '" + id + "' timeout appears to be stuck in the 'called' state. Cancelling game...");
      triviaEndGame(id);
    }
    else if(global.game[id].timeout !== undefined && global.game[id].timeout._idleTimeout == -1) {
      // This check may not be working, have yet to see it catch any games.
      // The timeout reads -1. (Can occur if clearTimeout is called without deleting.)
      // Dump the game in the console, clear it, and continue.
      console.error("ERROR: Game '" + id + "' timeout reads -1. Game will be cancelled.");
      triviaEndGame(id);
    }
    else if(global.game[id].answer === undefined) {
      console.error("ERROR: Game '" + id + "' is missing information. Game will be cancelled.");
      triviaEndGame(id);
    }
    else if(!scheduled && global.game[id].inProgress == 1)
      return; // If there's already a game in progress, don't start another unless scheduled by the script.
  }

  // ## Permission Checks ##
  var useReactions = 0;

  if(channel.type !== "dm" && author !== undefined) {
    // Check if we have proper permissions for the channel.
    var permissions = channel.permissionsFor(channel.guild.me);

    //var authorid = (author==undefined?"Unknown":author.id);

    // Permissions sometimes return null for some reason, so this is a workaround.
    if(permissions == null) {
      if(author !== undefined)
        triviaSend(author, undefined, "Unable to start a Trivia game in this channel. (Unable to determine permissions for this channel)");
      else
        console.warn("Failed to send message. (null permissions, no author)");

      return;
    }

    if(!channel.permissionsFor(channel.guild.me).has("SEND_MESSAGES")) {
      triviaSend(author, undefined, "Unable to start a Trivia game in this channel. (Bot does not have permission to send messages)");
      return;
    }

    if(!channel.permissionsFor(channel.guild.me).has("EMBED_LINKS")) {
      triviaSend(channel, author, "Unable to start a trivia game because this channel does not have the 'Embed Links' permission.");
      return;
    }

    if(config["use-reactions"] && channel.permissionsFor(channel.guild.me).has("ADD_REACTIONS") && channel.permissionsFor(channel.guild.me).has("READ_MESSAGE_HISTORY"))
      useReactions = 1;
  }
  else {
    if(config["use-reactions"])
      useReactions = 1;
  }

  // ## Game ##
  // Define the variables for the new game.
  global.game[id] = {
    "inProgress": 1,
    "inRound": 1,

    "useReactions": useReactions,
    "category": global.game[id]!==undefined?global.game[id].category:category,

    "participants": [],
    "correct_users": [],
    "correct_names": [],
    "correct_times": [], // Not implemented

    "prev_participants": global.game[id]!==undefined?global.game[id].participants:null
  };

  getTriviaQuestion(0, global.game[id].category)
  .then((question) => {
    // Make sure the global.game wasn't cancelled while querying OpenTDB.
    if(!global.game[id])
      return;

    var answers = [];
    answers[0] = question.correct_answer;
    answers = answers.concat(question.incorrect_answers);

    if(question.incorrect_answers.length == 1)
      global.game[id].isTrueFalse = 1;

    var color = 3447003;
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
    global.game[id].color = color;

    // Sort the answers in reverse alphabetical order.
    answers.sort();
    answers.reverse();

    var answerString = "";
    for(var i = 0; i <= answers.length-1; i++) {
      if(answers[i] == question.correct_answer)
        global.game[id].correct_id = i;

      answerString = answerString + "**" + letters[i] + ":** " + entities.decode(answers[i]) + "\n";
    }

    var categoryString = entities.decode(question.category);

    triviaSend(channel, author, {embed: {
      color: global.game[id].color,
      description: "*" + categoryString + "*\n**" + entities.decode(question.question) + "**\n" + answerString + (!scheduled&&!useReactions?"\nType a letter to answer!":"")
    }})
    .then(msg => {
      // Add reaction emojis if configured to do so.
      // Blahhh. Can this be simplified?
      if(useReactions) {
        var error = 0; // This will be set to 1 if something goes wrong.

        global.game[id].message = msg;

        msg.react("🇦")
        .catch(err => {
          console.log("Failed to add reaction A: " + err);
          error = 1;
        })
        .then(() => {
          msg.react("🇧")
          .catch(err => {
            console.log("Failed to add reaction B: " + err);
            error = 1;
          })
          .then(() => {
            // Only add C and D if it isn't a true/false question.
            // Reactions will stop here if the game has since been cancelled.
            if(global.game[id] == undefined || !global.game[id].isTrueFalse) {
              msg.react("🇨")
              .catch(err => {
                console.log("Failed to add reaction C: " + err);
                error = 1;
              })
              .then(() => {
                msg.react("🇩")
                .catch(err => {
                  console.log("Failed to add reaction D: " + err);
                  error = 1;
                });
              });
            }

            process.nextTick(() => {
              if(error) {
                triviaSend(channel, author, {embed: {
                  color: 14164000,
                  description: "Error: Failed to add reaction. This may be due to the channel's configuration."
                }});

                msg.delete();
                triviaEndGame(id);
                return;
              }
            });

          });
        });
      }
    });

    global.game[id].difficulty = question.difficulty;
    global.game[id].answer = question.correct_answer;
    global.game[id].dateStr = Date();

    // Reveal the answer after the time is up
    global.game[id].timeout = setTimeout(() => {
       triviaRevealAnswer(id, channel, question.correct_answer);
    }, config["round-length"]);
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
exports.parse = function(str, msg) {
  // No games in fallback mode
  if(config["fallback-mode"]) {
    return;
  }

  // Str is always uppercase
  var id = msg.channel.id;

  // Other bots can't use commands
  if(msg.author.bot === 1 && config["allow-bots"] !== true)
    return;

  var prefix = config.prefix.toUpperCase();

  // ## Answers ##
  // Check for letters if not using reactions
  ////////// **Note that this is copied below for reaction mode.**
  if(global.game[id] !== undefined && !global.game[id].useReactions) {
    // inProgress is always true when a game is active, even between rounds.

    // Make sure they haven't already submitted an answer
    if(global.game[id].inProgress && global.game[id].participants.includes(msg.author.id) == false) {
      if(str === letters[global.game[id].correct_id]) {
        global.game[id].correct_users.push(msg.author.id);
        global.game[id].correct_names.push(msg.author.username);
      }

      if((str === "A" || str === "B" || global.game[id].isTrueFalse != 1 && (str == "C"|| str == "D")))
        global.game[id].participants.push(msg.author.id);
      }
  }

  // ## Help Command ##
  if(str === prefix + "HELP" || str.includes("<@" + global.client.user.id + ">")) {
    https.get("https://opentdb.com/api_count_global.php", (res) => {
      var data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        var json = JSON.parse(data.toString());
        global.client.shard.fetchClientValues("guilds.size")
        .then(results => {
          triviaSend(msg.channel, msg.author, "Let's play trivia! Type '" + config.prefix + "play' to start a game.\nThere are " + json.overall.total_num_of_verified_questions + " verified questions. " + `Currently in ${results.reduce((prev, val) => prev + val, 0)} guilds.\n\n` + "Commands: `" + config.prefix + "play <category>`, `" + config.prefix + "help`, `" + config.prefix + "categories`\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
        })
        .catch(err => console.error("An error occurred while attempting to fetch the guild count:\n" + err));
      });
    }).on("error", () => {
      global.client.shard.fetchClientValues("guilds.size")
      .then(results => {
        triviaSend(msg.channel, msg.author, "Let's play trivia! Type '" + config.prefix + "play' to start a game.\n" + `Currently in ${results.reduce((prev, val) => prev + val, 0)} guilds.\n\n` + "Commands: `" + config.prefix + "play`, `" + config.prefix + "help`, `" + config.prefix + "categories`\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
      })
      .catch(err => console.error("An error occurred while attempting to fetch the guild count:\n" + err));
    });
  }

  // ## Normal Commands ##
  // If the string starts with the specified prefix (converted to uppercase)
  if(str.startsWith(prefix)) {
    var cmd = str.replace(prefix, "");

    if(cmd === "STOP" || cmd === "CANCEL")
      triviaSend(msg.channel, msg.author, "Trivia games will stop automatically if nobody participates after two rounds.\nServer managers can type 'trivia admin cancel' to force-cancel a round.");

    if(cmd.startsWith("PLAY")) {
      var categoryInput = cmd.replace("PLAY ","");

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

          if(category === undefined) {
            triviaSend(msg.channel, msg.author, {embed: {
              color: 14164000,
              description: "Unable to find the category you specified.\nType `trivia play` to play in a random category, or type `trivia categories` to see a list of categories."
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
            description: "Failed to retrieve the category list:\n" + err
          }});
          console.log("Failed to retrieve category list:\n" + err);
          return;
        });
      }
      else // No category specified, start a normal game. (OpenTDB will pick a random category for us)
        doTriviaGame(msg.channel.id, msg.channel, msg.author, 0);
    }

    if(cmd === "CATEGORIES") {
      https.get("https://opentdb.com/api_category.php", (res) => {
        var data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          var json = "";
          try {
            json = JSON.parse(data.toString());
          } catch(error) {
            triviaSend(msg.channel, msg.author, {embed: {
              color: 14164000,
              description: "Failed to query category list.\n" + error
            }});
            console.log("Failed to retrieve category list for 'trivia categories'.\n" + error);
            global.JSONData = data;
            return;
          }

          global.categories = "**Categories:** ";
          var i = 0;
          for(i in json.trivia_categories)
            global.categories = global.categories + "\n" + json.trivia_categories[i].name;

          var str = "A list has been sent to you via DM.";
          if(msg.channel.type == "dm")
            str = "";
          triviaSend(msg.author, undefined, global.categories)
            .catch(function(err) {
              str = "Unable to send you the list because you cannot receive DMs.";
              if(err != "DiscordAPIError: Cannot send messages to this user")
                console.log(err);
            })
            .then(() => {
              i++;
              triviaSend(msg.channel, undefined, "There are " + i + " categories. " + str);
            });
        });
      }).on("error", function(error) {
        triviaSend(msg.channel, msg.author, {embed: {
          color: 14164000,
          description: "Failed to query category list.\n" + error
        }});
      });
    }

    // **Admin Commands** //
    if(msg.member !== null && msg.member.permissions.has("MANAGE_GUILD") && config["disable-admin-commands"] !== true) {
      if(cmd == "ADMIN STOP" || cmd == "ADMIN CANCEL") {
        if(global.game[id] !== undefined && global.game[id].inProgress) {
          let timeout = global.game[id].timeout;

          if(timeout !== undefined) {
            var onTimeout = timeout._onTimeout;
            clearTimeout(timeout);

            // If a round is in progress, display the answers before cancelling the game.
            if(global.game[id].inRound && timeout !== undefined)
              onTimeout();
            }

          // If there's still a game, clear it.
          if(global.game[id] !== undefined)
            triviaEndGame(id);


          triviaSend(msg.channel, undefined, {embed: {
            color: 14164000,
            description: "Game stopped by admin."
          }});
        }
      }
    }
  }
};

// # triviaRevealAnswer #
// Ends the round, reveals the answer, and schedules a new round if necessary.
function triviaRevealAnswer(id, channel, answer) {
  if(global.game[id] == undefined || !global.game[id].inProgress)
    return;

  // Quick fix for timeouts not clearing correctly.
  if(answer !== global.game[id].answer) {
    console.warn("WARNING: Mismatched answers in timeout for global.game " + id + " (" + answer + "||" + global.game[id].answer + ")");
    return;
  }

  global.game[id].inRound = 0;

  var correct_users_str = "**Correct answers:**\n";

  if(global.game[id].correct_names.length == 0)
    correct_users_str = correct_users_str + "Nobody!";
  else {
    if(global.game[id].participants.length == 1)
      correct_users_str = "Correct!"; // Only one player overall, simply say "Correct!"
    else if(global.game[id].correct_names.length > 10) {
        // More than 10 correct players, player names are separated by comma to save space.
        var comma = ", ";
        for(var i = 0; i <= global.game[id].correct_names.length-1; i++) {
          if(i == global.game[id].correct_names.length-1)
            comma = "";

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

  triviaSend(channel, undefined, {embed: {
    color: global.game[id].color,
    description: "**" + letters[global.game[id].correct_id] + ":** " + entities.decode(global.game[id].answer) + "\n\n" + correct_users_str
  }});
  var participants = global.game[id].participants;

  if(participants.length != 0)
    global.game[id].timeout = setTimeout(() => {
      doTriviaGame(id, channel, undefined, 1);
    }, config["round-timeout"]);
  else {
    global.game[id].timeout = undefined;
    triviaEndGame(id);
  }
}

// triviaResumeGame
// Restores a game that does not have an active timeout.
//function triviaResumeGame(json, id) {
//  global.game[id] = json;
//
//  var channel = global.client.channels.find("id", id);
//
//  if(!global.game[id].inProgress)
//    return;
//
//  if(global.game[id].inRound)
//    triviaRevealAnswer(id);
//  else
//    doTriviaGame(id, channel, undefined, 0);
//}

// Detect reaction answers
exports.reactionAdd = function(reaction, user) {
  var id = reaction.message.channel.id;
  var str = reaction.emoji.name;

  // If a game is in progress, the reaction is on the right message, the game uses reactions, and the reactor isn't the TriviaBot client...
  if(global.game[id] !== undefined && global.game[id].message !== undefined && reaction.message.id == global.game[id].message.id && global.game[id].useReactions && user !== global.client.user) {
    if(str == "🇦")
      str = "A";
    else if(str == "🇧")
      str = "B";
    else if(str =="🇨")
      str = "C";
    else if(str =="🇩")
      str = "D";
    else
      return; // The reaction isn't a letter, ignore it.

    ////////// **Note that the following is copied and modified from above.**
    if(global.game[id].inProgress && global.game[id].participants.includes(user.id) == false) {
      if(str == letters[global.game[id].correct_id]) {
        // Only counts if this is the first time they type an answer
        global.game[id].correct_users.push(user.id);
        global.game[id].correct_names.push(user.username);
      }
    }
  }
};

// # Game Exporter #
// Export the current game data to a file.
function exportGame() {
  // util.inspect(global.game) is used instead of JSON.stringify to prevent circular structure errors.
  fs.writeFile("./game.json.bak", util.inspect(global.game), "utf8", (err) => {
    if(err)
      console.error("Failed to write to game.json.bak with the following err:\n" + err + "\nMake sure your config file is not read-only or missing.");
    else
      console.log("Game exported to game.json.bak");
  });
}

// # Console Commands #
process.stdin.on("data", function (text) {
  if(text.toString() == "export\r\n") {
    exportGame();
  }
});

// # Fallback Mode Functionality #
if(config["fallback-mode"]) {
  global.client.on("message", msg => {
    if(msg.author == global.client.user)
      console.log("Msg (Self) - Shard " + global.client.shard.id + " - Channel " + msg.channel.id);
    else
      console.log("Msg - Shard " + global.client.shard.id + " - Channel " + msg.channel.id);
  });
}
