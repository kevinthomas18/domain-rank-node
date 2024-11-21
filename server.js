const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");
const db = require("./database");
const app = express();
const PORT = 4000;
const SECRET_KEY = "your_secret_key";

app.use(
  cors({
    origin: ["http://localhost:3000", "https://domain-rank-client.vercel.app"],
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

// Middleware to parse JSON requests
app.use(express.json());

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
        { expiresIn: "4h" } // Token expiration
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
