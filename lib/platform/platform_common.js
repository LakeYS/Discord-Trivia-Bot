const EventEmitter = require("events");

class PlatformUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlatformUnsupportedError";
  }
}

class TriviaPlatform extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
  }

  async send() {
    throw new PlatformUnsupportedError("Send is not supported on this platform.");
  }

  getConfigVal() {
    throw new PlatformUnsupportedError("getConfigVal is not supported on this platform.");
  }

  setConfigVal() {
    throw new PlatformUnsupportedError("setConfigVal is not supported on this platform.");
  }

  async postStat() {
    throw new PlatformUnsupportedError("Stat posting is not supported on this platform.");
  }

  debugLog(str) {
    console.log(str);
  }
}

module.exports = TriviaPlatform;