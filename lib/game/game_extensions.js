// Game Extensions - Optional features for games that can be configured.
class GameExtensions {
  constructor(Trivia) {
    this.Trivia = Trivia;
  }

  // DELTA - Send rule information to Channel
  sendRules(game) {
    let rules_string = "";
    if(game.gameMode === "hangman") {
      rules_string += "- :pencil: Type the complete answer to the question for points.";

      if(game.getConfig("hangman-hints"))
        rules_string += "\n- :pencil: A hint will be revealed halfway through each round.";
    }
    else if(game.gameMode === "reaction")
      rules_string += "- :1234: Click a reaction letter to answer the question for points.";
    else if(game.gameMode === "typed")
      rules_string += "- :pencil: Type a letter to answer for points.";
    else
      rules_string += "- :radio_button: Click the correct answer for points.";

    if(game.getConfig("auto-delete-msgs"))
      rules_string += "\n - :sponge: Messages by the bot will be automatically deleted after a few seconds.";
    if(game.getConfig("auto-delete-answers"))
      rules_string += "\n - :mute: Your answers will be automatically deleted.";
    if(game.getConfig("disallow-answer-changes"))
      rules_string += "\n - :one: Only your first answer counts. **No need to spam different answers**.";

    rules_string += `\n - :hourglass_flowing_sand: Each round will last ${game.getTimerStr(game.timer)}.`;

    if(game.getConfig("score-threshold") >= 1)
      rules_string += `\n - :medal: You need to get ${game.getConfig("score-threshold")} points to receive the role.`;
    if(!game.getConfig("hide-difficulty"))
      rules_string += `\n - :person_lifting_weights: You earn points for each round based on the difficulty. ${game.getConfig("score-value")["easy"]} points for easy questions, ${game.getConfig("score-value")["medium"]} for medium, and ${game.getConfig("score-value")["hard"]} for hard questions.`;


    return {embed: {
      color: this.Trivia.embedCol,
      description: `**Rules of the Game:**\n${rules_string}`
    }};
  }

  // Unique answer bonus multiplier
  // Applies a bonus to a user based on how few other users answered the question.
  getUserUniqueBonus(game, userID) {
    var score = game.getConfig("score-value")[game.question.difficulty];
  
    var multiplier;
  
    var multiplierBase = game.getConfig("unique-multiplier-max");
    if(multiplierBase !== 0) {
      var index = Object.keys(game.usersCorrect).indexOf(userID)+1;

      // The index was -1, this user does not have a score yet.
      if(index === 0) {
        return 0;
      }
  
      // Score multiplier equation
      multiplier = multiplierBase/index+1;
  
      // Don't apply if the number is negative or passive.
      if(multiplier > 1) {
        var bonus = Math.floor((score*multiplier)-score);
  
        game.Trivia.debugLog(`Applied bonus score of ${bonus} to user ${userID}`);
        return bonus;
      }
    }
    
    return 0;
  }

  applyUniqueBonus(game) {
    for(var userID in game.usersActive) {
      var bonus = this.getUserUniqueBonus(game, userID);

      game.scores[userID] += bonus;
    }
  }
}

module.exports = GameExtensions;