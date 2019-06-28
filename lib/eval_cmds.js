module.exports = (manager) => {
  function doExit(code) {
    manager.broadcastEval("client.destroy(); Trivia.database.destroy();")
    .then(() => {
      process.exit(code);
    });
  }

  var evalCmds = {};

  evalCmds.exit = (code) => {
    doExit(code);
  };

  evalCmds.stop = (code) => {
    doExit(code);
  };
  evalCmds.exportall = () => {
    console.log("Exporting game for all processes...");
    manager.broadcastEval("global.Trivia.exportGame();")
    .catch((err) => {
      console.error(err);
    });
  };

  evalCmds.importall = () => {
    console.log("Importing game for all processes...");
    manager.broadcastEval("global.Trivia.importGame(\"./game.\" + global.client.shard.id + \".json.bak\");")
    .catch((err) => {
      console.error(err);
    });
  };

  evalCmds.exportexit = (code) => {
    console.log("Exporting game for all processes...");
    manager.broadcastEval("global.Trivia.exportGame();")
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      doExit(code);
    });
  };

  evalCmds.shutdown = () => {
    manager.broadcastEval("global.Trivia.doMaintenanceShutdown();")
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      console.log("MAINTENANCE SHUTDOWN - All active games cleared. Type \"Exit\" to complete the shutdown.");
    });
  };

  return evalCmds;
};
