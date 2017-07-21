/*jshint esversion: 6 */

const https = require("https");
const entities = require("html-entities").AllHtmlEntities;

answer = "N/A";

exports.parse = function(str, msg) {
  if(str == "HELP")
    msg.channel.send("Let's play trivia! Type 'trivia start' to start a game, or type any letter to vote in an ongoing game");

  if(str == "START")
    msg.channel.send("Not implemented. Type 'trivia question' for a random question and 'trivia answer' for the answer.");

  if(str == "QUESTION") {
    https.get("https://opentdb.com/api.php?amount=1", (res) => {
      res.on('data', function(data) {
        var json = JSON.parse(data.toString());
        msg.channel.send(entities.decode(json.results[0].question));

        //console.log(json.results[0].incorrect_answers);

        answer = json.results[0].correct_answer;
      });
    });
  }

  if(str == "ANSWER") {
    if(answer !== undefined)
      msg.channel.send(answer);
  }
};
