const Database = require("./database.js");
const https = require("https");
const fetch = require("node-fetch");

class OpenTDB extends Database {
  constructor(url) {
    super();

    this.url = url;

    // TODO: Catch on creation, console.error("Error occurred while attempting to initialize globals: " + err);
    this.updateGlobals(1);
  }

  async parseURL(url) {
    var res = await fetch(url);
    return await res.json();
  }

  async updateGlobals(doTimeout) {
    // Global information updates every 4 hours
    if(doTimeout) {
      this.dbInfo.globalsTimeout = setTimeout(() => {
        this.this.updateGlobals(1);
      }, 1.44e+7);
    }

    // ## Category lookup ## //
    var categoryList = await this.parseURL(this.url + "/api_category.php");
    this.dbInfo.categoryList = categoryList.trivia_categories;

    // ## Global Question Count Lookup ## //
    this.dbInfo.globalCounts = await this.parseURL(this.url + "/api_count_global.php");
  }

  getCategories() {
    return new Promise((resolve, reject) => {
      if(typeof this.dbInfo.categoryList === "undefined") {
        this.updateGlobals()
        .then(() => {
          resolve(Object.assign([], this.dbInfo.categoryList));
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(Object.assign([], this.dbInfo.categoryList));
      }
    });
  }

  getGlobalCounts() {
    return new Promise((resolve, reject) => {
      if(typeof this.dbInfo.globalCounts === "undefined") {
        this.updateGlobals()
        .then(() => {
          resolve(Object.assign({}, this.dbInfo.globalCounts));
        })
        .catch((err) => {
          reject(err);
        });
      }
      else {
        // Info already exists, resolve with it
        resolve(Object.assign({}, this.dbInfo.globalCounts));
      }
    });
  }

  // getTokenByIdentifier
  // Returns a promise, fetches a token for the specified discord.js TextChannel object.
  // If no token exists, one will be requested from OpenTDB.
  // If tokenChannelID is undefined, the promise will automatically resolve with 'undefined'.
  getTokenByIdentifier(tokenChannelID) {
    return new Promise((resolve, reject) => {
      if(typeof tokenChannelID === "undefined") {
        // No token requested, return without one.
        resolve(void 0);
        return;
      }
      else if(typeof this.tokens[tokenChannelID] !== "undefined") {
        // Check if 6 hours have passed since the token was created.
        // If >6 hours have passed, we'll need to generate a new one.
        if(new Date().getTime() > this.tokens[tokenChannelID].time.getTime()+2.16e+7) {
          // Token already exists but is expired, delete it and generate a new one.
          delete this.tokens[tokenChannelID];
        }
        else {
          // Token already exists and is valid, return it and continue.
          resolve(this.tokens[tokenChannelID].token);
          return;
        }
      }

      // No token exists, so we'll generate one.
      this.parseURL(this.url + "/api_token.php?command=request")
      .then((res) => {
        var json;
        try {
          json = res.json();

          if(tokenContainer.response_code !== 0) {
            reject(new Error("Received response code " + tokenContainer.response_code + ": " + this.responses[tokenContainer.response_code]) + " while attempting to request a new token.");
          }
          else {
            this.tokens[tokenChannelID] = { token: tokenContainer.token, time: new Date() };
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
  }

  resetToken(token) {
    return new Promise((resolve, reject) => {
      this.parseURL(this.url + "/api_token.php?command=reset&token=" + token)
      .then((res) => {
        var json = res.json();

        if(json.response_code !== 0) {
          reject(new Error("Failed to reset token - received response code " + json.response_code + "(" + this.responses[json.response_code] + ")"));
          return;
        }

        resolve(json);
      })
      .catch((err) => {
        reject(err);
        return;
      });
    });
  }

  async fetchQuestions(options) {
    if(options.amount > 50) {
      throw new Error("Too many questions requested, amount must be 50 or less.");
    }

    var args = `?amount=${options.amount}`;

    if(typeof options.category !== "undefined") {
      args += `&category=${options.category}`;
    }

    if(typeof options.type !== "undefined") {
      args += `&type=${options.type}`;
    }

    if(typeof options.difficulty !== "undefined") {
      args += `&difficulty=${options.difficulty}`;
    }

    if(typeof options.token !== "undefined") {
      args += `&token=${options.token}`;
    }

    var json;
    json = await this.parseURL(this.url + `/api.php${args}`);
    if(json.response_code !== 0) {
      var error = new Error(this.responses[json.response_code]);
      error.code = json.response_code;
      error.args = args;

      throw error;
    }
    else {
      return json.results;
    }
  }
}

module.exports = OpenTDB;
