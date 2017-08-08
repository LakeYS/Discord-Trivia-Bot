/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;

const letters = ["A", "B", "C", "D"];

game = {};

exports.parse = function(str, msg) {
  var id = msg.channel.id;

  if(str == "TRIVIA HELP") {
    https.get("https://opentdb.com/api_count_global.php", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        msg.channel.send("Let's play trivia! Type 'trivia play' to start a game.\nThere are " + json.overall.total_num_of_verified_questions + " verified questions.\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
      });
    });
  }

  if(str == "TRIVIA START")
    doTriviaQuestion(msg);

  if(str == "TRIVIA PLAY")
    doTriviaQuestion(msg);

  if(str == "TRIVIA QUESTION")
    doTriviaQuestion(msg);

  if(game[id] !== undefined) {
    if(str.toUpperCase() == letters[game[id].correct_id] && game[id].inProgress) {
      // Only counts if this is the first time they type an answer
      if(game[id].participants.indexOf(msg.author.id)) {
        game[id].correct_users.push(msg.author.id);
        game[id].correct_names.push(msg.author.username);
      }
    }

    // TODO: Don't count if "C" or "D" is entered on a True/False question.
    if(game[id].inProgress && (str == "A" || str == "B" || str == "C" || str == "D"))
      game[id].participants.push(msg.author.id);
  }
};

function doTriviaQuestion(msg) {
  var id = msg.channel.id;
  if(game[id] === undefined || game[id].inProgress != 1)
    game[id] = {};
  else
    return;

  https.get("https://opentdb.com/api.php?amount=1", (res) => {
    res.on('data', function(data) {
      var json = JSON.parse(data.toString());
      // TODO: Catch errors from server

      var answers = [];

      if(json.response_code !== 0) {
        msg.channel.send("An error occurred.");
        return;
      }

      answers[0] = json.results[0].correct_answer;

      answers = answers.concat(json.results[0].incorrect_answers);

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

      game[id].inProgress = 1;
      game[id].participants = [];
      game[id].correct_users = [];
      game[id].correct_names = [];
      game[id].correct_times = []; // Not implemented

      // After eight seconds, we reveal the answer!
      setTimeout(function() {
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
        game[id] = {};

        if(participants.length != 0)
          setTimeout(() => {
            doTriviaQuestion(msg);
          }, 3500);
      }, 12000);
    });
  });
}
