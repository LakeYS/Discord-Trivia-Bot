/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;

const letters = ["A", "B", "C", "D"];

game = {};

exports.parse = function(str, msg) {
  // Str is always uppercase
  var id = msg.channel.id;

  if(str == "TRIVIA HELP" || str == "TRIVIA") {
    https.get("https://opentdb.com/api_count_global.php", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        msg.channel.send("Let's play trivia! Type 'trivia play' to start a game.\nThere are " + json.overall.total_num_of_verified_questions + " verified questions. Currently in " + client.guilds.size + " guilds.\nCommands: `trivia play`, `trivia help`, `trivia categories`\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
      });
    }).on('error', function(err) {
      msg.channel.send("Let's play trivia! Type 'trivia play' to start a game.\nCurrently in " + client.guilds.size + " guilds. \nCommands: `trivia play`, `trivia help`, `trivia categories`\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
    });
  }

  if(str == "TRIVIA STOP" || str == "TRIVIA CANCEL") {
    msg.channel.send("The game will stop automatically if nobody participates after two rounds.");

    if(config["disable-admin-commands"] !== true && msg.member !== null && msg.member.permissions.has("MANAGE_GUILD"))
      msg.channel.send("As a server manager, you can force-cancel a game by typing 'trivia admin cancel'");
  }

  if(str == "TRIVIA START" || str == "TRIVIA PLAY" || str == "TRIVIA QUESTION")
    doTriviaQuestion(msg);

  if(str == "TRIVIA CATEGORIES") {
    https.get("https://opentdb.com/api_category.php", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());

        var categories = "**Categories:** ";
        var i = 0;
        for(i in json.trivia_categories)
          categories = categories + "\n" + json.trivia_categories[i].name;

        var str = "A list has been sent to you via DM.";
        msg.author.send(categories)
          .catch(function(err) {
            str = "Unable to send you the list because you cannot receive DMs.";
            if(err != "DiscordAPIError: Cannot send messages to this user")
              console.log(err);
          })
          .then(function() {
            i++;
            msg.channel.send("There are " + i + " categories. " + str);
          });
      });
    }).on('error', function(err) {
      msg.channel.send("Failed to query category list.");
    });
  }

  if(game[id] !== undefined) {
    // inProgress is always true when a game is active, even between rounds.
    if(str == letters[game[id].correct_id] && game[id].inProgress) {
      // Only counts if this is the first time they type an answer
      if(game[id].participants.indexOf(msg.author.id)) {
        game[id].correct_users.push(msg.author.id);
        game[id].correct_names.push(msg.author.username);
      }
    }

    if(game[id].inProgress && (str == "A" || str == "B" || game[id].isTrueFalse != 1 && (str == "C"|| str == "D")))
      game[id].participants.push(msg.author.id);
  }

  // **Admin Commands** //
  if(msg.member !== null && msg.member.permissions.has("MANAGE_GUILD") && config["disable-admin-commands"] !== true) {
    if(str == "TRIVIA ADMIN STOP" || str == "TRIVIA ADMIN CANCEL") {
      if(game[id] !== undefined && game[id].inProgress) {
        delete game[id];
        msg.channel.send({embed: {
          color: 14164000,
          description: "Game stopped by admin."
        }});
      }
    }
  }
};

function doTriviaQuestion(msg, scheduled) {
  var id = msg.channel.id;
  if(!scheduled && game[id] !== undefined && game[id].inProgress == 1)
    return;

  // Define the variables for the new game.
  game[id] = {
    'inProgress': 1,
    'participants': [],
    'correct_users': [],
    'correct_names': [],
    'correct_times': [], // Not implemented
    'prev_participants': game[id]!==undefined?game[id].participants:null
  };

  https.get("https://opentdb.com/api.php?amount=1", (res) => {
    res.on('data', function(data) {
      // Make sure the game wasn't cancelled while querying OpenTDB.
      if(!game[id])
        return;

      var json = JSON.parse(data.toString());

      var answers = [];

      if(json.response_code !== 0) {
        console.log("Received error from OpenTDB.");
        console.log(json);

        msg.channel.send({embed: {
          color: 14164000,
          description: "An error occurred while attempting to query the trivia database."
        }});

        delete game[id];
        return;
      }

      answers[0] = json.results[0].correct_answer;

      answers = answers.concat(json.results[0].incorrect_answers);

      if(json.results[0].incorrect_answers.length == 1)
        game[id].isTrueFalse = 1;

      var color = 3447003;
      switch(json.results[0].difficulty) {
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

      // Sort the answers in reverse alphabetical order.
      answers.sort();
      answers.reverse();

      var answerString = "";
      for(var i = 0; i <= answers.length-1; i++) {
        if(answers[i] == json.results[0].correct_answer)
          game[id].correct_id = i;

        answerString = answerString + "**" + letters[i] + ":** " + entities.decode(answers[i]) + "\n";
      }

      var categoryString = entities.decode(json.results[0].category);

      msg.channel.send({embed: {
        color: color,
        description: "*" + categoryString + "*\n**" + entities.decode(json.results[0].question) + "**\n" + answerString
      }});

      game[id].answer = json.results[0].correct_answer;

      // After eight seconds, we reveal the answer!
      setTimeout(function() {
        if(game[id] === undefined || !game[id].inProgress)
          return;

        var correct_users_str = "**Correct answers:**\n";

        if(game[id].correct_names.length == 0)
          correct_users_str = correct_users_str + "Nobody!";
        else {
          if(game[id].correct_names.length == 1)
            correct_users_str = "Correct!"; // Only one player, make things simple.
          else if(game[id].correct_names.length > 10) {
              // More than 10 players, player names are separated by comma
              var comma = ", ";
              for(var i = 0; i <= game[id].correct_names.length-1; i++) {
                if(i == game[id].correct_names.length-1)
                  comma = "";

                correct_users_str = correct_users_str + game[id].correct_names[i] + comma;
              }
            }
          else {
            // Less than 10 players, all names are on their own line.
            for(var i2 = 0; i2 <= game[id].correct_names.length-1; i2++) {
              correct_users_str = correct_users_str + game[id].correct_names[i2] + "\n";
            }
          }
        }

        msg.channel.send({embed: {
          color: color,
          description: "**" + letters[game[id].correct_id] + ":** " + entities.decode(game[id].answer) + "\n\n" + correct_users_str
        }});
        var participants = game[id].participants;

        if(participants.length != 0)
          setTimeout(() => {
            doTriviaQuestion(msg, 1);
          }, 3500);
        else {
          delete game[id];
        }
      }, 12000);
    });
  }).on('error', function(err) {
    msg.channel.send({embed: {
      color: 14164000,
      description: "An error occurred while attempting to query the trivia database."
    }});

    delete game[id];
  });
}
