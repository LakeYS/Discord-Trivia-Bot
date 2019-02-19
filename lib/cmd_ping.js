module.exports = (config, Trivia, Database) => {
  return function doTriviaPing(msg) {
    var tBefore = Date.now();

    global.client.shard.send({stats: { commandPingCount: 1 }});

    Trivia.send(msg.channel, msg.author, {embed: {
      color: Trivia.embedCol,
      title: "Pong!",
      description: "Measuring how long that took..."
    }}, (sent) => {
      var tAfter = Date.now();

      sent.edit({embed: {
        color: Trivia.embedCol,
        title: "Pong!",
        description: `That took ${tAfter-tBefore}ms.\nAverage client heartbeat: ${Math.round(global.client.ping)}ms\n${!config.databaseURL.startsWith("file://")?`Last database response: ${Database.pingLatest}ms\n`:""}Shard ${global.client.shard.id} of ${global.client.shard.count-1}`
      }});
    });
  };
};
