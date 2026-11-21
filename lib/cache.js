import EventEmitter from "events";

import FileDB from "./database/filedb.js";
import OpenTDB from "./database/opentdb.js";
import FactsDB from "./database/wrapper/factsdb.js";
import MergerDB from "./database/wrapper/mergerdb.js";

/**
 * @typedef {object} QuestionCacheOpts
 * @property {string} name Internal identifier for this cache.
 * @property {any} questionOpts Question parameters to provide to OpenTDB.
 */

export default class QuestionCache extends EventEmitter {
  /** @type {OpenTDB | FileDB | MergerDB | FactsDB} */
  database;

  /**
   * The error object, if one occurred during the last fetch or refill.
   * @type {unknown | undefined}
   */
  error;

  /**
   * @type {QuestionCacheOpts}
   */
  options;

  questions = [];

  /**
   * Create a new {@link QuestionCache}. For eager loading, call refill() after
   * creating it.
   * 
   * TODO: Token handling
   * TODO: Property overrides (fetch a question with same attributes, but e.g.
   * a category)
   * @param {OpenTDB | FileDB | MergerDB | FactsDB} database The database in
   * use for this cache.
   * @param {typeof this.options} options Configuration for this question cache.
   */
  constructor(database, options) {
    super();

    this.database = database;
    this.options = options;
  }

  /**
   * Fetch the next question.
   * @returns {Promise<any>} The question data.
   */
  async getQuestion() {
    if(this.questions.length === 0) {
      if(this.error !== undefined) {
        console.warn(`Question cache "${this.options.name} is empty ` +
          "following an error, response will be delayed while a refill is " +
          "attempted.");
      }

      await this.refill();
    }

    const question = this.questions.pop();

    if(this.questions.length === 0) {
      void this.refill().catch(err => this.emit("error_refill", err));
    }

    this.error = undefined;

    return question;
  }

  async refill() {
    try {
      const questionsRaw = await this.database.fetchQuestions(
        this.options.questionOpts
      );

      this.questions = questionsRaw;
      this.error = undefined;
    } catch(err) {
      this.error = err;
      throw err;
    }
  }
}
