var advData = {};
var footerText = "Type 'cancel' to cancel";

module.exports = (Trivia) => {
  var getConfigVal = Trivia.getConfigVal;

  function advGameExists(id) {
    return typeof advData[id] !== "undefined";
  }

  function cancelAdvGame(id) {
    if(typeof advData[id] !== "undefined") {
      clearTimeout(advData[id].timeout);
    }

    delete advData[id];
  }

  function triviaPlayAdvanced(onGameStart, id, channel, author) {
    if(typeof advData[id] === "undefined") {
      Trivia.send(channel, author, {embed: {
        color: Trivia.embedCol,
        description: `What game mode would you like to play in? Type a number:
        1. Normal
        2. Reaction mode
        3. Hangman`,
        footer: { text: footerText }
      }}, (msg, err) => {
        if(err) {
          console.log("Error detected, breaking");
          // Cancel everything if the first message fails to send
          cancelAdvGame(id);
          return;
        }
      }, true);

      advData[id] = { user: author.id, pendingMode: true, onGameStart };

      // Set a timer
      advData[id].timeout = setTimeout(() => {
        cancelAdvGame(id);
        Trivia.send(channel, author, "Advanced game cancelled due to inactivity.");
      }, 20000);
    }
  }

  // TODO: Refactor so the actions are not all contained within the same function.
  async function doAdvAction(id, msg, cmd) {
    if(msg.author.id !== advData[id].user) {
      return;
    }

    advData[id].timeout.refresh(); // Keep the timer alive for another 15 seconds.

    var category;

    if(cmd === "CANCEL") {
      cancelAdvGame(id);
      Trivia.send(msg.channel, void 0, "Game cancelled.", void 0, true);
      return;
    }

    if(advData[id].pendingMode) {
      if(cmd === "1") {
        advData[id].mode = 0;
      }
      else if(cmd === "2") {
        advData[id].mode = 1;
      }
      else if(cmd === "3") {
        return {
          error: true,
          text: "Hangman mode is not available yet! Try another mode."
        };
      }
      else {
        return {
          error: true
        };
      }
      advData[id].pendingMode = false;
      advData[id].pendingCategory = true;

      return {
        text: "Type the category you would like to play in. Type \"random\" or \"r\" to play in random categories. Type \"trivia categories\" to see a list of available categories."
      };
    }
    else if(advData[id].pendingCategory) {
      if(cmd !== "RANDOM" && cmd !== "R") {
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
            error: true
          };
        }
      }

      advData[id].pendingType = false;
      advData[id].pendingDifficulty = true;

      return {
        text: `What difficulty level would you like to play? Type a number:
        **1**. Normal
        **2**. Easy Only
        **3**. Medium Only
        **4**. Hard Only`
      };
    }
    else if(advData[id].pendingDifficulty) {
      if(cmd !== "1") {
        if(cmd === "2") {
          advData[id].difficulty = "easy";
        }
        else if(cmd === "3") {
          advData[id].difficulty = "medium";
        }
        else if(cmd === "4") {
          advData[id].difficulty = "hard";
        }
        else {
          return {
            error: true
          };
        }
      }

      advData[id].pendingDifficulty = false;
      advData[id].pendingChannel = true;

      return {
        text: `What channel should the game start in? Type a channel, for example <#${msg.channel.id}>, or type "here" or "h" to use the current channel.`
      };
    }
    else if(advData[id].pendingChannel) {
      var startChannel;
      if(cmd === "HERE" || cmd === "H") {
        startChannel = msg.channel;
      }
      else {
        var idInput = cmd.replace("<#","").replace(">","");
        startChannel = msg.guild.channels.find((obj) => (obj.id === idInput));
      }

      if(startChannel === null) {
        return {
          error: true,
          text: "Unable to find the channel specified. Please try again."
        };
      }

      advData[id].startChannel = startChannel;
    }

    var onGameStart = advData[id].onGameStart;
    var categoryId = advData[id].categoryId;
    var type = advData[id].type;
    var difficulty = advData[id].difficulty;
    var mode = advData[id].mode;
    var startChannelB = advData[id].startChannel;

    // Need to delete the data before starting so it doesn't auto-cancel.
    cancelAdvGame(id);

    var game = await Trivia.doGame(startChannelB.id, startChannelB, msg.author, 0, categoryId, type, difficulty, mode);
    onGameStart(game);
  }

  async function parseAdv(id, msg) {
    // Do absolutely nothing if there's no advanced game.
    // Beware that this check occurs for every message sent in each channel.
    if(!advData[id]) {
      return -1;
    }

    var cmd = msg.toString().toUpperCase();
    var prefix = getConfigVal("prefix", id).toUpperCase();

    // Ignore if the input is a command of any kind
    if(cmd.startsWith(prefix)) {
      return;
    }

    doAdvAction(id, msg, cmd)
    .catch((err) => {
      // Make sure there's actual data and this isn't just a random message.
      if(typeof advData[id] !== "undefined") {
        cancelAdvGame(advData[id]);

        console.log("Error parsing advanced game data. Dumping...");
        console.log(err);

        Trivia.send(msg.channel, void 0, {embed: {
          color: 14164000,
          description: `An error occurred while parsing advanced game data:\n${err}`
        }});
      }
    })
    .then((response) => {
      if(typeof response === "undefined") {
        return -1;
      }

      var responseCol = response.error?14164000:Trivia.embedCol;

      if(response.error && typeof response.text === "undefined") {
        response.text = "Invalid input, please try again.";
      }

      if(typeof response.text !== "undefined") {
        Trivia.send(msg.channel, void 0, {embed: {
          color: responseCol,
          description: response.text,
          footer: { text: footerText }
        }}, void 0, true);
      }

      return response;
    });
  }

  return { triviaPlayAdvanced, parseAdv, cancelAdvGame, advGameExists };
};
