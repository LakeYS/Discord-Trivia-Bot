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

  async getCategories() {
    throw new Error("Not supported.");
  }

  async buildCategorySearchIndex() {
    this.categorySearchIndex = JSON.parse(JSON.stringify(await this.getCategories()));
  
    for(var el in this.categorySearchIndex) {
      var index = this.categorySearchIndex[el];
      index.indexName = index.name.toUpperCase().replace(":", "").replace(" AND ", " & ");
    }
  }
  
  // getCategoryFromStr
  // Returns a category based on the string specified. Returns undefined if no category is found.
  async getCategoryFromStr(str) {
    // Automatically give "invalid category" if query is shorter than 3 chars.
    if(str.length < 3) {
      return void 0;
    }
  
    // If we haven't already, initialize a category list index.
    if(typeof this.categorySearchIndex === "undefined") {
      await this.buildCategorySearchIndex();
    }
  
    var strCheck = str.toUpperCase().replace(":", "").replace(" AND ", " & ");
    return this.categorySearchIndex.find((el) => {
      return el.indexName.toUpperCase().includes(strCheck);
    });
  }
}

module.exports = Database;