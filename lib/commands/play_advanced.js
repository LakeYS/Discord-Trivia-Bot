const footerText = "Type 'cancel' to cancel";
const types = { "multiple": 2, "boolean": 3 };
const difficulties = { "easy": 2, "medium": 3, "hard": 4 };
var advData = {};

module.exports = (Trivia) => {
  function getConfig(value, channel, guild) {
    return Trivia.getConfig(value, channel, guild);
  }

  function getAdvStr(identifier, data) {
    switch(identifier) {
      case "mode":
        return `What game mode would you like to play in? Type a number:

        1. Normal
          *A standard four-letter trivia game.*

        2. Typed answer (classic)
          *Classic mode. Type your answers instead of using buttons.*

        3. Reaction mode
          *Use reactions to keep score!*

        4. Hangman
          *Hangman-styled 'guess the answer' game. #IRC*
          ${getConfig("databaseURL")==="https://opentdb.com"?"*(Beware: Some questions from OpenTDB are not designed for hangman-style gameplay)*":""}`;

      case "category":
        return `Type the category you would like to play in. Type "random" or "r" to play in random categories. Type "${getConfig("prefix")}categories" to see a list of available categories.`;

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

    var stats = { gamesPlayedAdvanced: 1 };

    if(startChannelB.id !== id) {
      stats["advancedCustomChannelUses"] = 1;
    }

    Trivia.postStat(`advancedModeUses${advData[id].mode}`, 1);
    Trivia.postStat(`advancedTypeUses${types[advData[id].type] || 1}`, 1);
    Trivia.postStat(`advancedDifficultyUses${difficulties[advData[id].difficulty] || 1}`, 1);
    // Need to delete the data before starting so it doesn't auto-cancel.
    cancelAdvGame(id);

    var question = {
      category: categoryId,
      type, 
      difficulty
    };

    var game = Trivia.gameHandler.createGame(Trivia.gameHandler, startChannelB.id, startChannelB.guild.id, author.id, question, mode).initializeRound();
    if(typeof onGameStart !== "undefined") {
      onGameStart(game);
    }
  }

  var advActions = {};

  advActions.mode = (id, cmd) => {
    switch(cmd) {
      case "1":
        advData[id].mode = "standard";
        break;
      case "2":
        advData[id].mode = "typed";
        break;
      case "3":
        advData[id].mode = "reaction";
        break;
      case "4":
        advData[id].mode = "hangman";
        break;

    }

    advData[id].pendingMode = false;
    advData[id].pendingCategory = true;

    advData[id].argStr = `${advData[id].argStr} ${advData[id].mode+2}`;

    return {
      text: getAdvStr("category")
    };
  };

  advActions.category = async (id, cmd) => {
    if(cmd !== "RANDOM" && cmd !== "R") {
      var category = await Trivia.database.getCategoryFromStr(cmd);

      if(typeof category === "undefined") {
        return {
          error: true,
          text: `Unable to identify the category you specified. Please try again, or type '${getConfig("prefix")}categories' to see a list of categories.`
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

    if(advData[id].mode === "hangman") {
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
    var isDMChannel = channel.type === "DM";

    if(typeof cmd !== "string") {
      return {
        error: true
      };
    }

    if(cmd === "HERE" || cmd === "H" || isDMChannel) {
      startChannel = channel;
    }
    else {
      var idInput = cmd.replace("<#","").replace(">","");
      startChannel = channel.guild.channels.cache.find((obj) => (obj.id === idInput));
    }

    if(startChannel === null || typeof startChannel === "undefined") {
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

    Trivia.postStat("advancedArgUses", 1);

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
    // Initialize an empty config object if there is none.
    config = config || {};

    if(typeof advData[id] === "undefined") {

      advData[id] = { user: author.id, pendingMode: true, onGameStart, config };

      if(typeof customArgStr === "undefined") {
        advData[id].argStr = `${getConfig("prefix", id)}play advanced`;
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
      }}, true)
      .catch(() => {
        // Cancel everything if the first message fails to send
        cancelAdvGame(id);
        return;
      })
      .then(() => {
        // Set a timer
        if(!getConfig("debug-mode")) {
          advData[id].timeout = setTimeout(() => {
            cancelAdvGame(id);
            Trivia.send(channel, author, "Advanced game cancelled due to inactivity.");
          }, 25000);
        }
      });
    }
  }
  async function doAdvAction(id, msg, cmd, userIsAdmin) {
    var userIsStarter = msg.author.id === advData[id].user;

    if(cmd === "CANCEL" && (userIsStarter || userIsAdmin)) {
      cancelAdvGame(id);
      Trivia.send(msg.channel, void 0, "Game setup cancelled.", void 0, true);
      return;
    }

    // Only the user that initiated the game can pass input
    if(!userIsStarter && !userIsAdmin) {
      return;
    }

    // Check for a timer in case debug mode is active
    if(typeof advData[id].timeout !== "undefined") {
      advData[id].timeout.refresh(); // Keep the timer alive for another 15 seconds.
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
      footer: { text: `To repeat this configuration, use the command: ${advData[id].argStr}` }
    }}, void 0, true);

    await startAdvGame(id, msg.author);
  }

  async function parseAdv(id, msg, isAdmin) {
    // Do absolutely nothing if there's no advanced game.
    // Beware that this check occurs for every message sent in each channel.
    if(!advData[id]) {
      return -1;
    }

    var cmd = msg.toString().toUpperCase();
    var prefix = getConfig("prefix", id).toUpperCase();

    // Ignore if the input is a command of any kind
    if(cmd.startsWith(prefix)) {
      return;
    }

    doAdvAction(id, msg, cmd, isAdmin)
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
