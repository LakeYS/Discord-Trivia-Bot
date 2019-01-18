var advData = {};

module.exports = (Trivia, getConfigVal, triviaSend, doTriviaGame, game, Database, embedCol) => {

  getConfigVal, game, Database, embedCol;

  function triviaPlayAdvanced(id, channel, author) {
    if(typeof advData[id] === "undefined") {
      triviaSend(channel, author, {embed: {
        color: embedCol,
        description: "Type the category you would like to play in. Type \"random\" to play in random categories. Type \"trivia categories\" to see a list of available categories."
      }}, void 0, true);

      advData[id] = { user: author.id, pendingCategory: true };
    }
  }

  async function parseAdv(id, msg) {
    if(advData[id]) {
      if(msg.author.id !== advData[id].user) {
        return;
      }
      var cmd = msg.toString().toUpperCase();

      if(advData[id].pendingCategory === true) {
        var categoryId;
        if(cmd !== "RANDOM") {
          var category = await Trivia.getCategoryFromStr(cmd);

          if(typeof category === "undefined") {
            triviaSend(msg.channel, msg.author, "Unable to identify the category you specified. Please try again, or type 'trivia categories' to see a list of categories.");
            delete advData[id];
            return -1;
          }
          else {
            categoryId = category.id;
          }
        }

        doTriviaGame(msg.channel.id, msg.channel, msg.author, 0, categoryId);
        delete advData[id];
      }
    }
    else {
      return -1;
    }
  }

  return { triviaPlayAdvanced, parseAdv };
};
