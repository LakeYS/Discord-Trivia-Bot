const fetch = require("node-fetch");

class Listings {
  constructor(userId) {
    this.data = {
      "botsfordiscord.com": {
        url: `https://botsfordiscord.com/api/bot/${userId}/`
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
      case "botsfordiscord.com":
        data.post = { server_count: guildCount };
        break;
      case "discord.bots.gg":
        data.post = { guildCount: guildCount, shardCount: shardCount };
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
      })
      var resString = JSON.stringify(await res.json());

      if(typeof res !== "undefined") {
        console.log(`Posted to site ${this.data[site].url}, received response: ${resString}`);
      }
    }
    catch(err) {
      console.log(`Error occurred while posting to ${this.data[site].url} on shard ${global.client.shard.ids}:\n${err}`);

      if(typeof err.text !== "undefined") {
        console.log("Response included with the error: " + err.text);
      }
    }
  }

  async postBotStats(guildCount, shardCount) {
    if(guildCount > 1) {
      console.log("===== Posting guild count of\x1b[1m " + guildCount + "\x1b[0m =====");
    }

    for(var site in this.data) {
      if(this.tokens[site] === null) {
        continue;
      }

      this.postToListing(site, shardCount, guildCount);
    }
  }
}

module.exports = Listings;