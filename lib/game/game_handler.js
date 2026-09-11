import EventEmitter from "events";

import Game from "./game.js";
import GameExtensions from "./game_extensions.js";
import HangmanGame from "./game_hangman.js";
import Leaderboard from "./leaderboard.js";

export default class GameHandler extends EventEmitter {
  constructor(Trivia) {
    super();
    
    this.Trivia = Trivia;
    this.leaderboard = new Leaderboard();
    this.extensions = new GameExtensions(Trivia);

    this.activeGames = {};
  }

  getActiveGame(id) {
    return this.activeGames[id];
  }

  getGameCount() {
    return Object.keys(this.activeGames).length;
  }

  dumpGames() {
    return this.activeGames;
  }

  createGame(interactionHelper, GameHandler, channelId, groupID, ownerID, options, gameMode) {
    if(this.getActiveGame(channelId)) {
      throw new Error("Game already exists in channel.");
    }

    if(gameMode === "hangman") {
      var game = new HangmanGame(interactionHelper, GameHandler, channelId, groupID, ownerID, options, gameMode);
      return game;
    }
    else {
      return new Game(interactionHelper, GameHandler, channelId, groupID, ownerID, options, gameMode);
    }
  }
}
