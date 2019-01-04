var getConfigVal, triviaSend, game, embedCol, doTriviaGame;

module.exports = (functionConfig, functionSend, valGame, valDatabase, valEmbedCol, leaderboard, functionGame) => {
  getConfigVal = functionConfig;
  triviaSend = functionSend;
  game = valGame;
  embedCol = valEmbedCol;
  doTriviaGame = functionGame;

  // These are unused but will likely be used later.
  getConfigVal, game;

  function leagueParse(id, channel, author, member, cmd) {
    cmd = cmd.replace("LEAGUE ", "");
    var guild = member.guild;

    var isAdmin;
    if(member !== null && member.permissions.has("MANAGE_GUILD")) {
      isAdmin = true;
    }

    if(cmd.startsWith("STATS")) {
      var scores;
      try {
        scores = leaderboard.readScores(guild.id);
      } catch(err) {
        if(err.message === "Leaderboard is empty") {
          // The leaderboard is empty, display a message.
          triviaSend(channel, author, { embed: {
            color: embedCol,
            description: "The leaderboard is currently empty."
          }});
        }
        else {
          // Something went wrong, display the error and dump the stack in the console.
          console.log(err.stack);
          triviaSend(channel, author, {embed: {
            color: 14164000,
            description: `Failed to load the leaderboard: \n${err.message}`
          }});
        }

        return;
      }

      var totalParticipants = {};
      for(var userId in scores) {
        try {
          totalParticipants[userId] = guild.members.get(userId).displayName;
        }
        catch(err) {
          totalParticipants[userId] = "*Unknown*";
        }
      }

      var scoreStr = leaderboard.makeScoreStr(scores, totalParticipants);

      triviaSend(channel, author, {embed: {
        color: embedCol,
        description: `**${Object.keys(scores).length} value(s):** \n${scoreStr}`
      }});
    }

    if(cmd.startsWith("PLAY")) {
      if(isAdmin) {
        doTriviaGame(id, channel, author, 0)
        .then((game) => {
          if(typeof game !== "undefined") {
            game.isLeagueGame = true;
          }
        });
      } else {
        triviaSend(channel, author, "Only moderators can use this command. To start a normal game, type `trivia play`");
      }
    }
  }

  return { leagueParse };
};
