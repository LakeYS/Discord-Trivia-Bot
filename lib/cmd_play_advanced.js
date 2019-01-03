var advData = {};

module.exports = (functionConfig, functionSend, functionDoGame, valGame, valDatabase, valEmbedCol) => {
  var getConfigVal = functionConfig;
  var triviaSend = functionSend;
  var game = valGame;
  var Database = valDatabase;
  var embedCol = valEmbedCol;
  var doTriviaGame = functionDoGame;

  getConfigVal, game, Database, embedCol;

  function triviaPlayAdvanced(id, channel, author) {
    if(typeof advData[id] === "undefined") {
      triviaSend(channel, author, {embed: {
        color: embedCol,
        description: "Enter a category ID. (Temporary)"
      }}, void 0, true);

      advData[id] = { user: author.id, pendingCategory: true };

    }
    //else if(advData[id].pendingCategory) {
    //  triviaSend(channel, author, "Unable to identify the category you specified. Please try again, or type 'trivia categories' to see a list of categories.");
    //}
  }

  function parseAdv(id, msg) {
    if(advData[id]) {
      if(msg.author.id !== advData[id].user) {
        return;
      }

      var cmd = msg.toString();

      if(advData[id].pendingCategory === true) {
        doTriviaGame(msg.channel.id, msg.channel, msg.author, 0, parseInt(cmd));
      }

      delete advData[id]; // Clear the data
    }
    else {
      return -1;
    }
  }

  return { triviaPlayAdvanced, parseAdv };
};
