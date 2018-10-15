var Database = {};
Database.tokens = [];
var DatabaseInfo = {};

Database.responses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

module.exports = (input) => {
  var config = input;

  var path = config.databaseURL.replace("file://", "");
  path;

  // # Globals # //
  async function updateGlobals(doTimeout) {
    // Global information updates every 4 hours
    if(doTimeout) {
      Database.globalsTimeout = setTimeout(() => {
        updateGlobals(1);
      }, 1.44e+7);
    }

    // ## Category lookup ## //
    try {
      var categoryList = { trivia_categories: "" };
      Database.categoryList = categoryList.trivia_categories;
    }
    catch(err) {
      throw err;
    }

    // ## Global Question Count Lookup ## //
    try {
      DatabaseInfo.globalCounts = {};
    }
    catch(err) {
      throw err;
    }
  }

  Database.getCategories = () => {
    return new Promise((resolve) => {
      resolve();
    });
  };

  Database.getGlobalCounts = () => {
    return new Promise((resolve) => {
      resolve();
    });
  };

  // getTriviaToken
  // Returns a promise, fetches a token for the specified discord.js TextChannel object.
  // If no token exists, one will be requested from OpenTDB.
  // If tokenChannelID is undefined, the promise will automatically resolve with 'undefined'.
  Database.getTokenByIdentifier = (tokenChannelID) =>  {
    return new Promise((resolve) => {
      tokenChannelID;
      resolve();
    });
  };

  // resetTriviaToken
  Database.resetToken = (token) => {
    return new Promise((resolve) => {
      token;

      resolve();
    });
  };

  Database.fetchQuestions = (options) => {
    return new Promise((resolve) => {
      options;

      // PLaceholder question so "trivia play" does not freeze the game data.
      resolve([
        { "category":"Mysterious Non-Existent Category",
          "type":"boolean",
          "difficulty":"medium",
          "question":"This is a test question.",
          "correct_answer":"True",
          "incorrect_answers":["False"]
        } ]);
    });
  };

  Database.destroy = () => {
    delete DatabaseInfo.categoryList;
    delete DatabaseInfo.globalCounts;

    clearTimeout(DatabaseInfo.globalsTimeout);
  };

  // # Initialize Globals # //
  updateGlobals(1)
  .catch((err) => {
    if(err) {
      console.error("Error occurred while attempting to initialize globals: " + err);
    }
  });

  return Database;
};
