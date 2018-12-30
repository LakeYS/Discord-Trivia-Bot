var getConfigVal, triviaSend, game, embedCol, doTriviaGame;

module.exports = (functionConfig, functionSend, valGame, valDatabase, valEmbedCol, leaderboard, functionGame) => {
  getConfigVal = functionConfig;
  triviaSend = functionSend;
  game = valGame;
  embedCol = valEmbedCol;
  doTriviaGame = functionGame;

  // These are unused but will likely be used later.
  getConfigVal, game, embedCol, triviaSend;

  function leagueParse(id, channel, author, member, cmd) {
    cmd = cmd.replace("LEAGUE ", "");

    var isAdmin;
    if(member !== null && member.permissions.has("MANAGE_GUILD")) {
      isAdmin = true;
    }

    if(cmd.startsWith("STATS")) {
      channel.send("WIP");
    }

    if(cmd.startsWith("PLAY")) {
      if(isAdmin) {
        doTriviaGame(id, channel, author, 0);
      } else {
        channel.send("Only moderators can use this command. To start a normal game, type `trivia play`");
      }
    }
  }

  return { leagueParse };
};
