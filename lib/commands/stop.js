module.exports = () => {
  return function(interactionHelper, game, isAdmin) {
    if(typeof game !== "undefined" && game.inProgress) {
      const getConfig = game.getConfig;
      if(isAdmin) {
        game.endGame("Game ended by admin.");

        if(game.getConfig("use-slash-commands")) {
          interactionHelper.maybeReply("Stopping game...", {direct: true});
        }
      }
      else {
        interactionHelper.maybeReply({content: `Trivia games will end automatically if the game is inactive for more than ${getConfig("rounds-end-after")} round${getConfig("rounds-end-after")===1?"":"s"}. Only users with the "Manage Server" permission can force-end a game.` });
      }

      return;
    }
    else {
      interactionHelper.maybeReply("There is currently no game active in this channel.");
    }
  };
};
