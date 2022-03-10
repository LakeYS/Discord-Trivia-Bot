class LogManager {
  constructor(version) {
    this.version = version;
  }

  initLogs(options) {
    if(typeof options === "undefined") options = {};

    // process.stdout.columns returns "undefined" in certain situations
    var strArray = [ `\x1b[7m TriviaBot Version ${this.version}`,
                     "\x1b[7m Copyright (c) 2018-2022 Lake Y",
                     "\x1b[7m https://lakeys.net" ];
  
    var padLen = Math.max(strArray[1].length+1, strArray[0].length+1);
    // Adjust length of the first line
    for(var i = 0; i <= strArray.length-1; i++) {
      strArray[i] = strArray[i].padEnd(padLen, " ") + "\x1b[0m";
    }
  
    var strHeader = `${strArray[0]}\n${strArray[1]}\n${strArray[2]}`;
  
    // Optional logo display
    if(options.displayAsciiLogo) {
      var useSideStr = process.stdout.columns > 61;
  
      // Use a pattern to properly space the logo.
      var patt = /^ {3}./mg;
  
      // See here for an example of how this looks when the application is running:
      // http://lakeys.net/triviabot/console.png
      console.log(`\
                       ########
                  ##################
               ###      #######     ###
             ###    ###############   ###
           ###    ####################  ###
          ###     #########    ########  ###
         ###     ########      ########   ###
        ###       #####       ########     ###
       ###                  ##########      ### ${useSideStr?strArray[0]:""}
       ###               ###########        ### ${useSideStr?strArray[1]:""}
       ###              #########           ### ${useSideStr?strArray[2]:""}
        ###             ########           ###
         ###            ######            ###
          ###            ####            ###
            ###         ######         ###
              ###       ######       ###
                #####    ####    #####
                     ############
                        ######\n${useSideStr?"":strHeader}`
      .replace(patt, ""));
    }
    else {
      console.log(`${strHeader}\n`);
    }
  }
}

module.exports = LogManager;