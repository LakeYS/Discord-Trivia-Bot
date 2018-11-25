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

  Database.fetchQuestions = async (options) => {
    return FileDB.fetchQuestions(options);
  };

  Database.destroy = () => {
    return OpenTDB.destroy();
  };

  console.log("Merger database loaded.");

  return Database;
};
