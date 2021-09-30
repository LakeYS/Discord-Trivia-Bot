const fetch = require("node-fetch");

class Listings {
  constructor(userId, shardIds) {
    this.data = {
      "discords.com": {
        url: `https://discords.com/bots/api/bot/${userId}/`
      },
      "discordlist.space": {
        url: `https://api.discordlist.space/v1/bots/${userId}/`
      },
      "discord.bots.gg": {
        url: `https://discord.bots.gg/api/v1/bots/${userId}/stats/`
      },
      "top.gg": {
        url: `https://top.gg/api/bots/${userId}/stats/`
      }
    };

    this.tokens = {};
    this.shardIds = shardIds;
  }

  setToken(site, token) {
    if(token === "optionaltokenhere") {
      return;
    }

    this.tokens[site] = token;
  }

  getListingData(site, guildCount, shardCount) {
    var data = {};
    data.url = this.data[site].url;

    switch(site) {
      case "discords.com":
        data.post = { server_count: guildCount };
        break;
      case "discord.bots.gg":
        data.post = { guildCount,  shardCount };
        break;
      case "top.gg":
        data.post = { server_count: guildCount, shards: shardCount };
        break;
      default:
        data.post = { server_count: guildCount };
    }

    return data;
  }

  // postToListing
  async postToListing(site, guildCount, shardCount) {
    var data = this.getListingData(site, guildCount, shardCount);

    try {
      var res = await fetch(this.data[site].url, {
        method: "post",
        body: JSON.stringify(data.post),
        headers: { "Content-Type": "application/json", "Authorization": this.tokens[site]}
      });
      var resString = JSON.stringify(await res.json());

      if(typeof res !== "undefined") {
        console.log(`Posted to site ${this.data[site].url}, received response: ${resString}`);
      }
    }
    catch(err) {
      console.log(`Error occurred while posting to ${this.data[site].url} on shard ${this.shardIds}:\n${err}`);

      if(typeof err.text !== "undefined") {
        console.log("Response included with the error: " + err.text);
      }
    }
  }

  async postBotStats(guildCount, shardCount) {
    if(guildCount > 1 && Object.keys(this.tokens).length > 0) {
      console.log("===== Posting guild count of\x1b[1m " + guildCount + "\x1b[0m =====");
    }
    else {
      return -1;
    }

    for(var site in this.data) {
      if(this.tokens[site] === null || typeof this.tokens[site] === "undefined") {
        continue;
      }

      this.postToListing(site, guildCount, shardCount);
    }
  }
}

module.exports = Listings;