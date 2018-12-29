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

  function triviaLeagueParse(id, channel, author, cmd) {
    cmd = cmd.replace("LEAGUE ", "");

    if(cmd.startsWith("PLAY")) {
      doTriviaGame(id, channel, author, 0);
    }
  }

  return { triviaLeagueParse };
};
