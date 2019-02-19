module.exports = (config, Trivia, commands, getConfigVal) => {
  return function(msg, cmd, isAdmin) {
    var game = Trivia.getGame();
    var stopChannel = msg.channel;

    // advGameExists (function)
    var advGameExists = commands.playAdv.advGameExists;

    if(isAdmin) {
      var channelInput = cmd.replace("STOP ","");

      if(channelInput !== "STOP") {
        var idInput = channelInput.replace("<#","").replace(">","");
        stopChannel = msg.guild.channels.find((obj) => (obj.id === idInput));

        if(stopChannel === null) {
          Trivia.send(msg.channel, msg.author, `Could not find that channel. Check input and try again. (Example: <#${msg.channel.id}>)`);
          return;
        }
        else if(typeof game[stopChannel.id] === "undefined" && !advGameExists(stopChannel.id)) {
          Trivia.send(msg.channel, msg.author, "There is no game running in that channel.");
          return;
        }
        else {
          Trivia.send(msg.channel, msg.author, `Stopping game in channel <#${stopChannel.id}>`);
          // No return here, need to actually stop the game below.
        }
      }
    }

    if(isAdmin && advGameExists(stopChannel.id)) {
      commands.playAdv.cancelAdvGame(stopChannel.id);
      Trivia.send(stopChannel, void 0, "Game cancelled.");

      return;
    }

    if(typeof game[stopChannel.id] !== "undefined" && game[stopChannel.id].inProgress) {
      if(isAdmin) {
        Trivia.stopGame(stopChannel);
      }
      else {
        Trivia.send(msg.channel, void 0, `Trivia games will end automatically if the game is inactive for more than ${getConfigVal("rounds-end-after", msg.channel)-1} round${getConfigVal("rounds-end-after", msg.channel)-1===1?"":"s"}. Only users with the "Manage Server" permission can force-end a game.`);
      }

      return;
    }
  };
};
