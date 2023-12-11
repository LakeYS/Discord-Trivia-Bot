const EventEmitter = require("events");

class InstanceUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "InstanceUnsupportedError";
  }
}

class TriviaInstance extends EventEmitter {
  embedCol = null;

  constructor(client) {
    super();
    this.client = client;
  }

  async send() {
    throw new InstanceUnsupportedError("Send is not supported on this platform.");
  }

  getConfig() {
    throw new InstanceUnsupportedError("getConfig is not supported on this platform.");
  }

  setConfigVal() {
    throw new InstanceUnsupportedError("setConfigVal is not supported on this platform.");
  }

  /**
   * Record a statistic.
   *
   * @param {string} stat The stat record name.
   * @param {string|number} value The stat value.
   */
  // eslint-disable-next-line no-unused-vars
  async postStat(stat, value) {
    throw new InstanceUnsupportedError("Stat posting is not supported on this platform.");
  }

  debugLog(str) {
    console.log(str);
  }
}

module.exports = TriviaInstance;