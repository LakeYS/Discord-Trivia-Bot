/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;

const letters = ["A", "B", "C", "D"];

question_in_progress = 0;
answer = "N/A";
correct_id = 0;
participants = [];
correct_users = [];
correct_names = [];
correct_times = [];

exports.parse = function(str, msg) {
  if(str == "TRIVIA HELP") {
    https.get("https://opentdb.com/api_count_global.php", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        msg.channel.send("Let's play trivia! Type 'trivia start' to start a game.\nThere are " + json.overall.total_num_of_verified_questions + " verified trivia questions!\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
      });
    });
  }

  if(str == "TRIVIA START")
    msg.channel.send("Not implemented. Type 'trivia question' for a random question.");

  if(str == "TRIVIA QUESTION")
    doTriviaQuestion(msg);

  if(str.toUpperCase() == letters[correct_id] && question_in_progress) {
    // Only counts if this is the first time they type an answer
    if(participants.indexOf(msg.author.id)) {
      correct_users.push(msg.author.id);
      correct_names.push(msg.author.username);
    }
  }

  // TODO: Don't count if "C" or "D" is entered on a True/False question.
  if(str == "A" || str == "B" || str == "C" || str == "D")
    participants.push(msg.author.id);
};

function doTriviaQuestion(msg) {
  if(question_in_progress) {
    return;
  }

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
          correct_id = i;

        answerString = answerString + "**" + letters[i] + ":** " + entities.decode(answers[i]) + "\n";
      }

      categoryString = entities.decode(json.results[0].category);

      msg.channel.send({embed: {
        color: color,
        description: "*" + categoryString + "*\n**" + entities.decode(json.results[0].question) + "**\n" + answerString
      }});

      answer = json.results[0].correct_answer;
      console.log(answer);

      question_in_progress = 1;
      participants = [];
      correct_users = [];
      correct_names = [];
      correct_times = [];

      // After eight seconds, we reveal the answer!
      // TODO: Only detect the first answer from each individual.
      setTimeout(function() {
        correct_users_str = "**Correct answers:**\n";

        if(correct_names.length == 0)
          correct_users_str = correct_users_str + "Nobody!";
        else {
          // TODO: Use commas and put all names on one line if there are tons of answers
          // TODO: Say "Correct!" rather than using a list if only one user participates
          if(correct_names.length == 1)
            correct_users_str = "Correct!"; // Only one player, make things simple.
          else if(correct_names.length > 10) {
              // More than 10 players, player names are separated by comma
              var comma = ", ";
              for(i = 0; i <= correct_names.length-1; i++) {
                if(i == correct_names.length-1)
                  comma = "";

                correct_users_str = correct_users_str + correct_names[i] + comma;
              }
            }
          else {
            // Less than 10 players, all names are on their own line.
            for(i = 0; i <= correct_names.length-1; i++) {
              correct_users_str = correct_users_str + correct_names[i] + "\n";
            }
          }
        }

        msg.channel.send({embed: {
          color: color,
          description: "**" + letters[correct_id] + ":** " + entities.decode(answer) + "\n\n" + correct_users_str
        }});
        question_in_progress = 0;
      }, 12000);
    });
  });
}
