var advData = {};
var footerText = "Type 'cancel' to cancel";

module.exports = (Trivia, getConfigVal, triviaSend, doTriviaGame, game, Database, embedCol) => {

  getConfigVal, game, Database, embedCol;

  function triviaPlayAdvanced(id, channel, author) {
    if(typeof advData[id] === "undefined") {
      triviaSend(channel, author, {embed: {
        color: embedCol,
        description: "Type the category you would like to play in. Type \"random\" to play in random categories. Type \"trivia categories\" to see a list of available categories.",
        footer: { text: footerText }
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

      if(cmd === "CANCEL" || cmd === "TRIVIA STOP") {
        delete advData[id];
        triviaSend(msg.channel, msg.author, "Game cancelled.", void 0, true);
        return;
      }

      if(advData[id].pendingCategory) {
        if(cmd !== "RANDOM") {
          category = await Trivia.getCategoryFromStr(cmd);

          if(typeof category === "undefined") {
            return {
              error: true,
              text: "Unable to identify the category you specified. Please try again, or type 'trivia categories' to see a list of categories."
            };
          }
          else {
            advData[id].categoryId = category.id;
          }
        }
        advData[id].pendingCategory = false;
        advData[id].pendingType = true;

        return {
          text: `What type of questions would you like to play? Type a number:
          **1**. Normal
          **2**. Multiple Choice Only
          **3**. True/False Only`
        };
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
            return {
              error: true,
              text: "Invalid input, please try again."
            };
          }
        }
      }

      doTriviaGame(msg.channel.id, msg.channel, msg.author, 0, advData[id].categoryId, advData[id].type);
      delete advData[id];
    }
    else {
      return;
    }
  }

  async function parseAdv(id, msg) {
    var response;
    try {
      response = await doAdvAction(id, msg);
    } catch(err) {
      // Make sure there's actual data and this isn't just a random message.
      if(typeof advData[id] !== "undefined") {
        delete advData[id];

        console.log("Error parsing advanced game data. Dumping...");
        console.log(err);

        triviaSend(msg.channel, msg.author, {embed: {
          color: 14164000,
          description: `An error occurred while parsing advanced game data:\n${err}`
        }});
      }
    }

    if(typeof response === "undefined") {
      return -1;
    }

    var responseCol = response.error?14164000:embedCol;
    if(typeof response.text !== "undefined") {
      triviaSend(msg.channel, msg.author, {embed: {
        color: responseCol,
        description: response.text,
        footer: { text: footerText }
      }}, void 0, true);
    }

    return response;
  }

  return { triviaPlayAdvanced, parseAdv };
};
