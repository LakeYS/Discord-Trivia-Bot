import AbstractWrapperDB from "./_abstract.js";

/**
 * FactsDB - Very simple wrapper to only return true facts from the true/false
 * question pool.
 */
export default class FactsDB extends AbstractWrapperDB {
  constructor(dbUpstream) {
    super();

    this.dbUpstream = dbUpstream;
  }

  async fetchQuestions(options) {
    const questionsRaw = await this.dbUpstream.fetchQuestions(options);

    const questions = [];
    for (const question of questionsRaw) {
      if(question.correct_answer === "True") {
        questions.push(question);
      }
    }

    return questions;
  }
}
