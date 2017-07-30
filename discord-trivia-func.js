/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;

const letters = ["A", "B", "C", "D"];

question_in_progress = 0;

answer = "N/A";

exports.parse = function(str, msg) {
  if(str == "TRIVIA HELP") {
    https.get("https://opentdb.com/api_count_global.php", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        console.log();
        msg.channel.send("Let's play trivia! Type 'trivia start' to start a game.\nThere are " + json.overall.total_num_of_verified_questions + " verified trivia questions!\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
      });
    });
  }

  if(str == "TRIVIA START")
    msg.channel.send("Not implemented. Type 'trivia question' for a random question.");

  if(str == "TRIVIA QUESTION")
    doTriviaQuestion(msg);
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

      question_in_progress = 1;

      setTimeout(function() {
        msg.channel.send({embed: {
          color: color,
          description: "**" + letters[correct_id] + ":** " + entities.decode(answer)
        }});
        question_in_progress = 0;
      }, 8000);
    });
  });
}
