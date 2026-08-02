const EventEmitter = require("events");

class ReplyProperties {
  /**
   * If true, send to the user in a direct or ephemeral message (depending
   * on which is available) as opposed to a direct in-line reply.
   *
   * @type {boolean}
   */
  direct;

  /**
   * If true, auto-deletion rules should not apply to this message.
   *
   * @type {boolean}
   */
  noAutoDelete;
}

class InstanceUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "InstanceUnsupportedError";
  }
}

class TriviaInstance extends EventEmitter {
  embedCol = null;

  /**
   * Create a new {@class TriviaInstance}
   * @param {unknown} client The primary platform client object.
   */
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

class TriviaInteraction {
  /**
   * @type {(msg: string | object) => void}
   */
  replyCallback;

  /**
   * Construct an interaction helper.
   *
   * @param {typeof this.replyCallback} replyCallback The reply callback to use.
   */
  constructor(replyCallback) {
    this.replyCallback = replyCallback;
  }

  /**
   * Respond to an interaction. Typically, this should call replyCallback and
   * return the result.
   *
   * @param {string} response The response to send.
   * @param {ReplyProperties} props Properties to apply to the response.
   */
  maybeReply(response, props) {
    throw new InstanceUnsupportedError("maybeReply is not supported on this platform.");
  }
}

module.exports = {ReplyProperties, TriviaInstance, TriviaInteraction};
