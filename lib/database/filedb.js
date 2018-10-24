var Database = {};
Database.tokens = [];
var DatabaseInfo = {};

Database.responses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

const fs = require("fs");

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
      var file = fs.readFileSync(path + "/categories.json").toString();

      var json = JSON.parse(file);

      var categoryList = json;
      DatabaseInfo.categoryList = categoryList.trivia_categories;
    }
    catch(err) {
      throw err;
    }

    // ## Global Question Count Lookup ## //
    // TEMPORARY: This is a placeholder solution. Later on we will generate this automatically when parsing questions.
    try {
      var file2 = fs.readFileSync(path + "/global_counts.json").toString();

      var json2 = JSON.parse(file2);

      DatabaseInfo.globalCounts = json2;
    }
    catch(err) {
      throw err;
    }
  }

  Database.getCategories = () => {
    return new Promise((resolve, reject) => {
      if(typeof DatabaseInfo.categoryList === "undefined") {
        updateGlobals()
        .then(() => {
          resolve(DatabaseInfo.categoryList);
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(DatabaseInfo.categoryList);
      }
    });
  };

  Database.getGlobalCounts = () => {
    return new Promise((resolve, reject) => {
      if(typeof DatabaseInfo.globalCounts === "undefined") {
        updateGlobals()
        .then(() => {
          resolve(DatabaseInfo.globalCounts);
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(DatabaseInfo.globalCounts);
      }
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
