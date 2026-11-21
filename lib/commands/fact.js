import { decode } from "html-entities";

import QuestionCache from "../cache.js";
import FactsDB from "../database/wrapper/factsdb.js";

export default (config, databaseRaw) => {
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
    let questionRaw;
    try {
      questionRaw = await cache.getQuestion();
    } catch(err) {
      if(err.code === 5) {
        if(config["database-rate-limit-mode"] === true) {
          console.warn("!!! Got rate limit code during /fact!");
          console.trace();
        }

        await interactionHelper.maybeReply({embed: {
          color: 14164000,
          description: "Too many commands have been used at once. Please" +
          " wait a few moments before trying again."
        }});
        return;
      }
    }

    let question = decode(questionRaw.question);

    const category = decode(questionRaw.category);

    // Edge case: A handful of true/false questions from OpenTDB end in a
    // question mark.
    if(question.endsWith("?")) question = question.slice(0, -1);

    await interactionHelper.maybeReply(`${question}\n-# *From **${category}***`);
  };
};
