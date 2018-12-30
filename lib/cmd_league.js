var getConfigVal, triviaSend, game, Database, embedCol, doTriviaGame;

module.exports = (functionConfig, functionSend, valGame, valDatabase, valEmbedCol, functionGame) => {
  getConfigVal = functionConfig;
  triviaSend = functionSend;
  game = valGame;
  Database = valDatabase;
  embedCol = valEmbedCol;
  doTriviaGame = functionGame;

  // These are unused but will likely be used later.
  getConfigVal, game, Database, embedCol, triviaSend;

  function leagueParse(id, channel, author, member, cmd) {
    cmd = cmd.replace("LEAGUE ", "");

    var isAdmin;
    if(member !== null && member.permissions.has("MANAGE_GUILD")) {
      isAdmin = true;
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
