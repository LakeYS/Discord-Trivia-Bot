var getConfigVal, triviaSend, game, Database, embedCol;

module.exports = (functionConfig, functionSend, valGame, valDatabase, valEmbedCol) => {
  getConfigVal = functionConfig;
  triviaSend = functionSend;
  game = valGame;
  Database = valDatabase;
  embedCol = valEmbedCol;

  getConfigVal, game, Database, embedCol;

  function triviaLeague(id, channel, author) {
    triviaSend(channel, author, {embed: {
      color: embedCol,
      description: "WIP"
    }});
  }

  return { triviaLeague };
};
