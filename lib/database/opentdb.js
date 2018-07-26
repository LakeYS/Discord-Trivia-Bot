// NOTE: A large portion of OpenTDB-related functionality is still found in TriviaBot.js

const https = require("https");

var config;
var OpenTDB = {};
OpenTDB.tokens = [];
var OpenTDBInfo = {};

OpenTDB.responses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];

module.exports = (input) => {
  config = input;

  // OpenTDB.parseURL(url)
  // Returns a promise. Queries the specified URL and parses the data as JSON.
  OpenTDB.parseURL = (url) => {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        var data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            var json =  JSON.parse(data);
            resolve(json);
          } catch(error) {
            reject(error);
            console.log(data);
          }
        });
      }).on("error", (error) => {
        reject(error);
      });
    });
  };

  // # Globals # //
  async function updateGlobals(doTimeout) {
    // Global information updates every 4 hours
    if(doTimeout) {
      OpenTDBInfo.globalsTimeout = setTimeout(() => {
        updateGlobals(1);
      }, 1.44e+7);
    }

    // ## Category lookup ## //
    try {
      var categoryList = await OpenTDB.parseURL(config.databaseURL + "/api_category.php");
      OpenTDBInfo.categoryList = categoryList.trivia_categories;
    }
    catch(err) {
      throw err;
    }

    // ## Global Question Count Lookup ## //
    try {
      OpenTDBInfo.globalCounts = await OpenTDB.parseURL(config.databaseURL + "/api_count_global.php");
    }
    catch(err) {
      throw err;
    }
  }

  // # OpenTDB Methods # //
  OpenTDB.getCategories = () => {
    return new Promise((resolve, reject) => {
      if(typeof OpenTDBInfo.categoryList === "undefined") {
        updateGlobals()
        .then(() => {
          resolve(OpenTDBInfo.categoryList);
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(OpenTDBInfo.categoryList);
      }
    });
  };

  OpenTDB.getGlobalCounts = () => {
    return new Promise((resolve, reject) => {
      if(typeof OpenTDBInfo.globalCounts === "undefined") {
        updateGlobals()
        .then(() => {
          resolve(OpenTDBInfo.globalCounts);
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(OpenTDBInfo.globalCounts);
      }
    });
  };

  // getTriviaToken
  // Returns a promise, fetches a token for the specified discord.js TextChannel object.
  // If no token exists, one will be requested from OpenTDB.
  // If tokenChannelID is undefined, the promise will automatically resolve with 'undefined'.
  OpenTDB.getTokenByIdentifier = (tokenChannelID) =>  {
    return new Promise((resolve, reject) => {
      if(typeof tokenChannelID === "undefined") {
        // No token requested, return without one.
        resolve(void 0);
        return;
      }
      else if(typeof OpenTDB.tokens[tokenChannelID] !== "undefined") {
        // Check if 6 hours have passed since the token was created.
        // If >6 hours have passed, we'll need to generate a new one.
        if(new Date().getTime() > OpenTDB.tokens[tokenChannelID].time.getTime()+2.16e+7) {
          // Token already exists but is expired, delete it and generate a new one.
          delete OpenTDB.tokens[tokenChannelID];
        }
        else {
          // Token already exists and is valid, return it and continue.
          resolve(OpenTDB.tokens[tokenChannelID].token);
          return;
        }
      }

      // No token exists, so we'll generate one.
      OpenTDB.parseURL(config.databaseURL + "/api_token.php?command=request")
      .then((tokenContainer) => {
        try {
          if(tokenContainer.response_code !== 0) {
            reject(new Error("Received response code " + tokenContainer.response_code + ": " + OpenTDB.responses[tokenContainer.response_code]) + " while attempting to request a new token.");
          }
          else {
            OpenTDB.tokens[tokenChannelID] = { token: tokenContainer.token, time: new Date() };
            resolve(tokenContainer.token);
          }
        } catch(error) {
          reject(error);
        }
      })
      .catch((error) => {
        reject(error);
      });
    });
  };

  // resetTriviaToken
  OpenTDB.resetToken = (token) => {
    return new Promise((resolve, reject) => {
      OpenTDB.parseURL(config.databaseURL + "/api_token.php?command=reset&token=" + token)
      .then((json) => {
        if(json.response_code !== 0) {
          reject(new Error("Failed to reset token - received response code " + json.response_code + "(" + OpenTDB.responses[json.response_code] + ")"));
          return;
        }

        resolve(json);
      })
      .catch((err) => {
        reject(err);
        return;
      });
    });
  };

  // # Initialize Globals # //
  updateGlobals(1)
  .catch((err) => {
    if(err) {
      console.error("Error occurred while attempting to initialize globals: " + err);
    }
  });

  return OpenTDB;
};
