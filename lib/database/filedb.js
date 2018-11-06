// TODO: Failover integration for tokens.
// TODO: Fix reload when requesting category list

const crypto = require("crypto");

var Database = {};
Database.tokens = [];
var DatabaseInfo = { tokens: { } };

Database.responses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

const fs = require("fs");

module.exports = (input) => {
  var config = input;

  var path = config.databaseURL.replace("file://", "");
  path;

  // # Globals # //
  async function updateGlobals() {
    var loadBefore = Date.now();

    // ## Category lookup ## //
    try {
      var listFile = fs.readFileSync(path + "/categories.json").toString();

      var listJSON = JSON.parse(listFile);

      var categoryList = listJSON;
      DatabaseInfo.categoryList = categoryList.trivia_categories;
    }
    catch(err) {
      throw err;
    }

    // ## Global Question Count Lookup ## //
    var questionPool, categoryFile, questionTotal = 0;
    try {
      DatabaseInfo.globalCounts = { categories: {} };
      for(var i in DatabaseInfo.categoryList) {
        // Normally a try statement would be used here, but we're already in one (See above)
        categoryFile = fs.readFileSync(path + `/questions_${DatabaseInfo.categoryList[i].id}.json`).toString();
        questionPool = JSON.parse(categoryFile);

        DatabaseInfo.globalCounts.categories[DatabaseInfo.categoryList[i].id] = {
          "total_num_of_questions": questionPool.questions.length,
          "total_num_of_verified_questions": questionPool.questions.length
        };

        questionTotal += questionPool.questions.length;

        // TODO: Check questions for errors? This would slow down init but prevent problems later.
        //for(var i2 in questionPool.questions) {
        //}
      }

      DatabaseInfo.globalCounts.overall = {
        "total_num_of_questions": questionTotal,
        "total_num_of_verified_questions": questionTotal
      };
    }
    catch(err) {
      throw err;
    }
    finally {
      var loadAfter = Date.now();
      console.info(`File database '${path}' loaded. Parsed ${questionTotal} questions in ${loadAfter-loadBefore}ms.`);
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

  // # Token Functions # //
  async function validateToken(token) {
    var type = typeof token;
    if(type !== "string") {
      throw new Error(`Expected token to be a string, received '${type}'`);
    }

    if(typeof DatabaseInfo.tokens[token] === "undefined") {
      throw new Error("Invalid or non-existent token.");
    }

    return token;
  }

  // getTokenByIdentifier
  // Returns a promise, fetches a token for the specified discord.js TextChannel object.
  // If no token exists, one will be requested from OpenTDB.
  // If tokenChannelID is undefined, the promise will automatically resolve with 'undefined'.
  // TODO: Refactor so this doesn't require an identifier.
  Database.getTokenByIdentifier = (tokenChannelID) =>  {
    return new Promise((resolve) => {
      if(typeof tokenChannelID === "undefined") {
        // No token requested, return without one.
        resolve(void 0);
        return;
      }
      else if(typeof Database.tokens[tokenChannelID] !== "undefined") {
        // Check if 6 hours have passed since the token was created.
        // If >6 hours have passed, we'll need to generate a new one.
        if(new Date().getTime() > Database.tokens[tokenChannelID].time.getTime()+2.16e+7) {
          // Token already exists but is expired, delete it and generate a new one.
          var token = Database.tokens[tokenChannelID];
          delete Database.tokens[tokenChannelID];
          delete DatabaseInfo.tokens[token];
        }
        else {
          // Token already exists and is valid, return it and continue.
          resolve(Database.tokens[tokenChannelID].token);
          return;
        }
      }

      // Generate a token
      let newToken;
      crypto.randomBytes(32, (err, buffer) => {
        newToken = buffer.toString("hex");

        DatabaseInfo.tokens[newToken] = { time: new Date() };

        Database.tokens[tokenChannelID] = { token: newToken, time: DatabaseInfo.tokens[newToken].time };
        //reject(new Error("Tokens are currently not suported."));
        resolve(newToken);
      });
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

    var token = options.token;
    if(typeof token !== "undefined") {
      token = await validateToken(token);
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
    let randomID, question, categoryName;
    for(var i = 0; i <= options.amount; i++) {
      if(isRandomCategory) {
        // Pick a random category
        randomID = Math.floor(Math.random() * Object.values(categories).length);
        category = categories[randomID].id;
        categoryName = categories[randomID].name;
      }
      else {
        categoryName = categories[category].name;
      }

      try {
        // TODO: Optimize file parsing. Right now we re-parse the files each time we pull a question.
        // It might be best to randomize categories to pick from first, then parse them sequentially.
        var file = fs.readFileSync(path + `/questions_${category}.json`).toString();

        var json = JSON.parse(file);

        // Pick a random question. ID being the sequential number of a question, starting at 0.
        var random = Math.random();
        var id = Math.floor(random * Object.values(json)[0].length);

        // Get the question using the random ID we just picked.
        question = Object.values(json)[0][id];

        // Add additional information based on the question.
        question.category = categoryName;
        if(question.incorrect_answers.length === 1) {
          question.type = "boolean";
        }
        else {
          question.type = "multiple";
        }

        // Add it to the question pool for export.
        questions.push(question);
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
      console.error("Error occurred while attempting to initialize globals: ");
      console.error(err);

      // Treat this as a fatal exception since file database errors are more severe.
      process.exit(1);
    }
  });

  return Database;
};
