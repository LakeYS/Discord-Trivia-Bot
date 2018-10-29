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

  Database.fetchQuestions = async (options) => {
    if(options.amount > 50) {
      throw new Error("Too many questions requested, amount must be 50 or less.");
    }

    var categories = await Database.getCategories();

    var category;
    var isRandomCategory;
    if(typeof options.category !== "undefined") {
      category = options.category;
    }
    else {
      isRandomCategory = 1;
    }

    var questions = [];
    for(var i = 0; i <= options.amount; i++) {
      if(isRandomCategory) {
        // Pick a random category
        category = Math.floor(Math.random() * Object.values(categories).length);
      }

      try {
        // TODO: Optimize file parsing. Right now we re-parse the files each time we pull a question.
        // It might be best to randomize categories to pick from first, then parse them sequentially.
        var file = fs.readFileSync(path + `/questions_${category}.json`).toString();

        var json = JSON.parse(file);

        var random = Math.random();
        var id = Math.floor(random * Object.values(json)[0].length);
        questions.push(Object.values(json)[0][id]);
      }
      catch(err) {
        throw err;
      }
    }

    return questions;
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
