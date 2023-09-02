const { ChannelType } = require("discord.js");

module.exports = (Config) => {
  return async function(msg, Trivia) {
    var json;
    var json2;
    var Database = Trivia.database;

    Trivia.postStat("commandCategoriesCount", 1);

    try {
      json = await Database.getCategories();
      json2 = await Database.getGlobalCounts();
    } catch(err) {
      // List was queried successfully, but the question was not received.
      Trivia.send(msg.channel, msg.author, {embed: {
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

    const useChannel = Config["categories-in-channel"];

    var str = "A list has been sent to you via DM.";
    if(msg.channel.type === ChannelType.DM || useChannel) {
      str = "";
    }
    
    const sendTarget = useChannel ? msg.channel : msg.author;

    Trivia.send(sendTarget, void 0, categoryListStr, (msg2, err) => {
      if(err) {
        str = "Unable to send you the list because you cannot receive DMs.";
      }
      else {
        i++;
        Trivia.send(msg.channel, void 0, `There ${i===1?"is":"are"} ${i} categor${i===1?"y":"ies"}. ${str}`);
      }
    });
  };
};
