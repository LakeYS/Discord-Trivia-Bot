var getConfigVal, triviaSend, game, embedCol, doTriviaGame;

module.exports = (Trivia, functionConfig, functionSend, valGame, valDatabase, valEmbedCol, leaderboard, functionGame) => {
  getConfigVal = functionConfig;
  triviaSend = functionSend;
  game = valGame;
  embedCol = valEmbedCol;
  doTriviaGame = functionGame;

  // These are unused but will likely be used later.
  getConfigVal, game;

  async function leagueParse(id, channel, author, member, cmd) {
    cmd = cmd.replace("LEAGUE ", "");
    var guild = member.guild;

    var isAdmin;
    if(member !== null && member.permissions.has("MANAGE_GUILD")) {
      isAdmin = true;
    }

    if(cmd.startsWith("STATS")) {
      var scores;
      try {
        scores = leaderboard.readScores(guild.id);
      } catch(err) {
        if(err.message === "Leaderboard is empty") {
          // The leaderboard is empty, display a message.
          triviaSend(channel, author, { embed: {
            color: embedCol,
            description: "The leaderboard is currently empty."
          }});
        }
        else {
          // Something went wrong, display the error and dump the stack in the console.
          console.log(err.stack);
          triviaSend(channel, author, {embed: {
            color: 14164000,
            description: `Failed to load the leaderboard: \n${err.message}`
          }});
        }

        return;
      }

      var totalParticipants = {}, totalPoints = 0;
      for(var userId in scores) {
        try {
          totalParticipants[userId] = guild.members.get(userId).displayName;
        }
        catch(err) {
          totalParticipants[userId] = "*Unknown*";
        }

        totalPoints += scores[userId];
      }

      var scoreStr = leaderboard.makeScoreStr(scores, totalParticipants, true);

      triviaSend(channel, author, {embed: {
        color: embedCol,
        fields: [
          {
            "name": "Top Scores - Overall",
            "value": scoreStr,
            inline: true
          },
          {
            "name": "Total Participants",
            "value": Object.keys(scores).length.toLocaleString(),
            inline: true
          },
          {
            "name": "Total Points",
            "value": totalPoints.toLocaleString(),
            inline: true
          },
        ]
      }});
    }

    if(cmd.startsWith("PLAY")) {
      if(isAdmin) {
        var categoryInput = cmd.replace("PLAY ","");

        var category;
        if(categoryInput !== "PLAY") {
          try {
            category = await Trivia.getCategoryFromStr(categoryInput).id;
          } catch(err) {
            triviaSend(channel, author, {embed: {
              color: 14164000,
              description: `Failed to retrieve the category list:\n${err}`
            }});
            console.log(`Failed to retrieve category list:\n${err}`);
            return;
          }

          if(typeof category === "undefined") {
            triviaSend(channel, author, {embed: {
              color: 14164000,
              description: "Unable to find the category specified."
            }});
            return;
          }
        }

        doTriviaGame(id, channel, author, 0, category)
        .then((game) => {
          if(typeof game !== "undefined") {
            game.isLeagueGame = true;
          }
        });
      } else {
        triviaSend(channel, author, "Only moderators can use this command. To start a normal game, type `trivia play`");
      }
    }
  }

  return { leagueParse };
};
