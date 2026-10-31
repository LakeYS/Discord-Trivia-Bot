export default (config, Trivia, prefixStr) => {
  return async function (interactionHelper, channelId, creatorId, guildId, categoryInput, mode) {
    var game = Trivia.gameHandler.getActiveGame(channelId);

    const onGameStarting = async (game) => {
      // In auto-delete mode, reply with an initial message to prevent the "This application did not respond" message when we delete the first message.
      if(game.getConfig("use-slash-commands") && game.getConfig("auto-delete-msgs")) {
        await interactionHelper.maybeReply("Starting!", {direct: true});
      }
    };

    if(typeof game !== "undefined" && game.inProgress) {
      if(game.getConfig("use-slash-commands")) {
        await interactionHelper.maybeReply("A game is already running in this channel. Moderators can use /stop to stop it.", {direct: true});
      }
      return;
    }

    if(categoryInput != null && categoryInput !== "PLAY" && categoryInput !== "PLAY HANGMAN") {
      Trivia.database.getCategoryFromStr(categoryInput)
      .then(async (category) => {
        if(typeof category === "undefined") {
          await interactionHelper.maybeReply({embed: {
            color: 14164000,
            description: `Unable to find the category you specified.\nType \`${prefixStr}play\` to play in random categories, or type \`${prefixStr}categories\` to see a list of categories.`
          }});
          return;
        }
        else {
          const questionOptions = { category: category.id };
          const game = Trivia.gameHandler.createGame(interactionHelper, Trivia.gameHandler, channelId, guildId, creatorId, questionOptions, mode);
          await onGameStarting(game);
          game.initializeRound();

          return;
        }
      })
      .catch(async (err) => {
        await interactionHelper.maybeReply({embed: {
          color: 14164000,
          description: "Failed to retrieve the category list: An internal " +
          "error occurred."
        }});
        console.log(`Failed to retrieve category list:\n${err}`);
        console.log(err.stack);
        return;
      });
    }
    else {
      // No category specified, start a normal game. (The database will pick a random category for us)
      const game = Trivia.gameHandler.createGame(interactionHelper, Trivia.gameHandler, channelId, guildId, creatorId, {}, mode);
      onGameStarting(game);
      game.initializeRound();

      return;
    }
  };
};
