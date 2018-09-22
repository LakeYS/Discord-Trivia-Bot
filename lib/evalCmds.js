module.exports = (manager) => {
  function doExit() {
    manager.broadcastEval("client.destroy(); Trivia.database.destroy();")
    .then(() => {
      process.exit();
    });
  }

  var evalCmds = {};

  evalCmds.exit = () => {
    doExit();
  };

  evalCmds.stop = () => {
    doExit();
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

  evalCmds.exportexit = () => {
    console.log("Exporting game for all processes...");
    manager.broadcastEval("global.Trivia.exportGame();")
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      doExit();
    });
  };

  evalCmds.exportexit = () => {
    console.log("Exporting game for all processes...");
    manager.broadcastEval("global.Trivia.exportGame();")
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      doExit();
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
