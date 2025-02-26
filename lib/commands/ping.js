const TriviaDiscord = require("../platform/discord_main");

/**
 * Create a string for the 'ping' command.
 *
 * @param {string} str The string to use.
 * @param {boolean} isRare Show a rare message.
 * @returns {string} The message to send to the user.
 */
function fancyPingStr(str, isRare) {
    const messages = isRare ? [
      "Hold on, I dropped the paddle.",
      ":hole: Hole in one!",
      `:badminton: ${str}`,
      `:field_hockey: ${str}`,
      `:ping_pong: :dash: ${str}`,
      `${str.replace("!", "")}?`
    ] : [
      `:ping_pong: ${str}`,
      `*${str}*`,
      `**${str}**`
    ];

  var choice = Math.floor(Math.random() * messages.length);
   
  str = messages[choice];

  return str;
}

/**
 * Ping command export
 *
 * @param {TriviaDiscord} Trivia The Trivia object.
 * @returns {Function} The ping command function.
 */
module.exports = (Trivia) => {
  // TODO reply to return type d.js object?
  return function doTriviaPing(reply, isPong) {
    Trivia.postStat("commandPingCount", 1);
    var str = isPong?"Ping!":"Pong!";

    var messageChance = Math.floor(Math.random() * 20);
    if(messageChance === 0) {
      str = fancyPingStr(str, true);
    }
    else if(messageChance < 5) {
      str = fancyPingStr(str, false);
    }

    reply({content: str});
  };
};