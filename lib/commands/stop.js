module.exports = () => {
  return function(reply, replyDirect, game, isAdmin) {
    if(typeof game !== "undefined" && game.inProgress) {
      const getConfig = game.getConfig;
      if(isAdmin) {
        game.endGame("Game ended by admin.");

        if(game.getConfig("use-slash-commands")) {
          replyDirect("Stopping game...");
        }
      }
      else {
        reply(`Trivia games will end automatically if the game is inactive for more than ${getConfig("rounds-end-after")} round${getConfig("rounds-end-after")===1?"":"s"}. Only users with the "Manage Server" permission can force-end a game.`);
      }

      return;
    }
    else {
      replyDirect("There is currently no game active in this channel.");
    }
  };
};
