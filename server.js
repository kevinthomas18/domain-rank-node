const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./database");
const app = express();
const PORT = 4000;
const SECRET_KEY = "your_secret_key";

app.use(
  cors({
    origin: "http://localhost:3000",
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
        { expiresIn: "1h" } // Token expiration
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

// Route to add a new keyword to a project
app.post("/keywords", verifyToken, (req, res) => {
  const {
    project_id,
    keyword,
    search_engine,
    search_location,
    latest_auto_search_rank,
    latest_manual_check_rank,
    status = "Active",
  } = req.body;
  const { id: created_by } = req.user;

  const query = `
      INSERT INTO keywords (project_id, keyword, search_engine, search_location, latest_auto_search_rank, latest_manual_check_rank, created_by, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

  db.run(
    query,
    [
      project_id,
      keyword,
      search_engine,
      search_location,
      latest_auto_search_rank,
      latest_manual_check_rank,
      created_by,
      status,
    ],
    function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({
        message: "Keyword created successfully",
        keyword: {
          id: this.lastID,
          project_id,
          keyword,
          search_engine,
          search_location,
          latest_auto_search_rank,
          latest_manual_check_rank,
          created_by,
          status,
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
      message: "Keywords retrieved successfully",
      keywords: rows,
    });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
