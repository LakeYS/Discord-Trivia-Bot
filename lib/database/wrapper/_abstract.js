import Database from "../database.js";

/**
 * Abstract wrapper database. As-is, this passes all functions on to the
 * upstream database. Override functions as needed for custom things!
 */
export default class AbstractWrapperDB extends Database {
  constructor(dbUpstream) {
    super();

    this.dbUpstream = dbUpstream;
  }

  updateGlobals(doTimeout) {
     return this.dbUpstream.updateGlobals(doTimeout);
  }

  getCategories() {
    return this.dbUpstream.getCategories();
  }

  getGlobalCounts() {
    return this.dbUpstream.getGlobalCounts();
  }

  // # Token Functions # //

  // getTokenByIdentifier
  getTokenByIdentifier(tokenChannelID) {
    return this.dbUpstream.getTokenByIdentifier(tokenChannelID);
  }

  // resetTriviaToken
  resetToken(token) {
    return this.dbUpstream.resetToken(token);
  }

  fetchQuestions(options) {
    return this.dbUpstream.fetchQuestions(options);
  }
}
