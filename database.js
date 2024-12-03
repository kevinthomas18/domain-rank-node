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

    db.run(
      `CREATE TABLE IF NOT EXISTS Site_Audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            website_id INTEGER NOT NULL,
            audit_date_time TEXT DEFAULT CURRENT_TIMESTAMP,
            audit_by INTEGER NOT NULL,
            audit_status TEXT CHECK(audit_status IN ('Not started', 'In progress', 'Completed')) DEFAULT 'Not started',
            FOREIGN KEY (website_id) REFERENCES websites(id)
          )`,
      (err) => {
        if (err) {
          console.error("Error creating Site_Audits table:", err.message);
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS Site_Audit_Pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id INTEGER NOT NULL,
            crawl_status TEXT CHECK(crawl_status IN ('Not started', 'Completed')) DEFAULT 'Not started',
            url TEXT NOT NULL,
            linked_from TEXT,
            page_size INTEGER,
            response_time_ms INTEGER,
            found_in_crawl BOOLEAN,
            found_in_sitemap BOOLEAN,
            found_in_analytics BOOLEAN,
            found_in_search_console BOOLEAN,
            meta_title TEXT,
            meta_description TEXT,
            meta_keywords TEXT,
            FOREIGN KEY (audit_id) REFERENCES Site_Audits(id)
          )`,
      (err) => {
        if (err) {
          console.error("Error creating Site_Audit_Pages table:", err.message);
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS Site_Audit_Images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id INTEGER NOT NULL,
            crawl_status TEXT CHECK(crawl_status IN ('Not started', 'Completed')) DEFAULT 'Not started',
            image_url TEXT NOT NULL,
            linked_from TEXT,
            image_size INTEGER,
            alt_text TEXT,
            file_name TEXT,
            response_time_ms INTEGER,
            FOREIGN KEY (audit_id) REFERENCES Site_Audits(id)
          )`,
      (err) => {
        if (err) {
          console.error("Error creating Site_Audit_Images table:", err.message);
        }
      }
    );

    //scraping_jobs
    db.run(
      `CREATE TABLE IF NOT EXISTS scraping_jobs (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            website_id INTEGER NOT NULL,
            status TEXT,
            progress INTEGER,
            result TEXT
          )`,
      (err) => {
        if (err) {
          console.error("Error creating scraping_jobs table:", err.message);
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

    const showTableDataPretty = (tableName) => {
      db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) {
          console.error(
            `Error retrieving data from ${tableName}:`,
            err.message
          );
        } else {
          console.log(`\nData from ${tableName}:`);
          console.log(JSON.stringify(rows, null, 2)); // Pretty print with 2-space indentation
        }
      });
    };

    // db.all(`PRAGMA table_info(Site_Audit_Images);`, (err, rows) => {
    //   if (err) {
    //     console.error("Error fetching table info:", err.message);
    //   } else {
    //     console.table(rows);
    //   }
    // });

    // db.run("DELETE FROM scraping_jobs", (err) => {
    //   if (err) {
    //     console.error("Error deleting all records from scraping_jobs table:", err.message);
    //   } else {
    //     console.log("All records deleted from scraping_jobs table.");
    //   }
    // });

    //showTableData("users");
    //showTableData("projects");
    //showTableData("keywords");
    //showTableData("websites");
    //showTableData("Keyword_Website_mapping");
    //showTableData("rankhistory");
    //showTableData("Site_Audit_Pages");
    //showTableData("Site_Audit_Images");
    //showTableDataPretty("Site_Audits");
    //showTableDataPretty("users");
    //showTableData("scraping_jobs");
  }
});

module.exports = db;
