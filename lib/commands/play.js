module.exports = (config, Trivia, prefixStr) => {
  return function (reply, replyDirect, channelId, creatorId, guildId, categoryInput, mode) {
    var game = Trivia.gameHandler.getActiveGame(channelId);

    const onGameStarting = (game) => {
      // In auto-delete mode, reply with an initial message to prevent the "This application did not respond" message when we delete the first message.
      if(game.getConfig("use-slash-commands") && game.getConfig("auto-delete-msgs")) {
        replyDirect("Starting!");
      }
    };

    if(typeof game !== "undefined" && game.inProgress) {
      if(game.getConfig("use-slash-commands")) {
        replyDirect("A game is already running in this channel. Moderators can use /stop to stop it.");
      }
      return;
    }

    if(categoryInput != null && categoryInput !== "PLAY" && categoryInput !== "PLAY HANGMAN") {
      Trivia.database.getCategoryFromStr(categoryInput)
      .then((category) => {
        if(typeof category === "undefined") {
          reply({embed: {
            color: 14164000,
            description: `Unable to find the category you specified.\nType \`${prefixStr}play\` to play in random categories, or type \`${prefixStr}categories\` to see a list of categories.`
          }});
          return;
        }
        else {
          const questionOptions = { category: category.id };
          const game = Trivia.gameHandler.createGame(reply, Trivia.gameHandler, channelId, guildId, creatorId, questionOptions, mode);
          onGameStarting(game);
          game.initializeRound();

          return;
        }
      })
      .catch((err) => {
        reply({embed: {
          color: 14164000,
          description: `Failed to retrieve the category list:\n${err}`
        }});
        console.log(`Failed to retrieve category list:\n${err}`);
        console.log(err.stack);
        return;
      });
    }
    else {
      // No category specified, start a normal game. (The database will pick a random category for us)
      const game = Trivia.gameHandler.createGame(reply, Trivia.gameHandler, channelId, guildId, creatorId, {allowLongAnswers: Trivia.database.allowLongAnswers}, mode);
      onGameStarting(game);
      game.initializeRound();

      return;
    }
  };
};
