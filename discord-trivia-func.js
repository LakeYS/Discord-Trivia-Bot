/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;

const letters = ["A", "B", "C", "D"];

answer = "N/A";

exports.parse = function(str, msg) {
  if(str == "HELP") {
    https.get("https://opentdb.com/api_count_global.php", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        console.log();
        msg.channel.send("Let's play trivia! Type 'trivia start' to start a game.\nThere are " + json.overall.total_num_of_verified_questions + " verified trivia questions!\nBot by Lake Y (http://LakeYS.net). Powered by OpenTDB (https://opentdb.com/).");
      });
    });
  }

  if(str == "START")
    msg.channel.send("Not implemented. Type 'trivia question' for a random question and 'trivia answer' for the answer.");

  if(str == "QUESTION") {
    https.get("https://opentdb.com/api.php?amount=1", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        // TODO: Catch errors from server

        var answers = [];

        answers[0] = json.results[0].correct_answer;

        answers = answers.concat(json.results[0].incorrect_answers);

        // Sort the answers in reverse alphabetical order.
        answers.sort();
        answers.reverse();

        var answerString = "";
        for(var i = 0; i <= answers.length-1; i++) {
          answerString = answerString + "**" + letters[i] + ":** " + entities.decode(answers[i]) + "\n";
        }

        //msg.channel.send("**Q:** " + entities.decode(json.results[0].question) + "\n**ANSWERS: **" + entities.decode(answers.toString().replace(/,/g, "/")));

        msg.channel.send({embed: {
          color: 3447003, // TODO: Adjust for question difficulty?
          description: "**" + entities.decode(json.results[0].question) + "**\n" + answerString
        }});

        answer = json.results[0].correct_answer;
      });
    });
  }

  if(str == "ANSWER") {
    if(answer !== undefined)
      msg.channel.send(entities.decode(answer));
  }
};
