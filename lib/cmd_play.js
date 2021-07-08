module.exports = (config, Trivia, commands, getConfigVal) => {
  return function (msg, categoryInput) {
    var game = Trivia.gameHandler.getActiveGame(msg.id);

    if(typeof game !== "undefined" && game.inProgress) {
      return;
    }

    if(categoryInput !== "PLAY") {
      Trivia.getCategoryFromStr(categoryInput)
      .then((category) => {
        if(typeof category === "undefined") {
          Trivia.send(msg.channel, msg.author, {embed: {
            color: 14164000,
            description: `Unable to find the category you specified.\nType \`${getConfigVal("prefix")}play\` to play in random categories, or type \`${getConfigVal("prefix")}categories\` to see a list of categories.`
          }});
          return;
        }
        else {
          Trivia.doGame(msg.channel.id, msg.channel, msg.author, 0, {}, category.id);
          return;
        }
      })
      .catch((err) => {
        Trivia.send(msg.channel, msg.author, {embed: {
          color: 14164000,
          description: `Failed to retrieve the category list:\n${err}`
        }});
        console.log(`Failed to retrieve category list:\n${err}`);
        return;
      });
    }
    else {
      // No category specified, start a normal game. (The database will pick a random category for us)
      Trivia.doGame(msg.channel.id, msg.channel, msg.author, 0, {});
      return;
    }
  };
};
