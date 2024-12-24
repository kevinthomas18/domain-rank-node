require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const Queue = require("bull");
//const scrapeQueue = new Queue("scrapeQueue");
const scrapeQueue = new Queue("scrapeQueue", {
  redis: {
    host: process.env.REDISCLOUD_HOST,
    port: process.env.REDISCLOUD_PORT,
    password: process.env.REDISCLOUD_PASSWORD,
  },
});

const redis = require("redis");
//const client = redis.createClient();

const { imageSize } = require("image-size");

const jwt = require("jsonwebtoken");
const db = require("./database");
const app = express();
const PORT = 4000;
const SECRET_KEY = process.env.SECRET_KEY;

// const http = require("http");
// const { Server } = require("socket.io");

// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: "http://localhost:3000",
//     methods: ["GET", "POST"],
//   },
// });

app.use(
  cors({
    origin: ["http://localhost:3000", "https://domain-rank-client.vercel.app"],
    methods: "GET,POST,PUT,PATCH,DELETE",
    credentials: true,
  })
);

// Middleware to parse JSON requests
//app.use(express.json());
app.use(express.json({ limit: "50mb" }));

// Configure the email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "notifications-no-reply@spiderworks.info",
    pass: process.env.EMAIL_PASS,
  },
});

// Generate a secure OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

//Add a New User
app.post("/add-auth-user", (req, res) => {
  const { name, email, userType, createdById } = req.body;

  if (!name || !email || !userType) {
    return res
      .status(400)
      .json({ message: "Name, email, and user type are required" });
  }

  db.run(
    `INSERT INTO auth_users (name, email, user_type, created_by_id) VALUES (?, ?, ?, ?)`,
    [name, email, userType, createdById || null],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ message: "Failed to add user", error: err.message });
      }
      res
        .status(200)
        .json({ message: "User added successfully", userId: this.lastID });
    }
  );
});

//Request OTP
app.post("/request-auth-otp", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // Check if the user exists and is active
  db.get(
    `SELECT * FROM auth_users WHERE email = ? AND status = 'active'`,
    [email],
    (err, user) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Database error", error: err.message });
      }

      if (!user) {
        return res
          .status(404)
          .json({ message: "User not found or is not active" });
      }

      // Generate OTP and update the database
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // Valid for 5 minutes

      db.run(
        `UPDATE auth_users SET otp = ?, otp_expiry = ? WHERE email = ?`,
        [otp, otpExpiry.toISOString(), email],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ message: "Failed to update OTP", error: err.message });
          }

          // Send OTP email
          transporter.sendMail(
            {
              from: "notifications-no-reply@spiderworks.info",
              to: email,
              subject: "Your OTP for Login",
              text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
            },
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ message: "Failed to send OTP", error: err.message });
              }
              res.status(200).json({ message: "OTP sent successfully" });
            }
          );
        }
      );
    }
  );
});

//OTP Login Route
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  const query = `SELECT * FROM auth_users WHERE email = ? AND otp = ? AND otp_expiry > ?`;
  db.get(query, [email, otp, new Date().toISOString()], (err, user) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Database error", message: err.message });
    }
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      SECRET_KEY,
      { expiresIn: "24h" }
    );

    // Clear OTP
    db.run(`UPDATE auth_users SET otp = NULL, otp_expiry = NULL WHERE id = ?`, [
      user.id,
    ]);

    res.status(200).json({
      message: "Login successful",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: token,
      },
    });
  });
});

// Route to add a new user
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    db.run(query, [name, email, hashedPassword], function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({ id: this.lastID, name, email });
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Route to login user (email & password check with hashing)
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const query = `SELECT * FROM users WHERE email = ?`;

  db.get(query, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (user && (await bcrypt.compare(password, user.password))) {
      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        SECRET_KEY,
        { expiresIn: "24h" } // Token expiration
      );
      res.json({
        message: "Login successful",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: token,
        },
      });
    } else {
      res.status(400).json({ error: "Invalid email or password" });
    }
  });
});
// Example route to get user info (protected with JWT)
app.get("/profile", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Access denied" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    res.json({ message: "Protected data", user: decoded });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Middleware to verify JWT and extract the `created_by` value
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied, no token provided" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token..." });
  }
};

// --- Project Routes ---

// Route to add a new project (with user info from JWT)
app.post("/projects", verifyToken, (req, res) => {
  const { name, domain_name, status = "Active" } = req.body;
  const { id: created_by } = req.user; // Get user ID from the decoded JWT (stored in req.user)

  const query = `
      INSERT INTO projects (name, domain_name, created_by, status) 
      VALUES (?, ?, ?, ?)
    `;

  db.run(query, [name, domain_name, created_by, status], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({
      message: "Project created successfully",
      project: {
        id: this.lastID,
        name,
        domain_name,
        created_by,
        status,
      },
    });
  });
});

// Route to get all projects
app.get("/projects", verifyToken, (req, res) => {
  const query = `SELECT * FROM projects`;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Route to get a specific project by ID
app.get("/projects/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const query = `SELECT * FROM projects WHERE id = ?`;

  db.get(query, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(row);
  });
});

// Route to edit an existing project
app.put("/projects/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const { name, domain_name, status } = req.body;
  const { id: updated_by } = req.user;

  //console.log("Incoming request body:", req.body);

  const query = `
    UPDATE projects 
    SET name = ?, domain_name = ?, status = ?, updated_by = ?, last_used_date = CURRENT_TIMESTAMP
    WHERE id = ?;
  `;

  db.run(query, [name, domain_name, status, updated_by, id], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      message: "Project updated successfully",
      project: {
        id,
        name,
        domain_name,
        status,
        updated_by,
      },
    });
  });
});

// Route to delete a project
app.delete("/projects/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM projects WHERE id = ?`;

  db.run(query, [id], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ message: "Project deleted successfully" });
  });
});

// Route to add a new keyword
app.post("/keywords", verifyToken, (req, res) => {
  const {
    project_id,
    keyword,
    search_engine,
    search_location = "Default Location",
    status = "Active", // Default value
  } = req.body;

  const { id: created_by } = req.user;

  const query = `
    INSERT INTO keywords (
      project_id, keyword, search_engine, search_location, created_by, status
    ) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(
    query,
    [project_id, keyword, search_engine, search_location, created_by, status],
    function (err) {
      if (err) {
        return res
          .status(400)
          .json({ error: "Database error: " + err.message });
      }

      res.json({
        message: "Keyword created successfully",
        keyword: {
          id: this.lastID,
          project_id,
          keyword,
          search_engine,
          search_location,
          created_by,
          status,
          created_date: new Date().toISOString(),
        },
      });
    }
  );
});

// Route to get all keywords for a specific project
app.get("/keywords/:project_id", verifyToken, (req, res) => {
  const { project_id } = req.params;

  const query = `
      SELECT * FROM keywords WHERE project_id = ?
    `;

  db.all(query, [project_id], (err, rows) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No keywords found for this project." });
    }

    res.json({
      message: "Keywords retrieved successfully ",
      keywords: rows,
    });
  });
});

//updating  the latest_manual_check_rank
app.put("/keywords/:id", verifyToken, (req, res) => {
  const { id: keyword_id } = req.params;
  const { website_id, latest_manual_check_rank } = req.body;

  if (
    latest_manual_check_rank === undefined ||
    isNaN(latest_manual_check_rank)
  ) {
    return res
      .status(400)
      .json({ message: "latest_manual_check_rank must be a valid integer." });
  }

  if (!website_id || isNaN(website_id)) {
    return res
      .status(400)
      .json({ message: "website_id must be a valid integer." });
  }

  // Query to check if the mapping already exists
  const checkQuery = `
    SELECT id FROM Keyword_Website_mapping 
    WHERE keyword_id = ? AND website_id = ?
  `;

  db.get(checkQuery, [keyword_id, website_id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (row) {
      // If row exists, update the entry
      const updateQuery = `
        UPDATE Keyword_Website_mapping 
        SET latest_manual_check_rank = ?, last_check_date = CURRENT_TIMESTAMP
        WHERE keyword_id = ? AND website_id = ?
      `;

      db.run(
        updateQuery,
        [latest_manual_check_rank, keyword_id, website_id],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ error: "Database error while updating: " + err.message });
          }

          res.json({
            message: "Mapping updated successfully",
            mapping: {
              id: row.id,
              keyword_id,
              website_id,
              latest_manual_check_rank,
            },
          });
        }
      );
    } else {
      // If row does not exist, insert a new mapping
      const insertQuery = `
        INSERT INTO Keyword_Website_mapping (
          keyword_id, website_id, latest_manual_check_rank, last_check_date
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;

      db.run(
        insertQuery,
        [keyword_id, website_id, latest_manual_check_rank],
        function (err) {
          if (err) {
            return res.status(500).json({
              error: "Database error while inserting: " + err.message,
            });
          }

          res.json({
            message: "Mapping added successfully",
            mapping: {
              id: this.lastID,
              keyword_id,
              website_id,
              latest_manual_check_rank,
            },
          });
        }
      );
    }
  });
});

// updating the latest_auto_check_rank
// app.put("/keywordsauto/:id", verifyToken, (req, res) => {
//   const { id: keyword_id } = req.params;
//   const { website_id, latest_auto_search_rank } = req.body;

//   if (latest_auto_search_rank === undefined || isNaN(latest_auto_search_rank)) {
//     return res
//       .status(400)
//       .json({ message: "latest_auto_search_rank must be a valid integer." });
//   }

//   if (!website_id || isNaN(website_id)) {
//     return res
//       .status(400)
//       .json({ message: "website_id must be a valid integer." });
//   }

//   const checkQuery = `
//     SELECT id FROM Keyword_Website_mapping
//     WHERE keyword_id = ? AND website_id = ?
//   `;

//   db.get(checkQuery, [keyword_id, website_id], (err, row) => {
//     if (err) {
//       return res.status(500).json({ error: "Database error: " + err.message });
//     }

//     if (row) {
//       const updateQuery = `
//         UPDATE Keyword_Website_mapping
//         SET latest_auto_search_rank = ?, last_check_date = CURRENT_TIMESTAMP
//         WHERE keyword_id = ? AND website_id = ?
//       `;

//       db.run(
//         updateQuery,
//         [latest_auto_search_rank, keyword_id, website_id],
//         function (err) {
//           if (err) {
//             return res
//               .status(500)
//               .json({ error: "Database error while updating: " + err.message });
//           }

//           res.json({
//             message: "Mapping updated successfully",
//             mapping: {
//               id: row.id,
//               keyword_id,
//               website_id,
//               latest_auto_search_rank,
//             },
//           });
//         }
//       );
//     } else {
//       const insertQuery = `
//         INSERT INTO Keyword_Website_mapping (
//           keyword_id, website_id, latest_auto_search_rank, last_check_date
//         )
//         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
//       `;

//       db.run(
//         insertQuery,
//         [keyword_id, website_id, latest_auto_search_rank],
//         function (err) {
//           if (err) {
//             return res.status(500).json({
//               error: "Database error while inserting: " + err.message,
//             });
//           }

//           res.json({
//             message: "Mapping added successfully",
//             mapping: {
//               id: this.lastID,
//               keyword_id,
//               website_id,
//               latest_auto_search_rank,
//             },
//           });
//         }
//       );
//     }
//   });
// });

// updating the latest_auto_check_rank and also populating the rankhistory table
app.put("/keywordsauto/:id", verifyToken, (req, res) => {
  const { id: keyword_id } = req.params;
  let { website_id, latest_auto_search_rank } = req.body;

  if (latest_auto_search_rank === undefined || isNaN(latest_auto_search_rank)) {
    latest_auto_search_rank = -1; // Set to -1 if invalid
  }

  if (!website_id || isNaN(website_id)) {
    return res
      .status(400)
      .json({ message: "website_id must be a valid integer." });
  }

  const checkQuery = `
    SELECT id FROM Keyword_Website_mapping 
    WHERE keyword_id = ? AND website_id = ?
  `;

  db.get(checkQuery, [keyword_id, website_id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    const updateRankHistory = (callback) => {
      const insertRankHistoryQuery = `
        INSERT INTO rankhistory (keyword_id, website_id, rank, checked_date)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;

      db.run(
        insertRankHistoryQuery,
        [keyword_id, website_id, latest_auto_search_rank],
        (err) => {
          if (err) {
            return res.status(500).json({
              error:
                "Database error while updating rankhistory: " + err.message,
            });
          }
          callback();
        }
      );
    };

    if (row) {
      const updateQuery = `
        UPDATE Keyword_Website_mapping 
        SET latest_auto_search_rank = ?, last_check_date = CURRENT_TIMESTAMP
        WHERE keyword_id = ? AND website_id = ?
      `;

      db.run(
        updateQuery,
        [latest_auto_search_rank, keyword_id, website_id],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ error: "Database error while updating: " + err.message });
          }

          updateRankHistory(() => {
            res.json({
              message: "Mapping updated and rankhistory recorded successfully",
              mapping: {
                id: row.id,
                keyword_id,
                website_id,
                latest_auto_search_rank,
              },
            });
          });
        }
      );
    } else {
      const insertQuery = `
        INSERT INTO Keyword_Website_mapping (
          keyword_id, website_id, latest_auto_search_rank, last_check_date
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;

      db.run(
        insertQuery,
        [keyword_id, website_id, latest_auto_search_rank],
        function (err) {
          if (err) {
            return res.status(500).json({
              error: "Database error while inserting: " + err.message,
            });
          }

          updateRankHistory(() => {
            res.json({
              message: "Mapping added and rankhistory recorded successfully",
              mapping: {
                id: this.lastID,
                keyword_id,
                website_id,
                latest_auto_search_rank,
              },
            });
          });
        }
      );
    }
  });
});

//update status of keyword
app.put("/keywords/:id/status", verifyToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["Active", "Inactive"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  const query = `
    UPDATE keywords
    SET status = ?
    WHERE id = ?
  `;

  db.run(query, [status, id], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: "Keyword not found." });
    }

    res.json({ message: `Keyword status updated to ${status}` });
  });
});

// Route to delete a keyword by its ID
app.delete("/keywords/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  const query = `
    DELETE FROM keywords WHERE id = ?
  `;

  db.run(query, [id], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: "Keyword not found." });
    }

    res.json({ message: "Keyword deleted successfully" });
  });
});

//route to join keywords and rank route
app.get(
  "/ranks/project/:project_id/website/:website_id",
  verifyToken,
  (req, res) => {
    const { project_id, website_id } = req.params;

    if (isNaN(project_id) || isNaN(website_id)) {
      return res
        .status(400)
        .json({ message: "project_id and website_id must be valid integers." });
    }

    const query = `
    SELECT 
      k.id AS keyword_id,
      k.keyword,
      k.project_id,
      k.search_location,
      k.search_engine,
      k.status AS keyword_status,
      k.created_date AS keyword_created_date,
      kwm.latest_auto_search_rank,
      kwm.latest_manual_check_rank,
      kwm.last_check_date
    FROM keywords AS k
    LEFT JOIN Keyword_Website_mapping AS kwm
      ON k.id = kwm.keyword_id
      AND kwm.website_id = ?
    WHERE k.project_id = ?
  `;

    db.all(query, [website_id, project_id], (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "Database error: " + err.message });
      }

      if (rows.length === 0) {
        return res.status(404).json({
          message: "No records found for the given project_id and website_id.",
        });
      }

      res.json({
        message: "Ranks fetched successfully",
        data: rows,
      });
    });
  }
);

//route to retrieves all keywords for a specific project along with their corresponding rank for each website
app.get("/project/:projectId/keywords", (req, res) => {
  const projectId = req.params.projectId;

  const query = `
    SELECT 
      k.id AS keyword_id,
      k.keyword,
      k.search_location,
      k.search_engine,
      w.id AS website_id,
      w.website,
      w.ownership_type,
      w.website_type,
      kwm.latest_auto_search_rank,
      kwm.latest_manual_check_rank,
      kwm.last_check_date
    FROM keywords k
    INNER JOIN Keyword_Website_mapping kwm ON k.id = kwm.keyword_id
    INNER JOIN websites w ON kwm.website_id = w.id
    WHERE k.project_id = ?
    ORDER BY k.keyword, w.website;
  `;

  db.all(query, [projectId], (err, rows) => {
    if (err) {
      console.error("Error fetching keywords:", err.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }
    res.json(rows);
  });
});

//route to add new website
app.post("/websites", verifyToken, (req, res) => {
  const {
    project_id,
    website,
    ownership_type,
    website_type,
    status = "Active",
  } = req.body;
  const { id: created_by } = req.user;

  if (!project_id || !website || !ownership_type || !website_type) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = `
    INSERT INTO websites (project_id, website, ownership_type, website_type, created_by, status) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(
    query,
    [project_id, website, ownership_type, website_type, created_by, status],
    function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({
        message: "Website added successfully",
        website: {
          id: this.lastID,
          project_id,
          website,
          ownership_type,
          website_type,
          created_by,
          status,
        },
      });
    }
  );
});

// Route to get all websites for a specific project
app.get("/websites/:project_id", verifyToken, (req, res) => {
  const { project_id } = req.params;

  const query = `
      SELECT * FROM websites WHERE project_id = ?
    `;

  db.all(query, [project_id], (err, rows) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No websites found for this project." });
    }

    res.json({
      message: "websites retrieved successfully ",
      websites: rows,
    });
  });
});

//update status of website
app.put("/website/:id/status", verifyToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["Active", "Inactive"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  const query = `
    UPDATE websites
    SET status = ?
    WHERE id = ?
  `;

  db.run(query, [status, id], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: "Website not found." });
    }

    res.json({ message: `Website status updated to ${status}` });
  });
});

// Route to get rank and date by keyword_id and website_id
app.get("/rankhistory/:keywordId/:websiteId", (req, res) => {
  const { keywordId, websiteId } = req.params;

  const query = `
    SELECT rank, checked_date 
    FROM rankhistory 
    WHERE keyword_id = ? AND website_id = ?
  `;

  db.all(query, [keywordId, websiteId], (err, row) => {
    if (err) {
      console.error("Error fetching data:", err.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (!row) {
      return res.status(404).json({
        message: "No record found for the given keyword and website.",
      });
    }

    res.json(row);
  });
});

//route and function for site audit
let uniqueLinks = new Set();
let uniqueImages = new Set();

app.get("/scrape", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const baseDomain = new URL(url).hostname; // Extract base domain
    const results = await scrapeAllPages(url, baseDomain);

    // Return scraped results
    res.status(200).json({
      uniqueLinks: Array.from(uniqueLinks), // Convert Set to Array
      uniqueImages: Array.from(uniqueImages), // Convert Set to Array
      pages: results, // Detailed page-wise scraping results
    });
  } catch (error) {
    console.error("Error scraping website:", error.message);
    res.status(500).json({ error: "Failed to scrape website." });
  }
});

//scrape all the pages
const scrapeAllPages = async (
  startUrl,
  baseDomain,
  websiteId,
  auditBy, // Used as jobId
  progressCallback
) => {
  const queue = [{ url: startUrl, parent: null }]; // Include parent URL
  const scrapedData = [];
  const visitedUrls = new Set();
  const uniqueImageUrls = new Set(); // Tracks unique image URLs
  const uniqueImages = []; // Store unique images with metadata
  const errorLogs = []; // To store errors

  // Helper function to fetch image dimensions
  const getImageSize = async (imageUrl) => {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });

      const sizeInBytes = response.data.length; // Get size in bytes
      const sizeInKB = (sizeInBytes / 1024).toFixed(2); // Convert to KB with 2 decimal places
      const sizeInMB = (sizeInKB / 1024).toFixed(2); // Convert to MB with 2 decimal places

      const dimensions = imageSize(response.data); // Use the image-size package
      return {
        width: dimensions.width,
        height: dimensions.height,
        sizeInBytes,
        sizeInKB,
        sizeInMB,
      };
    } catch (err) {
      console.error(
        `Error fetching image size for ${imageUrl}: ${err.message}`
      );
      return {
        width: null,
        height: null,
        sizeInBytes: null,
        sizeInKB: null,
        sizeInMB: null,
      };
    }
  };

  while (queue.length > 0) {
    const { url: currentUrl, parent: parentUrl } = queue.shift();

    if (visitedUrls.has(currentUrl)) continue;
    visitedUrls.add(currentUrl);

    try {
      const { data: html } = await axios.get(currentUrl);
      const $ = cheerio.load(html);

      const title = $("title").text();
      const metaTags = {};
      $("meta").each((_, el) => {
        const name = $(el).attr("name") || $(el).attr("property");
        const content = $(el).attr("content");
        if (name && content) metaTags[name] = content;
      });

      const links = [];
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          if (href.includes("#") || href.trim() === "") {
            return; // Skip this link
          }
          const resolvedUrl = new URL(href, currentUrl).href;

          if (
            !visitedUrls.has(resolvedUrl) &&
            isSameDomain(resolvedUrl, baseDomain)
          ) {
            links.push(resolvedUrl);
            queue.push({ url: resolvedUrl, parent: currentUrl }); // Track parent URL
          }
        }
      });

      const images = [];
      $("img").each(async (_, el) => {
        const src = $(el).attr("src");
        const alt = $(el).attr("alt") || ""; // Get alt text
        if (src) {
          const resolvedImage = new URL(src, currentUrl).href;

          // Only add unique images
          if (!uniqueImageUrls.has(resolvedImage)) {
            uniqueImageUrls.add(resolvedImage);

            const size = await getImageSize(resolvedImage);
            const imageData = {
              url: resolvedImage,
              altText: alt,
              width: size.width,
              height: size.height,
              sizeInBytes: size.sizeInBytes,
              sizeInKB: size.sizeInKB,
              sizeInMB: size.sizeInMB,
            };

            uniqueImages.push(imageData); // Add to uniqueImages array
            images.push(imageData); // Add to current page's images
          }
        }
      });

      const favicon = $('link[rel="icon"]').attr("href");
      const canonical = $('link[rel="canonical"]').attr("href");

      scrapedData.push({
        url: currentUrl,
        parentUrl,
        title,
        metaTags,
        links,
        images,
        favicon: favicon ? new URL(favicon, currentUrl).href : null,
        canonical,
      });

      if (progressCallback) {
        progressCallback(scrapedData, queue.length);
      }
    } catch (error) {
      console.error(`Failed to scrape ${currentUrl}: ${error.message}`);
      errorLogs.push({ url: currentUrl, parentUrl, error: error.message }); // Log errors
    }
  }

  await saveAuditData(websiteId, auditBy, {
    uniqueLinks: Array.from(visitedUrls),
    uniqueImages,
    pages: scrapedData,
    errors: errorLogs, // Include errors in saved data
  });

  try {
    await updateJobStatus(
      websiteId,
      visitedUrls,
      uniqueImages,
      scrapedData,
      auditBy,
      errorLogs // Pass error logs
    );
  } catch (error) {
    console.error("Failed to update job status:", error.message);
  }

  return {
    uniqueLinks: Array.from(visitedUrls),
    uniqueImages,
    pages: scrapedData,
    errors: errorLogs,
  };
};

//update the row where id = auditBy
const updateJobStatus = async (
  websiteId,
  uniqueLinks,
  uniqueImages,
  scrapedData,
  jobId,
  errorLogs // Add error logs
) => {
  const query = `
    UPDATE scraping_jobs
    SET
      status = $2,
      progress = $3,
      result = $4,
      errors = $5, -- Update the errors field
      url = $6
    WHERE job_id = $1;
  `;

  const resultData = {
    uniqueLinks: Array.from(uniqueLinks),
    uniqueImages: Array.from(uniqueImages),
    pages: scrapedData.map((page) => ({
      url: page.url,
      parentUrl: page.parentUrl, // Include parent URL
      title: page.title,
      metaTags: page.metaTags,
      links: page.links,
      images: page.images,
      favicon: page.favicon,
      canonical: page.canonical,
    })),
  };

  const values = [
    jobId,
    "completed",
    100,
    JSON.stringify(resultData),
    JSON.stringify(errorLogs), // Save error logs as JSON
    scrapedData[0] ? scrapedData[0].url : null, // Use the first scraped URL as representative
  ];

  try {
    const res = await new Promise((resolve, reject) => {
      db.run(query, values, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });

    if (res > 0) {
      console.log(
        `Job updated successfully for websiteId ${websiteId} with jobId ${jobId}`
      );
    } else {
      console.log(`No job found with jobId ${jobId}.`);
    }
  } catch (error) {
    console.error("Failed to update job status:", error.message);
  }
};

// Utility function to check if the link is within the same domain
const isSameDomain = (url, baseDomain) => {
  try {
    const targetDomain = new URL(url).hostname;
    return targetDomain.endsWith(baseDomain); // Match subdomains
  } catch {
    return false;
  }
};

//background work test
// Add a job to the scrape queue
app.post("/scrape", async (req, res) => {
  const { url, websiteId } = req.body;

  if (!url || !websiteId) {
    return res.status(400).json({ error: "URL and websiteId are required" });
  }

  // Enqueue the scrape task with the provided websiteId
  const job = await scrapeQueue.add({ url, websiteId });
  //console.log(url, websiteId);
  res.status(202).json({
    message: "Scraping task has been started.",
    jobId: job.id, // Return the job ID for tracking
  });
});

// Job processing
scrapeQueue.process(async (job) => {
  const { url, websiteId } = job.data;
  const baseDomain = new URL(url).hostname;

  const auditBy = job.id; // Use the job ID as an identifier for the audit

  // console.log(
  //   `Before processing, job ${job.id} isCompleted: ${await job.isCompleted()}`
  // );

  // console.log(`Processing job for URL: ${url} with Website ID: ${websiteId}`);

  try {
    let totalScraped = 0;
    let totalUrls = 1; // Start with 1 to avoid division by zero

    // Function to update progress

    // Function to update progress
    const updateProgress = (scrapedData, queueSize) => {
      // Debugging: Check the contents of scrapedData and queueSize

      // Should be an array
      //console.log("Queue Size: ", queueSize);

      const totalScraped = scrapedData.length;
      const totalUrls = totalScraped + queueSize;

      // Handle case where totalUrls is zero to avoid NaN
      if (totalUrls === 0) totalUrls = 1;

      const progress = Math.min(
        ((totalScraped / totalUrls) * 100).toFixed(2),
        100
      );
      //console.log(`Total Scraped: ${totalScraped}, Total URLs: ${totalUrls}`);
      job.progress(progress); // Update progress in the job
      //console.log(`Progress for Job ${job.id}: ${progress}%`);
    };
    // Perform the scraping and database saving
    const results = await scrapeAllPages(
      url,
      baseDomain,
      websiteId,
      auditBy,
      updateProgress
    );

    console.log(
      `Scraping and database operations for Job ${job.id} completed.`
    );

    // Return the results to store in Bull's job.returnvalue
    return {
      uniqueLinks: results.uniqueLinks,
      uniqueImages: results.uniqueImages,
      pages: results.pages,
      errors: results.errors,
    };
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error.message);
    throw new Error("Scraping and saving data failed.");
  }
});

// Job completion listener
scrapeQueue.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed successfully.`);

  // Optionally, store or process the result
});

// Job failure listener
scrapeQueue.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

// Job status route
app.get("/job-status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await scrapeQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    const progress = job.progress();
    const returnValue = await job.returnvalue; // Await the returnvalue explicitly
    const isCompleted = job.isCompleted() && returnValue != null; // Check if job is completed and result is valid

    if (isCompleted) {
      return res.json({
        status: "completed",
        result: returnValue, // Return the result if it exists
        progress: job.progress(),
      });
    } else if (job.isFailed()) {
      return res.json({
        status: "in-progress", //failed
        error: job.failedReason,
        progress: job.progress(),
      });
    } else {
      // Show progress while the job is in progress
      return res.json({
        status: "in-progress",
        progress: job.progress(),
      });
    }
  } catch (error) {
    console.error("Error fetching job status:", error.message);
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

//save to db
const saveAuditData = async (websiteId, auditBy, scrapedData) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `INSERT INTO Site_Audits (website_id, audit_by, audit_status) VALUES (?, ?, ?)`,
        [websiteId, auditBy, "Completed"],
        function (err) {
          if (err) {
            console.error("Error inserting into Site_Audits:", err.message);
            return reject(err);
          }

          const auditId = this.lastID;

          const insertPages = scrapedData.pages.map(
            (page) =>
              new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO Site_Audit_Pages (audit_id, url, crawl_status, linked_from, page_size, response_time_ms, found_in_crawl, meta_title, meta_description, meta_keywords) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    auditId,
                    page.url,
                    "Completed",
                    page.linked_from || null,
                    page.page_size || null,
                    page.response_time_ms || null,
                    true,
                    page.title || null,
                    page.metaTags?.Description || null,
                    page.metaTags?.Keywords || null,
                  ],
                  (err) => {
                    if (err) return reject(err);
                    resolve();
                  }
                );
              })
          );

          const insertImages = scrapedData.uniqueImages.map(
            (image) =>
              new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO Site_Audit_Images (audit_id, image_url, crawl_status, linked_from, image_size, alt_text, file_name, response_time_ms) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    auditId,
                    image,
                    "Completed",
                    image.linked_from || null,
                    image.size || null,
                    image.alt_text || null,
                    image.file_name || null,
                    image.response_time_ms || null,
                  ],
                  (err) => {
                    if (err) return reject(err);
                    resolve();
                  }
                );
              })
          );

          Promise.all([...insertPages, ...insertImages])
            .then(() => resolve())
            .catch((err) => reject(err));
        }
      );
    });
  });
};

//Save Jobs API
app.post("/scraping-jobs", async (req, res) => {
  const { jobs } = req.body;

  // Check for missing websiteId
  const invalidJobs = jobs.filter((job) => !job.websiteId);
  if (invalidJobs.length > 0) {
    return res.status(400).json({
      message: "Invalid job data: Missing websiteId",
      invalidJobs,
    });
  }

  try {
    await Promise.all(
      jobs.map((job) =>
        db.run(
          `INSERT INTO scraping_jobs (id, url, website_id, status, progress, result) 
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET 
             status = excluded.status, 
             progress = excluded.progress, 
             result = excluded.result`,
          [
            job.id,
            job.url,
            job.websiteId, // Ensure this is not null
            job.status,
            job.progress,
            JSON.stringify(job.result),
          ]
        )
      )
    );
    res.status(200).json({ message: "Jobs saved successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to save jobs", error: error.message });
  }
});

// Fetch Jobs API
app.get("/scraping-jobs", async (req, res) => {
  try {
    db.all("SELECT * FROM scraping_jobs", [], (err, rows) => {
      if (err) {
        console.error("Database query error:", err.message);
        return res
          .status(500)
          .json({ message: "Database query failed", error: err.message });
      }

      if (!rows.length) {
        console.log("No jobs found.");
        return res.status(200).json([]); // Return an empty array if no jobs exist
      }

      // Safely process each row and attempt to parse the `result` field
      const formattedJobs = rows.map((job) => {
        let parsedResult = job.result;

        try {
          if (
            job.result &&
            job.result.startsWith("{") &&
            job.result.endsWith("}")
          ) {
            parsedResult = JSON.parse(job.result);
          }
        } catch (jsonError) {
          console.error(
            `Failed to parse result JSON for job ID ${job.id}:`,
            jsonError.message
          );
        }

        return { ...job, result: parsedResult }; // Include the parsed or raw result
      });

      res.status(200).json(formattedJobs); // Send the formatted jobs as the response
    });
  } catch (error) {
    console.error("Unexpected server error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch jobs", error: error.message });
  }
});

// Handle WebSocket connections
// io.on("connection", (socket) => {
//   console.log("A user connected");

//   socket.on("disconnect", () => {
//     console.log("A user disconnected");
//   });
// });

// Route to get rank and date by keyword_id and website_id
app.get("/results/:jobId", (req, res) => {
  const { jobId } = req.params;

  const query = `
    SELECT *
    FROM scraping_jobs 
    WHERE id = ? 
  `;

  db.get(query, [jobId.toString()], (err, row) => {
    if (err) {
      console.error("Error fetching data:", err.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (!row) {
      return res.status(404).json({
        message: "No record found for the given jobId.",
      });
    }

    // Try to parse the result if it looks like JSON, otherwise leave as is
    let parsedResult = row.result;
    try {
      if (
        row.result &&
        row.result.startsWith("{") &&
        row.result.endsWith("}")
      ) {
        parsedResult = JSON.parse(row.result);
      }
    } catch (jsonError) {
      console.error(
        `Failed to parse result JSON for job ID ${jobId}:`,
        jsonError.message
      );
    }

    res.json({
      ...row,
      result: parsedResult, // Return parsed or raw result
    });
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(500).json({ error: "Something went wrong!" });
});

// Endpoint to update scraping job by jobId
app.patch("/update-scraping-job", (req, res) => {
  let { jobId, result } = req.body;

  jobId = String(jobId);

  // Update the job status, progress, and result in the scraping_jobs table
  const query = `
    UPDATE scraping_jobs
    SET status = 'completed',
        progress = 100,
        result = ? 
    WHERE id = ?`;

  db.run(query, [result, jobId], function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update job" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.status(200).json({ message: "Job updated successfully" });
  });
});

// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

const server = app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
server.setTimeout(5 * 60 * 1000); // Set timeout to 5 minutes
