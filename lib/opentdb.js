// NOTE: A large portion of OpenTDB-related functionality is still found in discord-trivia-func.js

const https = require("https");

var config;
var OpenTDB = {};
var OpenTDBInfo = {};
module.exports = (input) => {
  config = input;

  // parseURL
  // Returns a promise. Queries the specified URL and parses the data as JSON.
  function parseURL(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        var data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            var json =  JSON.parse(data);
            resolve(json);
          } catch(error) {
            global.JSONData = data;
            reject(error);
          }
        });
      }).on("error", (error) => {
        reject(error);
      });
    });
  }

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
      var categoryList = await parseURL(config.databaseURL + "/api_category.php");
      OpenTDBInfo.categoryList = categoryList.trivia_categories;
    }
    catch(err) {
      throw err;
    }

    // ## Global Question Count Lookup ## //
    try {
      OpenTDBInfo.globalCounts = await parseURL(config.databaseURL + "/api_count_global.php");
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

  // # Initialize Globals # //
  updateGlobals(1)
  .catch((err) => {
    if(err) {
      console.error("Error occurred while attempting to initialize globals: " + err);
    }
  });

  return OpenTDB;
};
