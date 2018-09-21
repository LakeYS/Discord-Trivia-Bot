var getConfigVal, triviaSend, game, Database, embedCol;
var advData = {};

module.exports = (functionConfig, functionSend, valGame, valDatabase, valEmbedCol) => {
  getConfigVal = functionConfig;
  triviaSend = functionSend;
  game = valGame;
  Database = valDatabase;
  embedCol = valEmbedCol;

  getConfigVal, game, Database, embedCol;

  // TODO: Only respond to the user that starts the advanced game
  function triviaPlayAdvanced(id, channel, author) {
    triviaSend(channel, author, {embed: {
      color: embedCol,
      description: "Type a message to continue."
    }});

    advData[id] = { advInputPending: 1 };
  }

  function parseAdv(id, msg) {
    if(advData[id]) {
      triviaSend(msg.channel, void 0, "(Ended) Advanced games are currently a work in progress.");
      delete advData[id]; // Clear the data
    }
    else {
      return -1;
    }
  }

  return { triviaPlayAdvanced: triviaPlayAdvanced, parseAdv: parseAdv };
};
