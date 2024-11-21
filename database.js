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
        updated_by INTEGER, -- Add this line for updated_by
        last_used_date TEXT,
        status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (updated_by) REFERENCES users(id) -- Add this foreign key constraint 
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
            search_location TEXT,
            search_engine TEXT DEFAULT 'Google',
            created_date TEXT DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
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

    db.run(
      `CREATE TABLE IF NOT EXISTS rankhistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword_id INTEGER,
        website_id INTEGER,
        rank INTEGER,
        checked_date TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (keyword_id) REFERENCES keywords(id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating rankhistory table:", err.message);
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        website TEXT NOT NULL,
        ownership_type TEXT NOT NULL,
        website_type TEXT NOT NULL,
        created_date TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER NOT NULL,
        status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating websites table:", err.message);
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS Keyword_Website_mapping (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword_id INTEGER NOT NULL,
            website_id INTEGER NOT NULL,
            latest_auto_search_rank INTEGER,
            latest_manual_check_rank INTEGER,
            last_check_date TEXT,
            FOREIGN KEY (keyword_id) REFERENCES keywords(id),
            FOREIGN KEY (website_id) REFERENCES websites(id)
          )`,
      (err) => {
        if (err) {
          console.error(
            "Error creating Keyword_Website_mapping table:",
            err.message
          );
        }
      }
    );

    // Function to fetch and log data from a table
    const showTableData = (tableName) => {
      db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) {
          console.error(
            `Error retrieving data from ${tableName}:`,
            err.message
          );
        } else {
          console.log(`\nData from ${tableName}:`);
          console.table(rows);
        }
      });
    };

    // db.all(`PRAGMA table_info(rankhistory);`, (err, rows) => {
    //   if (err) {
    //     console.error("Error fetching table info:", err.message);
    //   } else {
    //     console.table(rows);
    //   }
    // });

    // showTableData("users");
    //showTableData("projects");
    //showTableData("keywords");
    //showTableData("websites");
    //showTableData("Keyword_Website_mapping");
    //showTableData("rankhistory");
  }
});

module.exports = db;
