var Database = {};

module.exports = (input) => {
  const FileDB = require("./filedb.js")(input);

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
  Database.getTokenByIdentifier = (tokenChannelID) =>  {
    return OpenTDB.getTokenByIdentifier(tokenChannelID);
  };

  // resetTriviaToken
  Database.resetToken = (token) => {
    return OpenTDB.resetToken(token);
  };

  Database.fetchQuestions = async (options) => {
    return OpenTDB.fetchQuestions(options);
  };

  Database.destroy = () => {
    return OpenTDB.destroy();
  };

  console.log("Merger database loaded");

  return Database;
};
