/**
 * Database - Knex.js MySQL connection pool manager
 *
 * Provides a singleton database connection pool for all modules.
 * Handles connection lifecycle and provides query methods.
 */

const knex = require("knex");
const config = require("config");

class Database {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize the database connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.pool) {
      return;
    }

    const dbConfig = config.get("modules.database");

    // Create a deep copy of config to avoid frozen object issues with Knex
    const knexConfig = {
      client: dbConfig.client,
      connection: JSON.parse(JSON.stringify(dbConfig.connection)),
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
      },
      debug: false,
    };

    this.pool = knex(knexConfig);

    // Test connection
    try {
      await this.pool.raw("SELECT 1");
      console.log("Database connection established");
    } catch (error) {
      console.error("Database connection failed:", error);
      throw error;
    }
  }

  /**
   * Get the knex instance
   * @returns {Knex} The knex instance
   */
  getConnection() {
    if (!this.pool) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.pool;
  }

  /**
   * Close the database connection pool
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
      console.log("Database connection closed");
    }
  }

  /**
   * Execute a raw query
   * @param {string} sql - The SQL query
   * @param {Array} bindings - The query bindings
   * @returns {Promise<any>}
   */
  async raw(sql, bindings = []) {
    return this.getConnection().raw(sql, bindings);
  }

  /**
   * Insert a record
   * @param {string} table - The table name
   * @param {Object} data - The data to insert
   * @returns {Promise<number>} The inserted ID
   */
  async insert(table, data) {
    const [id] = await this.getConnection()(table).insert(data);
    return id;
  }

  /**
   * Insert multiple records
   * @param {string} table - The table name
   * @param {Array} data - The array of data to insert
   * @returns {Promise<Array>} The inserted IDs
   */
  async batchInsert(table, data) {
    return this.getConnection()(table).insert(data);
  }

  /**
   * Upsert a record (insert or update on duplicate key)
   * @param {string} table - The table name
   * @param {Object} data - The data to upsert
   * @param {string} uniqueKey - The unique key column
   * @returns {Promise<number>} The affected row count
   */
  async upsert(table, data, uniqueKey = "device_id") {
    const connection = this.getConnection();

    // DEBUG: Log upsert parameters
    console.log("[Database] upsert called with:");
    console.log("  table:", table);
    console.log("  data keys:", Object.keys(data));
    console.log("  data values:", Object.values(data));
    console.log("  uniqueKey:", uniqueKey);

    const bindings = [table, ...Object.values(data)];
    console.log("  bindings array:", bindings);

    const result = await connection.raw(
      `
      INSERT INTO ?? (${Object.keys(data).join(", ")})
      VALUES (${Object.keys(data)
        .map(() => "?")
        .join(", ")})
      ON DUPLICATE KEY UPDATE
        ${Object.keys(data)
          .filter((k) => k !== uniqueKey)
          .map((k) => `${k} = VALUES(${k})`)
          .join(", ")}
    `,
      bindings,
    );

    return result[0].affectedRows;
  }

  /**
   * Select records
   * @param {string} table - The table name
   * @param {Object} where - The where clause
   * @param {Array} columns - The columns to select
   * @returns {Promise<Array>} The selected records
   */
  async select(table, where = {}, columns = ["*"]) {
    return this.getConnection()(table).select(columns).where(where);
  }

  /**
   * Select a single record
   * @param {string} table - The table name
   * @param {Object} where - The where clause
   * @param {Array} columns - The columns to select
   * @returns {Promise<Object|null>} The selected record or null
   */
  async selectOne(table, where = {}, columns = ["*"]) {
    const result = await this.getConnection()(table)
      .select(columns)
      .where(where)
      .first();
    return result || null;
  }

  /**
   * Update records
   * @param {string} table - The table name
   * @param {Object} data - The data to update
   * @param {Object} where - The where clause
   * @returns {Promise<number>} The affected row count
   */
  async update(table, data, where) {
    return this.getConnection()(table).where(where).update(data);
  }

  /**
   * Delete records
   * @param {string} table - The table name
   * @param {Object} where - The where clause
   * @returns {Promise<number>} The affected row count
   */
  async delete(table, where) {
    return this.getConnection()(table).where(where).del();
  }

  /**
   * Begin a transaction
   * @returns {Promise<Knex.Transaction>} The transaction object
   */
  async beginTransaction() {
    return this.getConnection().transaction();
  }
}

// Singleton instance
const database = new Database();

module.exports = database;
