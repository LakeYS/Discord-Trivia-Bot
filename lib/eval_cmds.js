const { Client } = require("discord.js");

/**
 * The command to eval on all shards when the "status" command is invoked.
 *
 * @param {Client} client The discord.js client object corresponding to the shard.
 */
async function clientStatus(client) {
  // Generic try-catch - a status ping should never result in an error.
  try {
    const statShard = client.shard.ids[0];
  
    const uptimeVal = await client.shard.fetchClientValues("uptime");
    console.log(uptimeVal);

    let statShardUptime;
    if(typeof uptimeVal === "object" && typeof uptimeVal[0] === "number") {
      const updateTime = uptimeVal[0]/1000;
      if(updateTime < 3600) {
        statShardUptime = `${Math.round(updateTime/60)}m`;
      }
      else {
        statShardUptime = `${Math.round(updateTime/3600)}h`;
      }
    } else {
      statShardUptime = "(UNKNOWN)";
    }

  
    const gameHandler = client.Trivia.gameHandler;
    const games = gameHandler.dumpGames();
    const statActiveGames = Object.keys(games).length;
  
    console.log(`* ${statShard}: Uptime: ${statShardUptime}, Active games: ${statActiveGames}`);
  } catch(err) {
    console.error("Critical: An error occurred retrieving client status.");
    console.error(err);
  }
}

module.exports = (manager) => {
  function doExit(code) {
    manager.broadcastEval(async client => {await client.destroy();})
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

  evalCmds.shutdown = () => {
    manager.broadcastEval((client) => { client.Trivia.doMaintenanceShutdown(); })
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
      manager.broadcastEval((client) => { client.Trivia.maintenanceMsg = null; })
      .catch((err) => {
        console.error(err);
      })
      .then(() => {
        console.log("DONE - Error message has been removed, resume normal function.");
      });
    }
    else {
      manager.broadcastEval((client, msg) => { client.Trivia.maintenanceMsg = msg; })
      .catch((err) => {
        console.error(err);
      })
      .then(() => {
        console.log("DONE - Error message has been set to following:");
        console.log(msg);
      });
    }
  };

  evalCmds.status = async () => {
    /**
     * @param {Client} client
     */
    manager.broadcastEval(clientStatus);
  };

  evalCmds.post = () => {
    manager.broadcastEval((client) => { client.Trivia.postStats(); })
    .catch((err) => {
      console.log("Failed to run postStats: " + err);
    });
  };

  evalCmds.clearcommands = () => {
    manager.broadcastEval(async (client) => {
      await client.Trivia.discordCommandHandler.deleteGuildCommands();
      console.log("Request sent to Discord successfully. Note that the commands may not disappear right away.");
    })
    .catch((err) => {
      console.log("Failed to clear commands: ", err);
    });
  };

  evalCmds.clearglobalcommands = () => {
    manager.broadcastEval(async (client) => {
      await client.Trivia.discordCommandHandler.deleteGlobalCommands();
      console.log("Request sent to Discord successfully. Note that the commands may not disappear right away.");
    })
    .catch((err) => {
      console.log("Failed to clear commands: ", err);
    });
  };

  return evalCmds;
};
