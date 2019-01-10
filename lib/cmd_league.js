module.exports = (Trivia, getConfigVal, triviaSend, Database, embedCol, leaderboard, doTriviaGame) => {

  // These are unused but will likely be used later.
  // TODO: Remove anything not in use here

  async function leagueParse(id, channel, author, member, cmd) {
    cmd = cmd.replace("LEAGUE ", "");
    var guild = member.guild;

    var isAdmin;
    if(member !== null && member.permissions.has("MANAGE_GUILD")) {
      isAdmin = true;
    }

    // Note: These are re-used multiple times but will never overlap.
    var scores, scoresWeek, userId, toSend, properties, userInput;

    // TODO: Section support
    // ## Stats ## //
    if(cmd.startsWith("STATS")) {
      userInput = cmd.replace("STATS ","");
      var doSectionSearch = true;

      if(userInput === "STATS") {
        // No input, show the default board.
        userInput = "Monthly";
        doSectionSearch = false;
      }

      try {
        scores = leaderboard.readScores(guild.id, userInput, true, doSectionSearch);
      } catch(err) {
        if(err.message === "Leaderboard is empty") {
          // The leaderboard is empty, display a message.
          triviaSend(channel, author, { embed: {
            color: embedCol,
            description: "The leaderboard is currently empty."
          }});
        }
        else if(err.message === "Section does not exist") {
          triviaSend(channel, author, { embed: {
            color: 14164000,
            description: "That leaderboard does not exist."
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

      properties = scores["Properties"];
      delete scores["Properties"];

      var totalParticipants = {}, totalPoints = 0;
      for(userId in scores) {
        try {
          totalParticipants[userId] = guild.members.get(userId).displayName;
        }
        catch(err) {
          totalParticipants[userId] = "*Unknown*";
        }

        totalPoints += scores[userId];
      }

      var scoreStr = leaderboard.makeScoreStr(scores, totalParticipants, true);
      var footerText = "";

      toSend = {embed: {
        color: embedCol,
        title: "Top Scores",
        description: scoreStr,
        fields:
        [
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
      }};

      if(!doSectionSearch) {
        footerText = `${footerText}Also try: "${getConfigVal("prefix", channel)}league stats weekly"`;
      }

      if(typeof properties.expireDate !== "undefined") {
        if(footerText !== "") {
          footerText = `${footerText} - `;
        }

        // Discord's built-in timestamp is not used because it doesn't show up correctly on mobile.
        footerText = `${footerText}This leaderboard resets on ${new Date(properties.expireDate).toDateString()}`;
      }
      else if(typeof properties.expiredOn !== "undefined") {
        if(footerText !== "") {
          footerText = `${footerText} - `;
        }

        footerText = `${footerText}This leaderboard has expired. The scores were reset on ${new Date(properties.expiredOn).toDateString()}`;
      }

      if(footerText !== "") {
        toSend.embed.footer = { text: footerText };
      }

      triviaSend(channel, author, toSend);
    }
    else if(cmd.startsWith("RANK")) {
      // ## Rank ## //
      userInput = cmd.replace("RANK ","");
      var userMember;

      try {
        scoresWeek = leaderboard.readScores(guild.id, "Weekly", true);
      } catch(err) {
        if(err.message !== "Leaderboard is empty") {
          throw err;
        }
      }

      try {
        scores = leaderboard.readScores(guild.id, "Monthly", true);
      } catch(err) {
        if(err.message === "Leaderboard is empty") {
          if(typeof scoresWeek === "undefined") {
            // Both leaderboards are empty, display a message.
            triviaSend(channel, author, { embed: {
              color: embedCol,
              description: "The leaderboard is currently empty."
            }});
            return;
          }
        }
        else {
          // Something went wrong, display the error and dump the stack in the console.
          console.log(err.stack);
          triviaSend(channel, author, {embed: {
            color: 14164000,
            description: `Failed to load rank: \n${err.message}`
          }});

          return;
        }
      }

      // Separate the properties object so it doesn't break anything.
      if(typeof scores !== "undefined") {
        properties = scores["Properties"];
        delete scores["Properties"];
      }

      if(typeof scoresWeek !== "undefined") {
        delete scoresWeek["Properties"];
      }

      // Check if they specified another user
      if(userInput !== "RANK") {
        var match, closestMatch;
        userMember = guild.members.find((el) => {
          match = el.user.tag.toUpperCase().includes(userInput.toUpperCase());

          if(match) {
            if(typeof closestMatch === "undefined") {
              closestMatch = el;
            }

            if(typeof scores[el.id] !== "undefined") {
              closestMatch = el;

              return match;
            }
          }
        });

        if(userMember === null) {
          // Try to find the first matching user that has a score on the leaderboard.
          // If that fails, pass the first matching user that isn't on the board as "closestMatch"
          if(typeof closestMatch === "undefined") {
            triviaSend(channel, author, { embed: {
              color: embedCol,
              description: "Unable to find the specified user."
            }});

            return;
          }
          else {
            userMember = closestMatch;
          }
        }

        userId = userMember.id;
      }
      else {
        userMember = member;
        userId = author.id;
      }

      var rankStr, rankSort, rankSortWeek;

      if(typeof scores === "undefined" || typeof scores[userId] === "undefined") {
        // ## No rank (Monthly) ## //
        var scoreCount = typeof scores === "undefined"?0:Object.keys(scores).length-1;
        rankStr = `No rank yet for this month. (out of ${scoreCount} score${scoreCount===1?"":"s"})`;
      }
      else {
        // ## Rank (Monthly) ## //
        rankSort = Object.keys(scores).sort((a, b) => {
          return scores[b] - scores[a];
        });
        var rank = rankSort.indexOf(userId)+1;

        rankStr = `Rank: **#${rank.toLocaleString()}** of ${Object.keys(scores).length.toLocaleString()} ${rank<=3?":trophy:":""}
        ${scores[userId].toLocaleString()} points`;
      }

      if(typeof scoresWeek !== "undefined" && typeof scoresWeek[userId] !== "undefined") {
        // ## Rank (Weekly) ## //
        rankSortWeek = Object.keys(scoresWeek).sort((a, b) => {
          return scoresWeek[b] - scoresWeek[a];
        });

        var rankWeek = rankSortWeek.indexOf(userId)+1;
        rankStr = `${rankStr}\n\nThis week: **#${rankWeek.toLocaleString()}** of ${Object.keys(scoresWeek).length.toLocaleString()}, ${scoresWeek[userId].toLocaleString()} points`;
      }

      toSend = {embed: {
        color: embedCol,
        author: {
          name: `Rank for ${userMember.displayName}`,
          icon_url: userMember.user.avatarURL
        },
        description: rankStr
      }};

      if(typeof properties !== "undefined" && typeof properties.expireDate !== "undefined") {
        // Discord's built-in timestamp is not used because it doesn't show up correctly on mobile.
        toSend.embed.footer = { text: `Ranks reset on ${new Date(properties.expireDate).toDateString()}`};
      }

      triviaSend(channel, author, toSend);
    }
    // ## Play ## //
    else if(cmd.startsWith("PLAY")) {
      if(isAdmin) {
        var categoryInput = cmd.replace("PLAY ","");

        var category;
        if(categoryInput !== "PLAY") {
          try {
            category = (await Trivia.getCategoryFromStr(categoryInput));
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

          category = category.id;
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
