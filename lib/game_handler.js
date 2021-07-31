const EventEmitter = require("events");
const Game = require("./game.js");

class GameHandler extends EventEmitter {
  constructor(Trivia) {
    super();
    
    this.Trivia = Trivia;

    this.activeGames = {};
  }

  getActiveGame(id) {
    return this.activeGames[id];
  }

  createGame(GameHandler, channelId, groupID, ownerID, options, gameMode) {
    return new Game(GameHandler, channelId, groupID, ownerID, options, gameMode);
  }
}

module.exports = GameHandler;
