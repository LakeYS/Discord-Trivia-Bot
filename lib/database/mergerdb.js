var Database = {};
var DatabaseInfo = { tokens: { } };

module.exports = (input) => {
  const FileDB = require("./filedb.js")(input);
  // File DB tokens are passed through. OpenTDB tokens will be handled later.
  Database.tokens = FileDB.tokens;

  // Override the URL without affecting the actual value. This forces the default URL.
  input = JSON.parse(JSON.stringify(input));
  input.databaseURL = "https://opentdb.com";

  const OpenTDB = require("./opentdb.js")(input, true);

  Database.getCategories = async () => {
    var opentdb_result = await OpenTDB.getCategories();
    var filedb_result = await FileDB.getCategories();

    return filedb_result.concat(opentdb_result);
  };

  Database.getGlobalCounts = async () => {
    var opentdb_result = await OpenTDB.getGlobalCounts();
    var filedb_result = await FileDB.getGlobalCounts();
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
  };

  // # Token Functions # //

  // getTokenByIdentifier
  Database.getTokenByIdentifier = async (tokenChannelID) =>  {
    // Use the file DB token as our identifier and pair it to an OpenTDB token.
    var fileDBToken = await FileDB.getTokenByIdentifier(tokenChannelID);
    var openTDBToken = await OpenTDB.getTokenByIdentifier(tokenChannelID);

    // Pair the OpenTDB token to this File DB token.
    DatabaseInfo.tokens[fileDBToken] = openTDBToken;

    return fileDBToken;
  };

  // resetTriviaToken
  Database.resetToken = async (token) => {
    var fileDBReset = await FileDB.resetToken(token);
    await OpenTDB.resetToken(DatabaseInfo.tokens[token]);

    return fileDBReset;
  };

// TODO: Mix questions from both databases if random questions have been reqeuested.
  Database.fetchQuestions = async (options) => {
    var databases = [ FileDB, OpenTDB ];

    // If the request is for random questions...
    if(typeof options.category === "undefined") {
      // Pick a random database based on the number of categories in each one.
      // This keeps the number of questions balanced for both databases.
      var opentdb_categories = await OpenTDB.getCategories();
      var filedb_categories = await FileDB.getCategories();
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
          options.token = DatabaseInfo.tokens[options.token];
        }

        var res1 = await databases[i].fetchQuestions(options);
        return res1;
      } catch(error) {
        // Attempt to fall back to the next database if one of the following conditions are met:
        //  A. The "No results" error code has been received and we're using the File DB.
        //  (This means we need to check OpenTDB instead)
        //  B. There is no specified category and the current database returns a "Token empty" response.

        if((error.code === 1 && databases[i] === FileDB) || (error.code === 4 && typeof options.category === "undefined")) {
          // If there are no questions or the token has run out, fall back to OpenTDB.

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

  };

  Database.destroy = () => {
    return OpenTDB.destroy();
  };

  return Database;
};
