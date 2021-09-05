module.exports = (manager) => {
  function doExit(code) {
    manager.broadcastEval(new Function("client.destroy(); Trivia.database.destroy();"))
    .then(() => {
      process.exit(code);
    })
    .catch((err) => {
      console.log(err);
      console.log("Received an additional error during shutdown. Exiting anyway...");
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
    manager.broadcastEval(new Function("client.Trivia.exportGame()"))
    .catch((err) => {
      console.error(err);
    });
  };

  evalCmds.importall = () => {
    console.log("Importing game for all processes...");
    manager.broadcastEval(new Function("client.Trivia.importGame(\"./game.\" + client.shard.ids + \".json.bak\");"))
    .catch((err) => {
      console.error(err);
    });
  };

  evalCmds.exportexit = (code) => {
    console.log("Exporting game for all processes...");
    manager.broadcastEval(new Function("client.Trivia.exportGame();"))
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      doExit(code);
    });
  };

  evalCmds.shutdown = () => {
    manager.broadcastEval(new Function("client.Trivia.doMaintenanceShutdown();"))
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      console.log("MAINTENANCE SHUTDOWN - All active games cleared. Type \"Exit\" to complete the shutdown.");
    });
  };

  evalCmds.setErrorMessage = (input) => {
    var msg = input.join(" ");

    // Reset if the input is blank
    if(input.length === 0) {
      manager.broadcastEval(new Function("client.Trivia.maintenanceMsg = null;"))
      .catch((err) => {
        console.error(err);
      })
      .then(() => {
        console.log("DONE - Error message has been removed, resume normal function.");
      });
    }
    else {
      manager.broadcastEval(new Function("client.Trivia.maintenanceMsg = \"" + msg + "\";"))
      .catch((err) => {
        console.error(err);
      })
      .then(() => {
        console.log("DONE - Error message has been set to following:");
        console.log(msg);
      });
    }
  };

  evalCmds.status = () => {
    manager.broadcastEval(new Function("console.log(client.shard.ids, client.readyAt, client.uptime, client.ws.ping);"))
    .catch((err) => {
      console.log("Failed to obtain status: " + err);
    });
  };

  evalCmds.post = () => {
    manager.broadcastEval(new Function("client.Trivia.postStats();"))
    .catch((err) => {
      console.log("Failed to run postStats: " + err);
    });
  };

  return evalCmds;
};
