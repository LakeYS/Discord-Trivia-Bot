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

  async function doAdvAction(id, msg) {
    if(advData[id]) {
      if(msg.author.id !== advData[id].user) {
        return;
      }
      var cmd = msg.toString().toUpperCase();
      var category;

      if(advData[id].pendingCategory) {
        if(cmd !== "RANDOM") {
          category = await Trivia.getCategoryFromStr(cmd);

          if(typeof category === "undefined") {
            triviaSend(msg.channel, msg.author, "Unable to identify the category you specified. Please try again, or type 'trivia categories' to see a list of categories.");
            delete advData[id];
            return -1;
          }
          else {
            advData[id].categoryId = category.id;
          }
        }
        advData[id].pendingCategory = false;
        advData[id].pendingType = true;

        triviaSend(msg.channel, msg.author, {embed: {
          color: embedCol,
          description: `What type of questions would you like to play? Type a number:
          **1**. Normal
          **2**. Multiple Choice Only
          **3**. True/False Only`
        }}, void 0, true);

        return;
      }
      else if(advData[id].pendingType) {
        if(cmd !== "1") {
          if(cmd === "2") {
            advData[id].type = "multiple";
          }
          else if(cmd === "3") {
            advData[id].type = "boolean";
          }
          else {
            triviaSend(msg.channel, msg.author, "Invalid input.");
            delete advData[id];
            return -1;
          }
        }
      }

      doTriviaGame(msg.channel.id, msg.channel, msg.author, 0, advData[id].categoryId, advData[id].type);
      delete advData[id];
    }
    else {
      return -1;
    }
  }

  async function parseAdv(id, msg) {
    return doAdvAction(id, msg);
  }

  return { triviaPlayAdvanced, parseAdv };
};
