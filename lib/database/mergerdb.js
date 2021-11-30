const Database = require("./database.js");
const FileDB = require("./filedb.js");
const OpenTDB = require("./opentdb.js");

class MergerDB extends Database {
  constructor(path, allowLongAnswers) {
    super();

    this.fileDB = new FileDB(path, allowLongAnswers);
    this.openTDB = new OpenTDB("https://OpenTDB.com");
    // File DB tokens are passed through. OpenTDB tokens will be handled later.
    this.tokens = this.fileDB.tokens;
  }

  async updateGlobals(doTimeout) {
     return this.openTDB.updateGlobals(doTimeout);
  }

  async getCategories() {
    var opentdb_result = await this.openTDB.getCategories();
    var filedb_result = await this.fileDB.getCategories();

    return filedb_result.concat(opentdb_result);
  }

  async getGlobalCounts() {
    var opentdb_result = await this.openTDB.getGlobalCounts();
    var filedb_result = await this.fileDB.getGlobalCounts();
    var output = {};

    // Combine the category count lists.
    output.categories = Object.assign({}, opentdb_result.categories, filedb_result.categories);

    // Add up the total question count between both databases.
    // Currently only returns total and verified.
    output.overall = {
      total_num_of_questions: filedb_result.overall.total_num_of_questions+opentdb_result.overall.total_num_of_questions,
      total_num_of_verified_questions: filedb_result.overall.total_num_of_verified_questions+opentdb_result.overall.total_num_of_verified_questions
    };

    return output;
  }

  // # Token Functions # //

  // getTokenByIdentifier
  async getTokenByIdentifier(tokenChannelID) {
    // Use the file DB token as our identifier and pair it to an OpenTDB token.
    var fileDBToken = await this.fileDB.getTokenByIdentifier(tokenChannelID);
    var openTDBToken = await this.openTDB.getTokenByIdentifier(tokenChannelID);

    // Pair the OpenTDB token to this File DB token.
    this.tokens[fileDBToken] = openTDBToken;

    return fileDBToken;
  }

  // resetTriviaToken
  async resetToken(token) {
    var fileDBReset = await this.fileDB.resetToken(token);
    await this.openTDB.resetToken(this.tokens[token]);

    return fileDBReset;
  }

  async fetchQuestions(options) {
    var databases = [ this.fileDB, this.openTDB ];

    // If the request is for random questions...
    if(typeof options.category === "undefined") {
      // Pick a random database based on the number of categories in each one.
      // This keeps the number of questions balanced for both databases.
      var opentdb_categories = await this.openTDB.getCategories();
      var filedb_categories = await this.fileDB.getCategories();
      var total_length = opentdb_categories.length + filedb_categories.length;

      var qCount = Math.floor(Math.random() * total_length);

      // Based on the random count, pick which database to pull from.
      if(qCount > filedb_categories.length) {
        databases.reverse();
      }
    }

    var isLastDB = 0;
    for(var i in databases) {
      try {
        if(databases[i] === OpenTDB && typeof options.token !== "undefined") {
          // Use the OpenTDB token associated with the token we've received.
          options.token = this.tokens[options.token];
        }

        var res1 = await databases[i].fetchQuestions(options);
        return res1;
      } catch(error) {
        // Attempt to fall back to the next database if one of the following conditions are met:
        //  A. The "No results" error code has been received and we're using the File DB.
        //  (This means we need to check OpenTDB instead)
        //  B. There is no specified category and the current database returns a "Token empty" response.

        // (In order)
        var isNoResultFile = error.code === 1 && databases[i] instanceof FileDB;
        var isEmptyRandom = error.code === 4 && typeof options.category === "undefined";

        if(isNoResultFile || isEmptyRandom) {
          // If there are no questions or the token has run out, fall back to this.openTDB.

          if(!isLastDB) {
            // Since this database returned nothing, try the next one.
            isLastDB = 1;
            continue;
          }
          else {
            // The only usable database(s) returned invalid, throw the error.
            throw error;
          }
        }
        else {
          // The error appears to be fatal or unrecoverable, throw immediately.
          throw error;
        }
      }
    }
  }
}

module.exports = MergerDB;
