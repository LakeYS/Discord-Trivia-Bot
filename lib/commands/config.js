module.exports = (Trivia, ConfigData, Config) => {

  return function(cmd, channel, user, isAdmin) {
    if(isAdmin && Trivia.getConfig("config-commands-enabled")) {
      var cmdInput = cmd.replace("CONFIG ","");
  
      if(cmdInput === "CONFIG") {
        Trivia.send(channel, void 0, `Must specify an option to configure. \`${Trivia.getConfig("prefix")}config <option> <value>\``);
        return;
      }
  
      if(cmdInput.startsWith("LIST") && cmdInput.indexOf("-") === -1) {
  
        var listID;
        if(cmdInput !== "CONFIG LIST ") {
          listID = cmdInput.replace("LIST <#","").replace(">","");
  
          if(isNaN(listID)) {
            listID = void 0;
          }
        }
  
        var configStr = `**__Config Options__**\nThese are the config options that are currently loaded${typeof listID!=="undefined"?` in the channel <#${listID}>`:""}. Some options require a restart to take effect. Type '${Trivia.getConfig("prefix")}reset' to apply changes.`;
  
        for(var i in Config) {
          if(i.toString().includes("token") || i.toString().includes("comment") || i.includes("configFile")) {
            continue;
          }
          else {
            var value = Trivia.getConfig(i, listID);
  
            var outputStr = value;
            if(typeof outputStr === "object") {
              outputStr = JSON.stringify(outputStr);
            }
            else if(outputStr.toString().startsWith("http")) {
              outputStr = `\`${outputStr}\``; // Surround it with '`' so it doesn't show as a link
            }
  
            configStr = `${configStr}\n**${i}**: ${outputStr}`;
          }
        }
  
  
        if(channel.type !== "DM") {
          Trivia.send(channel, void 0, "Config has been sent to you via DM.");
        }
  
        Trivia.send(user, void 0, `${configStr}`);
      }
      else {
        var configSplit = cmd.split(" ");
        var configKey = configSplit[1];
        var configVal = cmd.replace(`CONFIG ${configKey} `, "");
  
        var localID;
        if(configVal.endsWith(">")) {
          var configChannelStr = configVal.slice(configVal.indexOf(" <"), configVal.length);
          localID = configChannelStr.replace(" <#","").replace(">","");
          if(!ConfigData.localOptions.includes(configKey.toLowerCase())) {
            Trivia.send(channel, void 0, "The option specified either does not exist or can only be changed globally.");
            return;
          }
  
          if(isNaN(localID)) {
            return;
          }
  
          configVal = configVal.substring(0, configVal.indexOf(" <"));
        }
  
        // echo is the value that will be sent back in the confirmation message
        var echo = configVal.toLowerCase();
        if(configVal === `CONFIG ${configKey}`) {
          Trivia.send(channel, void 0, `Must specify a value. \`${Trivia.getConfig("prefix")}config <option> <value>\``);
          return;
        }
  
        if(configVal === "TRUE") {
          configVal = true;
        }
        else if(configVal === "FALSE") {
          configVal = false;
        }
        else if(!isNaN(configVal)) {
          configVal = parseFloat(configVal);
        }
        else if(configVal.startsWith("[") || configVal.startsWith("{")) {
          try {
            configVal = JSON.parse(configVal.toLowerCase());
          } catch(err) {
            Trivia.send(channel, void 0, `The config value specified has failed to parse with the following error:\n${err}`);
            return;
          }
  
          echo = `\`${JSON.stringify(configVal)}\``;
        }
        else {
          configVal = configVal.toString().toLowerCase();
  
          if(configVal.startsWith("\"") && configVal.lastIndexOf("\"") === configVal.length-1) {
            configVal = configVal.substr(1, configVal.length-2);
          }
  
          echo = configVal;
        }
  
        if(configVal === Trivia.getConfig(configKey.toLowerCase(), channel)) {
          Trivia.send(channel, void 0, `Option ${configKey} is already set to "${echo}" (${typeof configVal}).`);
        }
        else {
          if(configVal === "null") {
            configVal = null;
          }
  
          var result = Trivia.setConfigVal(configKey, configVal, true, localID);
          if(result === -1) {
            Trivia.send(channel, void 0, `Unable to modify the option "${configKey}".`);
  
          }
          else if(configVal === null) {
            Trivia.send(channel, void 0, `Removed option ${configKey} successfully.`);
          }
          else {
            Trivia.send(channel, void 0, `Set option ${configKey} to "${echo}" (${typeof configVal}) ${typeof localID !== "undefined"?`in channel <#${localID}> `:""}successfully.`);
          }
        }
      }
    }
  };
};