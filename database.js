const sqlite3 = require("sqlite3").verbose();

// Connect to SQLite database

const db = new sqlite3.Database("./database.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");

    // Create users table if it doesn't exist
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
      )`,
      (err) => {
        if (err) {
          console.error("Error creating users table:", err.message);
        }
      }
    );

    // Create projects table if it doesn't exist
    db.run(
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        domain_name TEXT,
        created_date TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        last_used_date TEXT,
        status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating projects table:", err.message);
        }
      }
    );

    // Create keywords table if it doesn't exist
    db.run(
      `CREATE TABLE IF NOT EXISTS keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        keyword TEXT,
        search_engine TEXT,
        search_location TEXT,
        latest_auto_search_rank INTEGER,
        latest_manual_check_rank INTEGER,
        created_date TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        last_checked_date TEXT,
        status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating keywords table:", err.message);
        }
      }
    );
  }
});

module.exports = db;
