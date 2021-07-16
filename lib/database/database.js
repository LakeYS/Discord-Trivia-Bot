const EventEmitter = require("events");
class Database extends EventEmitter {
  constructor() {
    super();
    
    this.responses = ["Success", "No results", "Invalid parameter", "Token not found", "Token empty"];
    this.types = { 1: "boolean", 3: "multiple" };
    this.difficulties = [ "easy", "medium", "hard" ];

    this.dbInfo = {};
    this.tokens = {};
  }
}

module.exports = Database;