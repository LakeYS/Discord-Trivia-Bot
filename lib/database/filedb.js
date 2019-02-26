// TODO: Failover integration for tokens.
// TODO: Fix reload when requesting category list
// TODO: Token support for random category queries

const crypto = require("crypto");
const types = { 1: "boolean", 3: "multiple" };
const difficulties = [ "easy", "medium", "hard" ];

var Database = {};
Database.tokens = [];
var DatabaseInfo = { tokens: { } };

// The "master question pool" is a somewhat hacky solution to the tricky issue of random question queries.
var MasterQuestionPool = { questions: [] };
// All categories are internally combined into a "master category" that is used when the bot queries for
// random categories.
// While slightly less efficient, this is a much cleaner solution to consistently return random questions
// from random categories.

Database.responses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

const fs = require("fs");
const yaml = require("js-yaml");

module.exports = (input) => {
  var config = input;

  var path = config.databaseURL.replace("file://", "");
  path;

  // # Globals # //
  async function updateGlobals() {
    var loadBefore = Date.now();

    // ## Category lookup ## //
    try {
      var categoryList = yaml.safeLoad(fs.readFileSync(path + "/categories.yml").toString());
      DatabaseInfo.categoryList = categoryList.trivia_categories;
    }
    catch(err) {
      console.log("Error attempting to parse category file");
      throw err;
    }

    // ## Global Question Count Lookup ## //
    var questionPool, questionTotal = 0, i = 0;
    try {
      DatabaseInfo.globalCounts = { categories: {} };
      var question, newMasterIndex;
      var newMasterPool = { questions: [] };
      for(i in DatabaseInfo.categoryList) {

        // Normally a try statement would be used here, but we're already in one (See above)
        questionPool = yaml.safeLoad(fs.readFileSync(path + `/questions_${DatabaseInfo.categoryList[i].id}.yml`).toString());

        DatabaseInfo.globalCounts.categories[DatabaseInfo.categoryList[i].id] = {
          "total_num_of_questions": questionPool.questions.length,
          "total_num_of_verified_questions": questionPool.questions.length
        };

        questionTotal += questionPool.questions.length;

        for(var i2 in questionPool.questions) {
          question = questionPool.questions[i2];
          // ## Check for Errors ## //
          // Check questions for known errors to display more intuitive messages.

          if(question.incorrect_answers.length !== 1 && question.incorrect_answers.length !== 3) {
            throw new Error(`Invalid number of answers for the question "${question.question}"`);
          }

          if(typeof question.difficulty !== "string" || !difficulties.includes(question.difficulty)) {
            throw new Error(`Invalid difficulty value "${question.difficulty}" for the question "${question.question}".`);
          }

          // ## Indexing ## //

          // Give the question a unique ID based on its sequential order.
          question.id = newMasterPool.questions.length;

          // Index the question so it can be easily pulled for random category queries.
          newMasterIndex = newMasterPool.questions.push(question);

          // Append the category so we don't need some form of witchcraft to re-aquire it.
          newMasterPool.questions[newMasterIndex-1].categoryName = DatabaseInfo.categoryList[i].name;
        }
      }

      DatabaseInfo.globalCounts.overall = {
        "total_num_of_questions": questionTotal,
        "total_num_of_verified_questions": questionTotal
      };

      // If everything went through correctly, pass the question pool through.
      MasterQuestionPool = newMasterPool;
    }
    catch(err) {
      console.log(`Failed to parse file 'questions_${DatabaseInfo.categoryList[i].id}.yml' while updating globals`);
      throw err;
    }

    var loadAfter = Date.now();
    console.info(`File database '${path}' loaded. Parsed ${questionTotal} questions in ${loadAfter-loadBefore}ms.`);
  }

  Database.getCategories = () => {
    return new Promise((resolve, reject) => {
      if(typeof DatabaseInfo.categoryList === "undefined") {
        updateGlobals()
        .then(() => {
          resolve(Object.assign([], DatabaseInfo.categoryList));
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(Object.assign([], DatabaseInfo.categoryList));
      }
    });
  };

  Database.getGlobalCounts = () => {
    return new Promise((resolve, reject) => {
      if(typeof DatabaseInfo.globalCounts === "undefined") {
        updateGlobals()
        .then(() => {
          resolve(Object.assign({}, DatabaseInfo.globalCounts));
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(Object.assign({}, DatabaseInfo.globalCounts));
      }
    });
  };

  // # Token Functions # //
  // The way tokens currently work is by storing a unique identifier for each question pulled using that token.
  // The question is then excluded from the question pool when fetching new random questions.
  // If the entire question pool has been pulled, error code 4 will be returned.

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

        DatabaseInfo.tokens[newToken] = { time: new Date(), random: [] };

        Database.tokens[tokenChannelID] = { token: newToken, time: DatabaseInfo.tokens[newToken].time };
        //reject(new Error("Tokens are currently not suported."));
        resolve(newToken);
      });
    });
  };

  // resetTriviaToken
  Database.resetToken = (token) => {
    return new Promise((resolve) => {
      resolve(Object.assign({}, DatabaseInfo.tokens[token] = { time: new Date(), random: [] }));
    });
  };

  Database.fetchQuestions = async (options) => {
    if(options.amount > 50) {
      throw new Error("Too many questions requested, amount must be 50 or less.");
    }

    var tBefore;
    if(config["debug-log"]) {
      tBefore = Date.now();
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

    // Do we need a token? If so, validate and process it.
    var token = options.token;
    var exclusionArray;
    if(typeof token !== "undefined") {

      // WARNING: It is important that validation is not skipped for security purposes.
      token = await validateToken(token);
    }

    var questions = [];
    let categoryIndex, question, categoryName;
    for(var i = 0; i <= options.amount-1; i++) {
      if(!isRandomCategory) {
        // Get the index of the existing category.
        categoryIndex = categories.findIndex((index) => {
          return index.id === category;
        });

        if(categoryIndex === -1) {
          var error2 = new Error(`Unable to identify category index '${category}'.`);
          error2.code = 1; // Equivalent to the code OpenTDB returns when using an invalid category.

          throw error2;
        }

        categoryName = categories[categoryIndex].name;
      }

      try {
        var exclusionPool;
        if(!isRandomCategory) {
          exclusionPool = yaml.safeLoad(fs.readFileSync(path + `/questions_${category}.yml`).toString()).questions;
        }
        else {
          exclusionPool = JSON.parse(JSON.stringify(MasterQuestionPool)).questions;
        }

        if(typeof token !== "undefined") {
          // Get the question exclusion array based on our token and whether we're in a random category or not.
          // The array is copied to avoid unexpected modifications to the original data.
          // TODO: Fix this so running questions in a specific category excludes it from random?
          if(isRandomCategory) {
            exclusionArray = JSON.parse(JSON.stringify(DatabaseInfo.tokens[token].random || []));
          }
          else {
            exclusionArray = JSON.parse(JSON.stringify(DatabaseInfo.tokens[token][category] || []));
          }

          var erBefore;
          if(config["debug-log"]) {
            erBefore = Date.now();
          }

          var length = exclusionPool.length;

          // Prep to filter the question pool based on type and difficulty parameters.
          if(typeof options.type !== "undefined" || typeof options.difficulty !== "undefined") {
            exclusionPool.forEach((el) => {
              el.type = types[el.incorrect_answers.length];

              if(typeof options.difficulty !== "undefined" && el.difficulty !== options.difficulty) {
                exclusionArray.push(el.id);
              }
              else if(typeof options.type !== "undefined" && el.type !== options.type) {
                exclusionArray.push(el.id);
              }
            });
          }

          // Cache the IDs in a third array so they can be referenced without a nested loop.
          var exclusionPoolCache = [];
          exclusionPool.forEach((el) => {
            exclusionPoolCache.push(el.id);
          });

          for(var iB in exclusionArray) {
            // Match the ID in the array to an ID in the exclusion pool.
            // In order to filter/splice the questions correctly, We will need to acquire the
            // "exclusion ID", or the index of the question in the cache during and after splicing.
            var exclusionID = exclusionPoolCache.indexOf(exclusionArray[iB]);

            var result = exclusionPool.splice(exclusionID, 1);
            var resultB = exclusionPoolCache.splice(exclusionID, 1); // Keep the cache in sync

            // If the splice doesn't echo the question back, something has gone horribly wrong.
            if(result.length === 0 || resultB.length === 0) {
              throw new Error(`Failed to process question pool at index ${iB}/${length}`);
            }
          }

          if(config["debug-log"]) {
            var erAfter = Date.now();
            console.log(`Spliced ${exclusionArray.length} questions of ${length} with remainder ${exclusionPool.length} in ${erAfter-erBefore}ms`);
          }

          // If that empties our output, we're out of questions.
          if(exclusionPool.length === 0) {
            // Respond with hardcoded error code 4 (Token empty)
            // Doing so allows for special handling of the issue (Such as automatically resetting, etc)
            var error = new Error(Database.responses[4]);
            error.code = 4;

            throw error;
          }
        }

        // Pick a random question. ID being the sequential number of a question, starting at 0.
        // A random question is pulled using the exclusion array. Note that exclusion ID != question ID.
        var random = Math.random();
        var randomID = Math.floor(random * Object.values(exclusionPool).length);

        // Get the question using the random ID we just picked.
        question = Object.values(exclusionPool)[randomID];

        if(isRandomCategory) {
          categoryName = question.categoryName;
        }

        // Add additional information based on the question.
        question.category = categoryName;
        question.type = types[question.incorrect_answers.length];

        // Add it to the question pool for export.
        questions.push(question);

        // ## Token Handling ## //
        if(typeof token !== "undefined") {
          if(isRandomCategory) {
            // We're in a random category, so log questions under "random"
            DatabaseInfo.tokens[token].random.push(question.id);
          }
          else {
            // Initialize thet category if necessary.
            if(typeof DatabaseInfo.tokens[token][category] === "undefined") {
              DatabaseInfo.tokens[token][category] = [];
            }

            // Log the question ID for this category.
            // If the system is doing its job correctly, there will never be a duplicate pushed.
            DatabaseInfo.tokens[token][category].push(question.id);
          }
        }
      }
      catch(err) {
        // Log the error unless it is a token empty error.
        if(err.code !== 4) {
          console.log(`Failed to parse ${isRandomCategory?"question from master pool":`'file questions_${category}.yml'`} with error '${err.message}'`);
          console.log(category);
        }

        throw err;
      }
    }

    if(config["debug-log"]) {
      var tAfter = Date.now();
      console.log(`File DB fetched ${questions.length} question(s) in ${tAfter-tBefore}ms.`);
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
      console.error(err.stack);

      // Treat this as a fatal exception since file database errors are more severe.
      Database.destroy();
      Database.error = 1;
      global.client.shard.send({evalStr: "process.exit();"});
    }
  });

  return Database;
};
