var Database = {};

module.exports = (input) => {
  const FileDB = require("./filedb.js")(input);

  // Override the URL without affecting the actual value. This forces the default URL.
  input = JSON.parse(JSON.stringify(input));
  input.databaseURL = "https://opentdb.com";

  const OpenTDB = require("./opentdb.js")(input, true);

  Database.getCategories = async () => {
    return opentdb_result;
  };

  Database.getGlobalCounts = async () => {
    return OpenTDB.getGlobalCounts();
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
