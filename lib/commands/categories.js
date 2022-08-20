module.exports = () => {
  return async function(reply, replyDirect, isDM, Trivia) {
    var json;
    var json2;
    var Database = Trivia.database;

    Trivia.postStat("commandCategoriesCount", 1);

    try {
      json = await Database.getCategories();
      json2 = await Database.getGlobalCounts();
    } catch(err) {
      // List was queried successfully, but the question was not received.
      reply({embed: {
        color: 14164000,
        description: `Failed to get the list of categories.\n${err}`
      }});
      console.log(`Failed to retrieve category counts for 'trivia categories'.\n${err}`);
      return;
    }

    var categoryListStr = "**Categories:** ";
    var i = 0;
    for(i in json) {
      categoryListStr = `${categoryListStr}\n${json[i].name} - ${json2.categories[json[i].id].total_num_of_verified_questions} questions`;
    }

    const categoriesReply = replyDirect != null ? replyDirect : reply;
    await categoriesReply(categoryListStr);
  };
};
