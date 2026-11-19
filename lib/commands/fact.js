import { decode } from "html-entities";

import QuestionCache from "../cache.js";
import FactsDB from "../database/wrapper/factsdb.js";

export default (databaseRaw) => {
  const database = new FactsDB(databaseRaw);

  const questionOpts = {
    category: undefined,
    // Hardcoded amount of 24 (getting true questions is a matter of chance,
    // so we want a few for safety)
    amount: 24,
    type: "boolean",
  };

  const cache = new QuestionCache(database, {
    name: "cache_facts",
    questionOpts
  });

  return async function (interactionHelper) {
    const questionRaw = await cache.getQuestion();
    let question = decode(questionRaw.question);

    const category = decode(questionRaw.category);

    // Edge case: A handful of true/false questions from OpenTDB end in a
    // question mark.
    if(question.endsWith("?")) question = question.slice(0, -1);

    await interactionHelper.maybeReply(`${question} ${questionRaw.correct_answer}\n-# *From **${category}***`);
  };
};
