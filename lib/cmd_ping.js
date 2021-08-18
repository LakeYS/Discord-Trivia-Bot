function pingStrA(str) {
  var messages = [
    `:ping_pong: ${str}`,
    `*${str}*`,
    `**${str}**`
  ];

  var choice = Math.floor(Math.random() * messages.length);

  str = messages[choice];

  return str;
}

function pingStrB(str) {
    var messages = [
    "Hold on, I dropped the paddle.",
    ":hole: Hole in one!",
    `:badminton: ${str}`,
    `:field_hockey: ${str}`,
    `:ping_pong: :dash: ${str}`,
    `${str.replace("!", "")}?`
  ];

  var choice = Math.floor(Math.random() * messages.length);
   
  str = messages[choice];

  return str;
}

module.exports = (Trivia) => {
  return function doTriviaPing(msg, isPong) {
    Trivia.postStat("commandPingCount", 1);
    var str = isPong?"Ping!":"Pong!";

    var messageChance = Math.floor(Math.random() * 20);
    if(messageChance === 0) {
      str = pingStrB(str);
    }
    else if(messageChance < 5) {
      str = pingStrA(str);
    }

    Trivia.send(msg.channel, msg.author, str);
  };
};