const { Client } = require('pg');

class database {
  constructor(config) {
    console.log('DB : Connecting');
    this.config = config;
    this.client = new Client({ ssl: { rejectUnauthorized: false }, ...config });
    this.client.connect();
  }

  connect() {
    return this.client.connect();
  }

  close() {
    console.log('DB : Closing');
    return this.client.end();
  }

  query(query) {
    return this.client.query(query);
  }
}

module.exports = database;
