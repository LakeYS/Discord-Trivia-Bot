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
      var scores = leaderboard.readScores(guild.id);

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
        doTriviaGame(id, channel, author, 0);
      } else {
        triviaSend(channel, author, "Only moderators can use this command. To start a normal game, type `trivia play`");
      }
    }
  }

  return { leagueParse };
};
