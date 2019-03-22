var advData = {};
const footerText = "Type 'cancel' to cancel";
const types = { "multiple": 2, "boolean": 3 };
const difficulties = { "easy": 2, "medium": 3, "hard": 4 };

module.exports = (Trivia, client) => {
  var getConfigVal = Trivia.getConfigVal;

  function getAdvStr(identifier, data) {
    switch(identifier) {
      case "mode":
        return `What game mode would you like to play in? Type a number:

        1. Normal
          *A standard four-letter trivia game. Recommended for 1-10 players.*

        2. Reaction mode
          *Use reactions instead of typed answers. Recommended for 10-∞ players.*

        3. Hangman
          *Hangman-styled 'guess the answer' game. Recommended for 1-20 players. #IRC*
          ${getConfigVal("databaseURL")==="https://opentdb.com"?"*(Beware: Some questions from OpenTDB are not designed for hangman-style gameplay)*":""}`;

      case "category":
        return `Type the category you would like to play in. Type "random" or "r" to play in random categories. Type "${getConfigVal("prefix")}categories" to see a list of available categories.`;

      case "type":
        return `What type of questions would you like to play? Type a number:
        **1**. Normal
        **2**. Multiple Choice Only
        **3**. True/False Only`;

      case "difficulty":
        return `What difficulty level would you like to play? Type a number:
        **1**. Normal
        **2**. Easy Only
        **3**. Medium Only
        **4**. Hard Only`;

      case "channel":
        return `What channel should the game start in? Type a channel, for example <#${data}>, or type "here" or "h" to use the current channel.`;
    }
  }

  function advGameExists(id) {
    return typeof advData[id] !== "undefined";
  }

  function cancelAdvGame(id) {
    if(typeof advData[id] !== "undefined") {
      clearTimeout(advData[id].timeout);
    }

    delete advData[id];
  }

  async function startAdvGame(id, author) {
    var onGameStart = advData[id].onGameStart;
    var categoryId = advData[id].categoryId;
    var type = advData[id].type;
    var difficulty = advData[id].difficulty;
    var mode = advData[id].mode;
    var startChannelB = advData[id].startChannel;
    var config = advData[id].config; // Custom config, if any

    var stats = { gamesPlayedAdvanced: 1 };

    if(startChannelB.id !== id) {
      stats["advancedCustomChannelUses"] = 1;
    }

    stats[`advancedModeUses${advData[id].mode}`] = 1;
    stats[`advancedTypeUses${types[advData[id].type] || 1}`] = 1;
    stats[`advancedDifficultyUses${difficulties[advData[id].difficulty] || 1}`] = 1;
    client.shard.send({stats});
    // Need to delete the data before starting so it doesn't auto-cancel.
    cancelAdvGame(id);

    var game = await Trivia.doGame(startChannelB.id, startChannelB, author, 0, config, categoryId, type, difficulty, mode);
    if(typeof onGameStart !== "undefined") {
      onGameStart(game);
    }
  }

  var advActions = {};

  advActions.mode = (id, cmd) => {
    if(cmd === "1") {
      advData[id].mode = 0;
    }
    else if(cmd === "2") {
      advData[id].mode = 1;
    }
    else if(cmd === "3") {
      advData[id].mode = 2;
    }
    else {
      return {
        error: true
      };
    }

    advData[id].pendingMode = false;
    advData[id].pendingCategory = true;

    advData[id].argStr = `${advData[id].argStr} ${advData[id].mode+1}`;

    return {
      text: getAdvStr("category")
    };
  };

  advActions.category = async (id, cmd) => {
    if(cmd !== "RANDOM" && cmd !== "R") {
      var category = await Trivia.getCategoryFromStr(cmd);

      if(typeof category === "undefined") {
        return {
          error: true,
          text: `Unable to identify the category you specified. Please try again, or type '${getConfigVal("prefix")}categories' to see a list of categories.`
        };
      }
      else {
        advData[id].categoryId = category.id;
        advData[id].argStr = `${advData[id].argStr} ${category.name}`;
      }
    }
    else {
      advData[id].argStr = `${advData[id].argStr} r`;
    }

    advData[id].pendingCategory = false;

    if(advData[id].mode === 2) {
      // Skip the prompt for a question type if playing hangman mode.
      advData[id].type = "multiple";
      advData[id].argStr = `${advData[id].argStr} 1`;

      advData[id].pendingDifficulty = true;
      return {
        text: getAdvStr("difficulty")
      };
    }
    else {
      advData[id].pendingType = true;

      return {
        text: getAdvStr("type")
      };
    }
  };

  advActions.type = (id, cmd) => {
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

    advData[id].argStr = `${advData[id].argStr} ${cmd}`;

    advData[id].pendingType = false;
    advData[id].pendingDifficulty = true;

    return {
      text: getAdvStr("difficulty")
    };
  };

  advActions.difficulty = (id, cmd) => {
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

    advData[id].argStr = `${advData[id].argStr} ${cmd}`;

    advData[id].pendingDifficulty = false;
    advData[id].pendingChannel = true;

    return {
      text: getAdvStr("channel", id)
    };
  };

  advActions.channel = (id, cmd, channel) => {
    var startChannel;

    if(typeof cmd !== "string") {
      return {
        error: true
      };
    }

    if(cmd === "HERE" || cmd === "H") {
      startChannel = channel;
    }
    else {
      var idInput = cmd.replace("<#","").replace(">","");
      startChannel = channel.guild.channels.find((obj) => (obj.id === idInput));
    }

    if(startChannel === null) {
      return {
        error: true,
        text: "Unable to find the channel specified. Please try again."
      };
    }
    else {
      advData[id].argStr = `${advData[id].argStr} #${startChannel.name}`;
    }

    advData[id].startChannel = startChannel;

    return {};
  };

  async function parseAdvArgs(channel, author, cmd) {
    // Example input: "1 r 1 1 h"

    client.shard.send({stats: { advancedArgUses: 1 }});

    var args = cmd.split(" ");

    var category = [];

    // If the length of the array is greater than 15, automatically mark as "too many args"
    if(args.length > 15) {
      Trivia.send(channel, author, {embed: {
        color: 14164000,
        description: "Invalid number of arguments. Please try again."
      }});
      return;
    }

    if(args.length > 1) {
      // Separate the category string from the other args.
      category = [];

      var spliceIndex = args.length-1;
      for(var i = 1; i <= args.length-1; i++) {
        // If the next number is reached
        if(!isNaN(args[i])) {
          spliceIndex = i-1;
          break;
        }
        else {
          category.push(args[i]);
        }
      }

      // Remove the string from the args for easier handling.
      args.splice(1, spliceIndex);
    }

    if(category.length === 0) {
      category = "R";
    }
    else {
      category = category.join(" ");
    }

    var index = 0;
    for(var action in advActions) {
      var result;
      // Special handling for category args
      try {
        if(action === "category") {
          result = await advActions[action](channel.id, category);
        }
        else {
          index++;

          result = await advActions[action](channel.id, args[index-1], channel);

          if(result.error) {
            Trivia.send(channel, void 0, {embed: {
              color: 14164000,
              description: result.text || "Invalid input, please try again."
            }});

            cancelAdvGame(channel.id);

            return;
          }
        }
      } catch(err) {
        console.log(`An error occurred while parsing advanced game args:\n${err.stack}`);
      }
    }

    Trivia.send(channel, void 0, `Starting game in <#${advData[channel.id].startChannel.id}>...`, void 0, true);

    await startAdvGame(channel.id, author);

    return;
  }

  function triviaPlayAdvanced(onGameStart, id, channel, author, cmd, customArgStr, config) {
    if(typeof advData[id] === "undefined") {

      advData[id] = { user: author.id, pendingMode: true, onGameStart, config };

      if(typeof customArgStr === "undefined") {
        advData[id].argStr = `${getConfigVal("prefix", id)}play advanced`;
      }
      else {
        advData[id].argStr = customArgStr;
      }

      if(cmd !== "" && typeof cmd !== "undefined") {
        parseAdvArgs(channel, author, cmd.replace(" ", ""));
        return;
      }

      Trivia.send(channel, author, {embed: {
        color: Trivia.embedCol,
        title: "Game Setup",
        description: getAdvStr("mode"),
        footer: { text: footerText }
      }}, (msg, err) => {
        if(err) {
          // Cancel everything if the first message fails to send
          cancelAdvGame(id);
          return;
        }
      }, true);

      // Set a timer
      advData[id].timeout = setTimeout(() => {
        cancelAdvGame(id);
        Trivia.send(channel, author, "Advanced game cancelled due to inactivity.");
      }, 25000);
    }
  }
  async function doAdvAction(id, msg, cmd) {
    if(msg.author.id !== advData[id].user) {
      return;
    }

    advData[id].timeout.refresh(); // Keep the timer alive for another 15 seconds.

    if(cmd === "CANCEL") {
      cancelAdvGame(id);
      Trivia.send(msg.channel, void 0, "Game cancelled.", void 0, true);
      return;
    }

    if(advData[id].pendingMode) {
      return advActions.mode(id, cmd);
    }
    else if(advData[id].pendingCategory) {
      return await advActions.category(id, cmd);
    }
    else if(advData[id].pendingType) {
      return advActions.type(id, cmd);
    }
    else if(advData[id].pendingDifficulty) {
      return advActions.difficulty(id, cmd);
    }
    else if(advData[id].pendingChannel) {
      var channelResult = advActions.channel(id, cmd, msg.channel);

      if(channelResult.error) {
        return channelResult;
      }
    }

    Trivia.send(msg.channel, void 0, {embed: {
      color: Trivia.embedCol,
      description: `Starting game in <#${advData[id].startChannel.id}>...`,
      footer: { text: `To repeat this configuration, use the command "${advData[id].argStr}"` }
    }}, void 0, true);

    await startAdvGame(id, msg.author);
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

      var footerLocal = footerText;

      if(advData[id].argStr !== "") {
        footerLocal = `${footerLocal} • ${advData[id].argStr}`;
      }

      if(typeof response.text !== "undefined") {
        Trivia.send(msg.channel, void 0, {embed: {
          color: responseCol,
          title: "Game Setup",
          description: response.text,
          footer: { text: footerLocal }
        }}, void 0, true);
      }

      return response;
    });
  }

  return { triviaPlayAdvanced, parseAdv, cancelAdvGame, advGameExists };
};
