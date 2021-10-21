const names = [ "James", "Mary", "Robert", "Patricia" ];

class GameDebugger {
  constructor(game) {
    this.game = game;

    this.testUsers = {};
  }

  createTestUsers(count) {
    for(var i = 0; i <= count; i++) {
      // names + (random 6 digit num)
      var username = `${names[Math.floor(Math.random() * 3)]}${Math.floor(Math.random() * 1000)}`;
      // random 18 digit num
      var userId = Math.floor(Math.random() * (999999999999999999 - 100000000000000000) + 100000000000000000);

      this.testUsers[userId] = username;
    }
  }

  runTestUsers() {
    for(var userId in this.testUsers) {
      // true/false
      var isCorrect = Math.round(Math.random());

      this.game.submitAnswer(userId, this.testUsers[userId], isCorrect);
    }
  }
}

module.exports = GameDebugger;