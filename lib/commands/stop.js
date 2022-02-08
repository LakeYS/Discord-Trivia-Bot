module.exports = (config, Trivia) => {
  return function(msg, cmd, isAdmin) {
    var game = Trivia.gameHandler.getActiveGame(msg.channel.id);
    var stopChannel = msg.channel;

    // advGameExists (function)
    var advGameExists = Trivia.commands.playAdv.advGameExists;

    // Functions for admins
    if(isAdmin) {
      // Cancel advanced game setup if there is one
      if(advGameExists(stopChannel.id)) {
        Trivia.commands.playAdv.cancelAdvGame(stopChannel.id);
        Trivia.send(stopChannel, void 0, "Game setup cancelled.");
  
        return;
      }

      // Check if the input is for another channel.
      var channelInput = cmd.replace("STOP ","");
      if(channelInput !== "STOP") {
        var idInput = channelInput.replace("<#","").replace(">","");
        stopChannel = msg.guild.channels.cache.find((obj) => (obj.id === idInput));
        game = Trivia.gameHandler.getActiveGame(stopChannel.id);

        if(stopChannel === null || typeof stopChannel === "undefined") {
          Trivia.send(msg.channel, msg.author, `Could not find that channel. Check input and try again. (Example: <#${msg.channel.id}>)`);
          return;
        }
        else if(typeof game === "undefined" && !advGameExists(stopChannel.id)) {
          Trivia.send(msg.channel, msg.author, "There is no game running in that channel.");
          return;
        }
        else {
          Trivia.send(msg.channel, msg.author, `Stopping game in channel <#${stopChannel.id}>`);
          // No return here, need to actually stop the game below.
        }
      }
    }

    if(typeof game !== "undefined" && game.inProgress) {
      if(isAdmin) {
        game.endGame();
      }
      else {
        Trivia.send(msg.channel, void 0, `Trivia games will end automatically if the game is inactive for more than ${Trivia.getConfig("rounds-end-after", msg.channel)} round${Trivia.getConfig("rounds-end-after", msg.channel)===1?"":"s"}. Only users with the "Manage Server" permission can force-end a game.`);
      }

      return;
    }
  };
};
