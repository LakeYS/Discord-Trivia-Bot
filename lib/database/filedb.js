const crypto = require("crypto");
const Database = require("./database.js");
const fs = require("fs");
const yaml = require("js-yaml");
const util = require("util");

var randomBytes = util.promisify(crypto.randomBytes);

class FileDB extends Database {
  constructor(path, allowLongAnswers) {
    super();

    // The "master question pool" is a somewhat hacky solution to the tricky issue of random question queries.
    this.masterQuestionPool = { questions: [] };

    if(typeof allowLongAnswers === "undefined") {
      this.allowLongAnswers = false;
    }
    else {
      this.allowLongAnswers = allowLongAnswers;
    }
    
    // All categories are internally combined into a "master category" that is used when the bot queries for random categories.
    // While slightly less efficient, this is a much cleaner solution to consistently return random questions from random categories.

    this.path = path.replace("file://", "");
  }

  parseCategories() {
    try {
      var categoryFile = yaml.safeLoad(fs.readFileSync(this.path + "/categories.yml").toString());
      var categoryList = categoryFile.trivia_categories;

      // ## Category Validation ## //
      var ids = [];
      for(var i in categoryList) {
        var id = categoryList[i].id;
        if(ids.includes(id)) {
          throw new Error("The category ID " + id + " is used more than once in the categories.yml file");
        }

        ids.push(categoryList[i].id);
      }


      return categoryList;
    }
    catch(err) {
      console.log("Error attempting to parse category file");
      throw err;
    }
  }

  validateQuestion(question) {
    // Invalid correct_answer
    if(typeof question.correct_answer !== "string" || question.correct_answer === null) {
      throw new Error(`Unable to identify the "correct_answer" field for the question "${question.question}"`);
    }

    // Invalid incorrect_answers
    if(typeof question.incorrect_answers !== "object" || question.incorrect_answers === null) {
      throw new Error(`Unable to identify the "incorrect-answers" field for the question "${question.question}"`);
    }

    // Wrong count for incorrect_answers
    if(question.incorrect_answers.length !== 1 && question.incorrect_answers.length !== 3) {
      throw new Error(`Invalid number of answers for the question "${question.question}"`);
    }

    // Invalid difficulty
    if(typeof question.difficulty !== "string" || question.difficulty === null) {
      throw new Error(`Unable to identify the "difficulty" field for the question "${question.question}".`);
    }

    // Wrong value for difficulty
    if(!this.difficulties.includes(question.difficulty)) {
      throw new Error(`Invalid difficulty value "${question.difficulty}" for the question "${question.question}".`);
    }

    if(!this.allowLongAnswers) {
      var answer;
      for(var i = 0; i <= 3; i++) {
        // Loop through all answers -- correct answer first
        answer = i === 0 ? question.correct_answer : question.incorrect_answers[i-1];

        if(typeof answer === "undefined") {
          break;
        }
  
        if(answer.length > 80) {
          throw new Error(`Answer is too long (> 80 chars) for question "${question.question}".\nOverride using "allow-long-answers" or "hangman-mode" (Note: Answer buttons will not display properly)`);
        }
      }
    }
  }

  async updateGlobals() {
    var loadBefore = Date.now();

    // ## Category lookup ## //
    this.dbInfo.categoryList = this.parseCategories();

    // ## Global Question Count Lookup ## //
    var questionPool, questionTotal = 0, i = 0;
    try {
      this.dbInfo.globalCounts = { categories: {} };
      var question, newMasterIndex;
      var newMasterPool = { questions: [] };
      for(i in this.dbInfo.categoryList) {

        // Normally a try statement would be used here, but we're already in one (See above)
        questionPool = yaml.safeLoad(fs.readFileSync(this.path + `/questions_${this.dbInfo.categoryList[i].id}.yml`).toString());

        // Simple check to validate the question pool formatting.
        if(typeof questionPool.questions === "undefined") {
          throw new Error(`Unable to read questions from the category ${this.dbInfo.categoryList[i].name}. (questions_${this.dbInfo.categoryList[i].id}.yml) Ensure that the file is formatted correctly.`);
        }

        this.dbInfo.globalCounts.categories[this.dbInfo.categoryList[i].id] = {
          "total_num_of_questions": questionPool.questions.length,
          "total_num_of_verified_questions": questionPool.questions.length
        };

        questionTotal += questionPool.questions.length;

        for(var i2 in questionPool.questions) {
          question = questionPool.questions[i2];

          // Check these questions for any formatting errors.
          // Will throw a breaking error if something is wrong.
          this.validateQuestion(question);

          // ## Indexing ## //

          // Give the question a unique ID based on its sequential order.
          question.id = newMasterPool.questions.length;

          // Index the question so it can be easily pulled for random category queries.
          newMasterIndex = newMasterPool.questions.push(question);

          // Append the category so we don't need some form of witchcraft to re-aquire it.
          newMasterPool.questions[newMasterIndex-1].categoryName = this.dbInfo.categoryList[i].name;
        }
      }

      this.dbInfo.globalCounts.overall = {
        "total_num_of_questions": questionTotal,
        "total_num_of_verified_questions": questionTotal
      };

      // If everything went through correctly, pass the question pool through.
      this.masterQuestionPool = newMasterPool;
    }
    catch(err) {
      console.log(`Failed to parse file 'questions_${this.dbInfo.categoryList[i].id}.yml' while updating globals`);
      throw err;
    }

    var loadAfter = Date.now();
    console.info(`File database '${this.path}' loaded. Parsed ${questionTotal} questions in ${loadAfter-loadBefore}ms.`);
  }

  async getCategories() {
    if(typeof this.dbInfo.categoryList === "undefined") {
      await this.updateGlobals();
      return Object.assign([], this.dbInfo.categoryList);
    }
    else {
      // Info already exists, resolve with it
      return Object.assign([], this.dbInfo.categoryList);
    }
  }

  async getGlobalCounts() {
    if(typeof this.dbInfo.globalCounts === "undefined") {
      await this.updateGlobals();
      return Object.assign({}, this.dbInfo.globalCounts);
    }
    else {
      // Info already exists, resolve with it
      return Object.assign({}, this.dbInfo.globalCounts);
    }
  }

  // # Token Functions # //
  // The way tokens currently work is by storing a unique identifier for each question pulled using that token.
  // The question is then excluded from the question pool when fetching new random questions.
  // If the entire question pool has been pulled, error code 4 will be returned.

  async validateToken(token) {
    var type = typeof token;
    if(type !== "string") {
      throw new Error(`Expected token to be a string, received '${type}'`);
    }

    if(typeof this.tokens[token] === "undefined") {
      throw new Error("Invalid or non-existent token.");
    }

    return token;
  }

  // getTokenByIdentifier
  // Returns a promise, fetches a token for the specified discord.js TextChannel object.
  // If no token exists, one will be requested from OpenTDB.
  // If tokenChannelID is undefined, the promise will automatically resolve with 'undefined'.
  // This must be async to match other database functions.
  // TODO: Refactor so this doesn't require an identifier.
  async getTokenByIdentifier(tokenChannelID) {
    if(typeof tokenChannelID === "undefined") {
      // No token requested, return without one.
      return void 0;
    }
    else if(typeof this.tokens[tokenChannelID] !== "undefined") {
      // Check if 6 hours have passed since the token was created.
      // If >6 hours have passed, we'll need to generate a new one.
      if(new Date().getTime() > this.tokens[tokenChannelID].time.getTime()+2.16e+7) {
        // Token already exists but is expired, delete it and generate a new one.
        var token = this.tokens[tokenChannelID];
        delete this.tokens[tokenChannelID];
        delete this.tokens[token];
      }
      else {
        // Token already exists and is valid, return it and continue.
        return this.tokens[tokenChannelID].token;
      }
    }

    // Generate a token
    let newToken;
    var buffer = await randomBytes(32);
    newToken = buffer.toString("hex");

    this.tokens[newToken] = { time: new Date(), random: [] };

    this.tokens[tokenChannelID] = { token: newToken, time: this.tokens[newToken].time };
    return newToken;
  }

  // resetToken - This is async to match other databases
  async resetToken(token) {
    return Object.assign({}, this.tokens[token] = { time: new Date(), random: [] });
  }

  async fetchQuestions(options) {
    if(options.amount > 50) {
      throw new Error("Too many questions requested, amount must be 50 or less.");
    }

    var tBefore = Date.now();

    var categories = await this.getCategories();

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
      token = await this.validateToken(token);
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
          exclusionPool = yaml.safeLoad(fs.readFileSync(this.path + `/questions_${category}.yml`).toString()).questions;
        }
        else {
          exclusionPool = JSON.parse(JSON.stringify(this.masterQuestionPool)).questions;
        }

        if(typeof token !== "undefined") {
          // Get the question exclusion array based on our token and whether we're in a random category or not.
          // The array is copied to avoid unexpected modifications to the original data.
          // TODO: Fix this so running questions in a specific category excludes it from random?
          if(isRandomCategory) {
            exclusionArray = JSON.parse(JSON.stringify(this.tokens[token].random || []));
          }
          else {
            exclusionArray = JSON.parse(JSON.stringify(this.tokens[token][category] || []));
          }

          var erBefore = Date.now();

          var length = exclusionPool.length;

          // Prep to filter the question pool based on type and difficulty parameters.
          if(typeof options.type !== "undefined" || typeof options.difficulty !== "undefined") {
            exclusionPool.forEach((el) => {
              el.type = this.types[el.incorrect_answers.length];

              if(typeof options.difficulty !== "undefined" && el.difficulty !== options.difficulty) {
                exclusionArray.push(el.id);
              }
              else if(typeof options.type !== "undefined" && el.type !== options.type) {
                exclusionArray.push(el.id);
              }
            });
          }

          // Cache and specify the IDs in a third array so they can be referenced without a nested loop.
          var exclusionPoolCache = [];
          exclusionPool.forEach((el) => {
            if(typeof el.id === "undefined") {
              // Assign the ID to the question before caching it.
              // This is only necessary when pulling from a specific category.
              el.id = exclusionPool.indexOf(el);
            }

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

          var erAfter = Date.now();
          this.emit("debuglog", `Spliced ${exclusionArray.length} questions of ${length} with remainder ${exclusionPool.length} in ${erAfter-erBefore}ms`);

          // If that empties our output, we're out of questions.
          if(exclusionPool.length === 0) {
            // Respond with hardcoded error code 4 (Token empty)
            // Doing so allows for special handling of the issue (Such as automatically resetting, etc)
            var error = new Error(this.responses[4]);
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
        // Note that the parameter .category is the same as .categoryName in the master pool.
        question.category = categoryName;
        question.type = this.types[question.incorrect_answers.length];

        // Add it to the question pool for export.
        questions.push(question);

        // ## Token Handling ## //
        if(typeof token !== "undefined") {
          if(isRandomCategory) {
            // We're in a random category, so log questions under "random"
            this.tokens[token].random.push(question.id);

            this.emit("debuglog", "Pushing " + question.id + " to token array (rand).");
          }
          else {
            // Initialize thet category if necessary.
            if(typeof this.tokens[token][category] === "undefined") {
              this.tokens[token][category] = [];
            }

            // Log the question ID for this category.
            // If the system is doing its job correctly, there will never be a duplicate pushed.
            this.tokens[token][category].push(question.id);

            this.emit("debuglog", "Pushing " + question.id + " to token array (" + category + ").");
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

    var tAfter = Date.now();
    this.emit("debuglog", `File DB fetched ${questions.length} question(s) in ${tAfter-tBefore}ms.`);

    return questions;
  }

  destroy() {
    delete this.dbInfo.categoryList;
    delete this.dbInfo.globalCounts;

    clearTimeout(this.dbInfo.globalsTimeout);
  }
}

module.exports = FileDB;