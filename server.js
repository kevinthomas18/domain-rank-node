require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
//const bcrypt = require("bcryptjs");
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

//const redis = require("redis");
//const client = redis.createClient();

const { imageSize } = require("image-size");

const jwt = require("jsonwebtoken");
//const db = require("./database");
const app = express();
const PORT = 4000;
const SECRET_KEY = process.env.SECRET_KEY;

const session = require("express-session");

const pool = require("./config/db");

const cron = require("node-cron");

const fs = require("fs");

// const schemaSQL = fs.readFileSync("schema.sql", "utf8");

// pool.query(schemaSQL, (err, res) => {
//   if (err) {
//     console.error("Error creating tables:", err.stack);
//   } else {
//     console.log("Tables created successfully");
//   }
//   pool.end();
// });

// const getUsers = async () => {
//   try {
//     const res = await pool.query("SELECT * FROM auth_users");
//     console.log(res.rows); // Logs the query result
//   } catch (err) {
//     console.error("Error executing query", err.stack);
//   }
// };

// getUsers();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://domain-rank-client.vercel.app"],
    methods: "GET,POST,PUT,PATCH,DELETE",
    credentials: true,
  })
);

// Set up session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key", // Set a secret for signing the session ID cookie
    resave: false, // Don't save the session if it was not modified
    saveUninitialized: true, // Save a session even if it is new
    cookie: { secure: false }, // Set to true for HTTPS, false for HTTP
  })
);

// Middleware to parse JSON requests
//app.use(express.json());
app.use(express.json({ limit: "50mb" }));

const { google } = require("googleapis");
const readline = require("readline");
const { oauth2Client, authUrl, setCredentials } = require("./auth");

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

// test start google business
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/plus.business.manage",
];

const TOKEN_PATH = "token.json"; // Save the access token for reuse

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
  if (err) return console.error("Error loading client secret file:", err);
  authorize(JSON.parse(content), listBusinessProfiles);
});

function authorize(credentials, callback) {
  // Access the `web` property instead of `installed`
  const { client_id, client_secret, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if the token already exists
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later use.
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}
// async function listBusinessProfiles(oAuth2Client) {
//   try {
//     const mybusiness = google.mybusinessaccountmanagement({
//       version: "v1",
//       auth: oAuth2Client,
//     });

//     // Use the 'accounts.list()' method to list business profiles
//     const res = await mybusiness.accounts.list({});
//     console.log(res.data, "res.....");

//     const accounts = res.data.accounts || [];
//     if (accounts.length) {
//       console.log("Business Profiles:");
//       accounts.forEach((account) => {
//         console.log(
//           `- Name: ${account.name}, Account ID: ${account.accountId}`
//         );
//       });
//     } else {
//       console.log("No Business Profiles found.");
//     }
//   } catch (error) {
//     console.error("Error retrieving business profiles:", error);
//   }
// }

async function listBusinessProfiles() {
  try {
    // Step 1: Fetch the access token from the database
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const tokenResult = await pool.query(query, values);

    // If no access token is found, log an error and return
    if (tokenResult.rows.length === 0) {
      console.error("No access token found. Unauthorized access.");
      return;
    }

    const accessToken = tokenResult.rows[0].access_token;

    // Step 2: Set credentials using the access token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Step 3: Initialize the Google My Business API client
    const mybusiness = google.mybusinessaccountmanagement({
      version: "v1",
      auth: oauth2Client,
    });

    // Step 4: Fetch business profiles
    const res = await mybusiness.accounts.list();
    const accounts = res.data.accounts || [];

    if (accounts.length) {
      console.log("Business Profiles:");
      accounts.forEach((account) => {
        console.log(
          `- Name: ${account.name}, Account ID: ${account.accountId}`
        );
      });
    } else {
      console.log("No Business Profiles found.");
    }
  } catch (error) {
    console.error("Error retrieving business profiles:", error.message);
  }
}

app.get("/api/business/profiles/test", async (req, res) => {
  try {
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    // If no access token is found, respond with Unauthorized error
    if (token.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = token.rows[0].access_token;

    // Set credentials using the access token from the database
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({ access_token: accessToken });

    // Call the function to list business profiles
    await listBusinessProfiles(oAuth2Client);

    res.json({ message: "Business profiles fetched successfully." });
  } catch (error) {
    console.error("Error fetching business profiles:", error.message);
    res.status(500).json({ error: "Failed to fetch business profiles" });
  }
});

// test end google business

app.get("/api/analytics/properties", async (req, res) => {
  try {
    const query = `
    SELECT value AS access_token
    FROM settings
    WHERE key = $1;
  `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    // If no access token is found, respond with Unauthorized error
    if (token.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = token.rows[0].access_token;

    // Set credentials using the access token from the database
    oauth2Client.setCredentials({ access_token: accessToken });
    const analyticsAdmin = google.analyticsadmin("v1alpha");

    // Authenticate API client
    google.options({ auth: oauth2Client });

    // Fetch accounts
    const accountsResponse = await analyticsAdmin.accounts.list();
    const accounts = accountsResponse.data.accounts || [];

    if (!accounts.length) {
      return res.status(200).json({ message: "No accounts found.", data: [] });
    }

    const result = [];
    for (const account of accounts) {
      // Fetch properties for each account
      const propertiesResponse = await analyticsAdmin.properties.list({
        filter: `parent:${account.name}`, // Correct filter syntax for account ID
      });

      const properties = propertiesResponse.data.properties || [];
      for (const property of properties) {
        result.push({
          accountName: account.displayName,
          accountId: account.name,
          propertyName: property.displayName,
          propertyId: property.name,
        });
      }
    }

    res.json({ message: "Properties fetched successfully.", data: result });
  } catch (error) {
    console.error("Error fetching properties:", error.message);
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

//business profile api start
app.get("/api/business/profiles", async (req, res) => {
  try {
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    if (token.rows.length === 0) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Access token not found" });
    }

    const accessToken = token.rows[0].access_token;

    // Set credentials using the access token
    oauth2Client.setCredentials({ access_token: accessToken });

    // Set global authentication for Google APIs
    google.options({ auth: oauth2Client });

    // Use Google Business Profile API
    const myBusinessAccount = google.mybusinessaccountmanagement("v1");

    // Fetch accounts
    const accountsResponse = await myBusinessAccount.accounts.list();
    const accounts = accountsResponse.data.accounts || [];

    if (!accounts.length) {
      return res
        .status(200)
        .json({ message: "No business accounts found.", data: [] });
    }

    const result = [];

    for (const account of accounts) {
      // Fetch locations for each account
      const locationsResponse = await myBusinessAccount.accounts.locations.list(
        {
          parent: account.name, // Use account resource name as the parent
        }
      );

      const locations = locationsResponse.data.locations || [];
      for (const location of locations) {
        result.push({
          accountName: account.accountName,
          accountId: account.name,
          locationName: location.locationName,
          locationId: location.name,
          primaryCategory: location.primaryCategory.displayName,
          address: location.address,
          phoneNumber: location.phoneNumbers?.primaryPhone,
        });
      }
    }

    res.json({
      message: "Business profiles and locations fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching business profiles:", error.message);
    res.status(500).json({ error: "Failed to fetch business profiles" });
  }
});

//business profile api end
// Fetch Google Analytics data

app.post("/api/analytics", async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({ error: "Property ID is required" });
    }

    const start = startDate || "7daysAgo";
    const end = endDate || "today";
    const property_Id = propertyId;

    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    if (token.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = token.rows[0].access_token;

    oauth2Client.setCredentials({ access_token: accessToken });

    const analyticsData = google.analyticsdata({
      version: "v1beta",
      auth: oauth2Client,
    });

    const response = await analyticsData.properties.runReport({
      property: property_Id,
      requestBody: {
        dateRanges: [{ startDate: start, endDate: end }],
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "eventCount" },
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "bounceRate" },
          //{ name: "ecommercePurchases" },
          //{ name: "adClicks" },
          //{ name: "userKeyEventRate" },
        ],
        dimensions: [
          { name: "sessionDefaultChannelGrouping" },
          //{ name: "sessionSource" },
          //{ name: "sessionMedium" },
          //{ name: "city" },
          //{ name: "deviceCategory" },
          //{ name: "country" },
          //{ name: "region" },
          //{ name: "deviceCategory" },
          //{ name: "operatingSystem" },
          //{ name: "language" },
          //{ name: "browser" },
          //{ name: "userAgeBracket" },
          //{ name: "userGender" },
        ],
      },
    });

    // const formattedResponse = response.data.rows.map((row) => {
    //   return {
    //     channel: row.dimensionValues[0]?.value || "Unknown",
    //     activeUsers: row.metricValues[0]?.value || "0",
    //     newUsers: row.metricValues[1]?.value || "0",
    //     eventCount: row.metricValues[2]?.value || "0",
    //     sessions: row.metricValues[3]?.value || "0",
    //   };
    // });

    const formattedResponse = response.data.rows.map((row) => {
      return {
        channel: row.dimensionValues[0]?.value || "Unknown", // Assumes "sessionDefaultChannelGrouping" is the first dimension
        city: row.dimensionValues[1]?.value || "Unknown", // Assumes "city" is the second dimension
        deviceCategory: row.dimensionValues[2]?.value || "Unknown", // If more dimensions are added, adjust indices

        activeUsers: row.metricValues[0]?.value || "0",
        newUsers: row.metricValues[1]?.value || "0",
        eventCount: row.metricValues[2]?.value || "0",
        sessions: row.metricValues[3]?.value || "0",
        engagedSessions: row.metricValues[4]?.value || "0",
        bounceRate: row.metricValues[5]?.value || "0",
        //ecommercePurchases: row.metricValues[6]?.value || "0",
      };
    });

    res.json({ data: formattedResponse });
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    res.status(500).json({ error: "Failed to fetch analytics data" });
  }
});

app.post("/api/page-analytics", async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({ error: "Property ID is required" });
    }

    const start = startDate || "7daysAgo";
    const end = endDate || "today";
    const property_Id = propertyId;

    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    if (token.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = token.rows[0].access_token;

    oauth2Client.setCredentials({ access_token: accessToken });

    const analyticsData = google.analyticsdata({
      version: "v1beta",
      auth: oauth2Client,
    });

    const response = await analyticsData.properties.runReport({
      property: property_Id,
      requestBody: {
        dateRanges: [{ startDate: start, endDate: end }],
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "bounceRate" },
        ],
        dimensions: [
          { name: "pagePath" }, // Retrieve data for individual pages
          { name: "pageTitle" }, // Optional: Include page title for context
        ],
      },
    });

    const formattedResponse = response.data.rows.map((row) => {
      return {
        pagePath: row.dimensionValues[0]?.value || "Unknown",
        pageTitle: row.dimensionValues[1]?.value || "Unknown",

        activeUsers: row.metricValues[0]?.value || "0",
        newUsers: row.metricValues[1]?.value || "0",
        sessions: row.metricValues[2]?.value || "0",
        engagedSessions: row.metricValues[3]?.value || "0",
        bounceRate: row.metricValues[4]?.value || "0",
      };
    });

    res.json({ data: formattedResponse });
  } catch (error) {
    console.error("Error fetching page analytics data:", error);
    res.status(500).json({ error: "Failed to fetch page analytics data" });
  }
});

// app.post("/api/analytics/page-details", async (req, res) => {
//   try {
//     const { propertyId, pagePath, startDate, endDate, comparisonStartDate } =
//       req.body;

//     if (!propertyId || !pagePath) {
//       return res
//         .status(400)
//         .json({ error: "Property ID and Page Path are required" });
//     }

//     const start = startDate || "7daysAgo";
//     const end = endDate || "today";
//     const comparisonStart = comparisonStartDate || "14daysAgo";

//     const query = `
//       SELECT value AS access_token
//       FROM settings
//       WHERE key = $1;
//     `;
//     const values = ["search console access token"];
//     const token = await pool.query(query, values);

//     if (token.rows.length === 0) {
//       return res.status(401).json({ error: "Unauthorized" });
//     }

//     const accessToken = token.rows[0].access_token;

//     oauth2Client.setCredentials({ access_token: accessToken });

//     const analyticsData = google.analyticsdata({
//       version: "v1beta",
//       auth: oauth2Client,
//     });

//     // Fetch analytics for the given date range
//     const response = await analyticsData.properties.runReport({
//       property: propertyId,
//       requestBody: {
//         dateRanges: [{ startDate: start, endDate: end }],
//         dimensions: [{ name: "country" }, { name: "pagePath" }],
//         metrics: [{ name: "activeUsers" }, { name: "newUsers" }],
//         dimensionFilter: {
//           filter: {
//             fieldName: "pagePath",
//             stringFilter: { value: pagePath },
//           },
//         },
//       },
//     });

//     // Fetch comparison data
//     const comparisonResponse = await analyticsData.properties.runReport({
//       property: propertyId,
//       requestBody: {
//         dateRanges: [{ startDate: comparisonStart, endDate: start }],
//         dimensions: [{ name: "pagePath" }],
//         metrics: [{ name: "activeUsers" }],
//         dimensionFilter: {
//           filter: {
//             fieldName: "pagePath",
//             stringFilter: { value: pagePath },
//           },
//         },
//       },
//     });

//     const details = response.data.rows.map((row) => ({
//       country: row.dimensionValues[0]?.value || "Unknown",
//       pagePath: row.dimensionValues[1]?.value || "Unknown",
//       activeUsers: row.metricValues[0]?.value || "0",
//       newUsers: row.metricValues[1]?.value || "0",
//     }));

//     const previousActiveUsers =
//       comparisonResponse.data.rows?.[0]?.metricValues?.[0]?.value || "0";

//     const percentageChange =
//       previousActiveUsers > 0
//         ? (
//             ((details[0].activeUsers - previousActiveUsers) /
//               previousActiveUsers) *
//             100
//           ).toFixed(2)
//         : "N/A";

//     res.json({
//       details,
//       percentageChange,
//     });
//   } catch (error) {
//     console.error("Error fetching page details:", error);
//     res.status(500).json({ error: "Failed to fetch page details" });
//   }
// });

app.post("/api/analytics/page-details", async (req, res) => {
  try {
    const { propertyId, pagePath, startDate, endDate, comparisonStartDate } =
      req.body;

    if (!propertyId || !pagePath) {
      return res
        .status(400)
        .json({ error: "Property ID and Page Path are required" });
    }

    const start = startDate || "7daysAgo";
    const end = endDate || "today";
    const comparisonStart = comparisonStartDate || "14daysAgo";

    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    if (token.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = token.rows[0].access_token;

    oauth2Client.setCredentials({ access_token: accessToken });

    const analyticsData = google.analyticsdata({
      version: "v1beta",
      auth: oauth2Client,
    });

    // Fetch analytics for the given date range
    const response = await analyticsData.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [{ name: "country" }, { name: "pagePath" }],
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { value: pagePath },
          },
        },
      },
    });

    const responseByChannel = await analyticsData.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [{ name: "sessionDefaultChannelGrouping" }],
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { value: pagePath },
          },
        },
      },
    });

    // Fetch comparison data for channels
    const comparisonResponseByChannel =
      await analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [{ startDate: comparisonStart, endDate: start }],
          dimensions: [{ name: "sessionDefaultChannelGrouping" }],
          metrics: [{ name: "activeUsers" }],
          dimensionFilter: {
            filter: {
              fieldName: "pagePath",
              stringFilter: { value: pagePath },
            },
          },
        },
      });

    // Process the channel data with percentage change
    const channelDetails = responseByChannel.data.rows.map((row) => {
      const channel = row.dimensionValues[0]?.value || "Unknown";
      const activeUsers = parseInt(row.metricValues[0]?.value || "0", 10);
      const newUsers = parseInt(row.metricValues[1]?.value || "0", 10);

      const previousData = comparisonResponseByChannel.data.rows.find(
        (comparisonRow) => comparisonRow.dimensionValues[0]?.value === channel
      );

      const previousActiveUsers = parseInt(
        previousData?.metricValues[0]?.value || "0",
        10
      );

      const percentageChange =
        previousActiveUsers > 0
          ? (
              ((activeUsers - previousActiveUsers) / previousActiveUsers) *
              100
            ).toFixed(2)
          : previousActiveUsers === 0 && activeUsers > 0
          ? "100" // New data
          : "0"; // No change or no data

      return {
        channel,
        activeUsers,
        newUsers,
        percentageChange,
      };
    });

    // Fetch comparison data
    const comparisonResponse = await analyticsData.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate: comparisonStart, endDate: start }],
        dimensions: [{ name: "country" }, { name: "pagePath" }],
        metrics: [{ name: "activeUsers" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { value: pagePath },
          },
        },
      },
    });

    const details = response.data.rows.map((row) => {
      const country = row.dimensionValues[0]?.value || "Unknown";
      const activeUsers = parseInt(row.metricValues[0]?.value || "0", 10);
      const newUsers = parseInt(row.metricValues[1]?.value || "0", 10);

      const previousData = comparisonResponse.data.rows.find(
        (comparisonRow) => comparisonRow.dimensionValues[0]?.value === country
      );

      const previousActiveUsers = parseInt(
        previousData?.metricValues[0]?.value || "0",
        10
      );

      const percentageChange =
        previousActiveUsers > 0
          ? (
              ((activeUsers - previousActiveUsers) / previousActiveUsers) *
              100
            ).toFixed(2)
          : previousActiveUsers === 0 && activeUsers > 0
          ? "100" // New data
          : "0"; // No change or no data

      return {
        country,
        activeUsers,
        newUsers,
        percentageChange,
      };
    });
    const totalActiveUsers = response.data.rows.reduce(
      (sum, row) => sum + parseInt(row.metricValues[0]?.value || "0", 10),
      0
    );

    const totalPreviousActiveUsers = comparisonResponse.data.rows.reduce(
      (sum, row) => sum + parseInt(row.metricValues[0]?.value || "0", 10),
      0
    );

    const totalPercentageChange =
      totalPreviousActiveUsers > 0
        ? (
            ((totalActiveUsers - totalPreviousActiveUsers) /
              totalPreviousActiveUsers) *
            100
          ).toFixed(2)
        : totalPreviousActiveUsers === 0 && totalActiveUsers > 0
        ? "100"
        : "0";

    res.json({ details, totalPercentageChange, channelDetails });
  } catch (error) {
    console.error("Error fetching page details:", error);
    res.status(500).json({ error: "Failed to fetch page details" });
  }
});

app.post("/api/analytics/traffic-by-date", async (req, res) => {
  try {
    const { propertyId, pagePath, startDate, endDate } = req.body;

    if (!propertyId || !pagePath) {
      return res
        .status(400)
        .json({ error: "Property ID and Page Path are required" });
    }

    const start = startDate || "7daysAgo";
    const end = endDate || "today";

    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const token = await pool.query(query, values);

    if (token.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = token.rows[0].access_token;

    oauth2Client.setCredentials({ access_token: accessToken });

    const analyticsData = google.analyticsdata({
      version: "v1beta",
      auth: oauth2Client,
    });

    const response = await analyticsData.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [{ name: "date" }, { name: "pagePath" }],
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { value: pagePath },
          },
        },
      },
    });

    const dailyTraffic = response.data.rows.map((row) => ({
      date: row.dimensionValues[0]?.value,
      activeUsers: parseInt(row.metricValues[0]?.value || "0", 10),
      newUsers: parseInt(row.metricValues[1]?.value || "0", 10),
    }));

    res.json({ dailyTraffic });
  } catch (error) {
    console.error("Error fetching traffic by date:", error);
    res.status(500).json({ error: "Failed to fetch traffic by date" });
  }
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Extract the access token
    const accessToken = tokens.access_token;
    const currentDate = new Date();

    // Save the access token to the database
    const query = `
      INSERT INTO settings (key, value, date)
      VALUES ($1, $2, $3)
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, date = $3
      RETURNING *;
    `;
    const values = ["search console access token", accessToken, currentDate];

    const result = await pool.query(query, values);
    const savedToken = result.rows[0];
    console.log("Access token saved to database:", savedToken);

    // Redirect to the desired page
    res.redirect("http://localhost:3000/dashboard/searchconsole");
  } catch (error) {
    console.error("Error during OAuth2 callback:", error);
    res.status(500).send("Authentication failed");
  }
});

// Route to get the access token from the settings table
app.get("/get-access-token", verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT value AS access_token, date
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Access token not found" });
    }

    const { access_token, date } = result.rows[0];
    res.status(200).json({ access_token, date });
  } catch (error) {
    console.error("Error fetching access token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/get-auth-url", (req, res) => {
  try {
    res.json({ authUrl });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).send("Error generating auth URL");
  }
});

app.delete("/delete-access-token", async (req, res) => {
  try {
    const query = `
      DELETE FROM settings
      WHERE key = $1
      RETURNING *;
    `;
    const values = ["search console access token"];
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Access token not found" });
    }

    res.status(200).json({
      message: "Access token deleted successfully",
      deletedRecord: result.rows[0], // Return the deleted record
    });
  } catch (error) {
    console.error("Error deleting access token:", error.message);
    res.status(500).json({ error: "Failed to delete access token" });
  }
});

app.get("/list-sites", async (req, res) => {
  try {
    // Query the database for the access token
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const result = await pool.query(query, values);

    // If no access token is found, respond with Unauthorized error
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = result.rows[0].access_token;

    // Set credentials using the access token from the database
    oauth2Client.setCredentials({ access_token: accessToken });

    // Use the access token to list the sites from Google Search Console
    const searchConsole = google.webmasters({
      version: "v3",
      auth: oauth2Client,
    });

    const response = await searchConsole.sites.list();
    res.json(response.data.siteEntry || []);
  } catch (error) {
    console.error("Error retrieving sites:", error);
    res.status(500).send("Failed to retrieve sites");
  }
});

// Step 3: Endpoint to fetch search analytics for a site
// app.post("/search-analytics", async (req, res) => {
//   const { siteUrl, startDate, endDate, dimensions, rowLimit } = req.body;

//   if (!siteUrl) {
//     return res.status(400).json({ error: "Missing siteUrl" });
//   }

//   try {
//     // Fetch the access token from the settings table
//     const query = `
//       SELECT value AS access_token
//       FROM settings
//       WHERE key = $1;
//     `;
//     const values = ["search console access token"];
//     const result = await pool.query(query, values);

//     if (result.rows.length === 0) {
//       return res.status(401).json({ error: "Unauthorized" });
//     }

//     const accessToken = result.rows[0].access_token;
//     oauth2Client.setCredentials({ access_token: accessToken });

//     const searchConsole = google.webmasters({
//       version: "v3",
//       auth: oauth2Client,
//     });

//     const response = await searchConsole.searchanalytics.query({
//       siteUrl,
//       requestBody: {
//         startDate,
//         endDate,
//         dimensions: dimensions || ["query"],
//         rowLimit: rowLimit || 10,
//       },
//     });

//     res.json(response.data);
//   } catch (error) {
//     console.error("Error retrieving search analytics:", error);
//     res.status(500).json({ error: "Error retrieving search analytics" });
//   }
// });

app.post("/search-analytics", async (req, res) => {
  const {
    siteUrl,
    startDate,
    endDate,
    dimensions,
    rowLimit,
    country,
    device,
    queryContains,
    queryNotContains,
    queryExactMatch,
    urlContains,
    urlNotContains,
    urlExactMatch,
  } = req.body;

  if (!siteUrl) {
    return res.status(400).json({ error: "Missing siteUrl" });
  }

  try {
    // Fetch the access token from the settings table
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = result.rows[0].access_token;
    oauth2Client.setCredentials({ access_token: accessToken });

    const searchConsole = google.webmasters({
      version: "v3",
      auth: oauth2Client,
    });

    // Create the request body with filters
    const filters = [];
    if (country) {
      filters.push({
        dimension: "country",
        operator: "equals",
        expression: country.toUpperCase(),
      });
    }
    if (device) {
      filters.push({
        dimension: "device",
        operator: "equals",
        expression: device,
      });
    }
    if (queryContains) {
      filters.push({
        dimension: "query",
        operator: "contains",
        expression: queryContains,
      });
    }
    if (queryNotContains) {
      filters.push({
        dimension: "query",
        operator: "notContains",
        expression: queryNotContains,
      });
    }
    if (queryExactMatch) {
      filters.push({
        dimension: "query",
        operator: "equals",
        expression: queryExactMatch,
      });
    }
    if (urlContains) {
      filters.push({
        dimension: "page",
        operator: "contains",
        expression: urlContains,
      });
    }
    if (urlNotContains) {
      filters.push({
        dimension: "page",
        operator: "notContains",
        expression: urlNotContains,
      });
    }
    if (urlExactMatch) {
      filters.push({
        dimension: "page",
        operator: "equals",
        expression: urlExactMatch,
      });
    }

    const requestBody = {
      startDate,
      endDate,
      dimensions: dimensions || ["query"],
      rowLimit: rowLimit || 10,
      dimensionFilterGroups: filters.length ? [{ filters }] : undefined,
    };

    const response = await searchConsole.searchanalytics.query({
      siteUrl,
      requestBody,
    });

    res.json(response.data);
  } catch (error) {
    console.error(
      "Error retrieving search analytics:",
      error.response?.data || error
    );
    res.status(500).json({ error: "Error retrieving search analytics" });
  }
});

app.post("/pages", async (req, res) => {
  const {
    siteUrl,
    startDate,
    endDate,
    rowLimit,
    urlContains,
    urlExactMatch,
    urlNotContains,
    device,
    country,
  } = req.body;

  if (!siteUrl) {
    return res.status(400).json({ error: "Missing siteUrl" });
  }

  try {
    // Fetch the access token from the settings table
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = result.rows[0].access_token;
    oauth2Client.setCredentials({ access_token: accessToken });

    const searchConsole = google.webmasters({
      version: "v3",
      auth: oauth2Client,
    });

    const filters = [];
    if (urlContains) {
      filters.push({
        dimension: "page",
        operator: "contains",
        expression: urlContains,
      });
    }
    if (urlExactMatch) {
      filters.push({
        dimension: "page",
        operator: "equals",
        expression: urlExactMatch,
      });
    }
    if (urlNotContains) {
      filters.push({
        dimension: "page",
        operator: "notContains",
        expression: urlNotContains,
      });
    }
    if (device) {
      filters.push({
        dimension: "device",
        operator: "equals",
        expression: device,
      });
    }
    if (country) {
      filters.push({
        dimension: "country",
        operator: "equals",
        expression: country,
      });
    }

    const response = await searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["page"],
        dimensionFilterGroups: [{ groupType: "and", filters }],
        rowLimit: rowLimit || 10,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error retrieving pages:", error);
    res.status(500).json({ error: "Error retrieving pages" });
  }
});

//crawl error api -- this is not working proper now
app.get("/crawl-errors/:siteUrl", async (req, res) => {
  const { siteUrl } = req.params;

  try {
    // Fetch the access token from the settings table
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = result.rows[0].access_token;
    oauth2Client.setCredentials({ access_token: accessToken });

    const searchConsole = google.webmasters({
      version: "v3",
      auth: oauth2Client,
    });

    const response = await searchConsole.urlcrawlerrorssamples.query({
      siteUrl,
      category: "notFound",
      platform: "web",
    });

    res.json(response.data || []);
  } catch (error) {
    console.error("Error retrieving crawl errors:", error.message);
    res.status(500).json({ error: "Failed to retrieve crawl errors" });
  }
});

app.get("/sitemaps/:siteUrl", async (req, res) => {
  const { siteUrl } = req.params;

  try {
    // Fetch the access token from the settings table
    const query = `
      SELECT value AS access_token
      FROM settings
      WHERE key = $1;
    `;
    const values = ["search console access token"];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = result.rows[0].access_token;
    oauth2Client.setCredentials({ access_token: accessToken });

    const searchConsole = google.webmasters({
      version: "v3",
      auth: oauth2Client,
    });

    const response = await searchConsole.sitemaps.list({ siteUrl });
    res.json(response.data.sitemap || []);
  } catch (error) {
    console.error("Error retrieving sitemaps:", error);
    res.status(500).send("Failed to retrieve sitemaps");
  }
});

// Add a new site
app.post("/searchconsole/website", verifyToken, async (req, res) => {
  const { site_name } = req.body;
  const fetched_by = req.user.id;
  const first_fetched_date = new Date();

  if (!site_name) {
    return res.status(400).json({ error: "Site name is required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO Search_Console_Sites (Site_name, First_fetched_Date, Fetched_by) VALUES ($1, $2, $3) RETURNING *`,
      [site_name, first_fetched_date, fetched_by]
    );
    const newSite = result.rows[0];
    res.status(201).json(newSite);
  } catch (error) {
    console.error("Error adding new site:", error);
    if (error.code === "23505") {
      // Handle duplicate site names
      res.status(409).json({ error: "Site name already exists" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Get all sites for the logged-in user
app.get("/searchconsole/websites", verifyToken, async (req, res) => {
  const fetched_by = req.user.id;

  try {
    const result = await pool.query(
      `SELECT * FROM Search_Console_Sites WHERE Fetched_by = $1 ORDER BY First_fetched_Date DESC`,
      [fetched_by]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching sites:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/analytics/accounts", verifyToken, async (req, res) => {
  const fetched_by = req.user.id;

  try {
    const result = await pool.query(
      `SELECT * FROM analytics_accounts WHERE Fetched_by = $1 ORDER BY First_fetched_Date DESC`,
      [fetched_by]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/analytics/accounts", verifyToken, async (req, res) => {
  const fetched_by = req.user.id;

  try {
    const result = await pool.query(
      `SELECT * FROM analytics_accounts WHERE Fetched_by = $1 ORDER BY First_fetched_Date DESC`,
      [fetched_by]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching sites:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/analyticsaccounts/add", verifyToken, async (req, res) => {
  const { account_name, account_id, property_name, property_id, project_id } =
    req.body;
  const fetched_by = req.user.id; // Assumes `req.user.id` contains the ID of the authenticated user
  const first_fetched_date = new Date();

  // Validate required fields
  if (
    !account_name ||
    !account_id ||
    !property_name ||
    !property_id ||
    !project_id
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO analytics_accounts (account_name, account_id, property_name, property_id, fetched_by, first_fetched_date, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        account_name,
        account_id,
        property_name,
        property_id,
        fetched_by,
        first_fetched_date,
        project_id,
      ]
    );

    const newAccount = result.rows[0];
    res.status(201).json(newAccount);
  } catch (error) {
    console.error("Error adding new account:", error);
    if (error.code === "23505") {
      // Handle duplicate entries (if any unique constraints are defined)
      res.status(409).json({ error: "Account already exists" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Delete a site by ID
app.delete("/searchconsole/website", verifyToken, async (req, res) => {
  const { site_name } = req.body;
  const fetched_by = req.user.id;

  try {
    const result = await pool.query(
      `DELETE FROM Search_Console_Sites WHERE site_name = $1 AND Fetched_by = $2 RETURNING *`,
      [site_name, fetched_by]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Site not found or not authorized" });
    }

    res.status(200).json({ message: "Site deleted successfully" });
  } catch (error) {
    console.error("Error deleting site:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/analyticsaccount/remove", verifyToken, async (req, res) => {
  const { property_name } = req.body;
  const fetched_by = req.user.id;

  try {
    const result = await pool.query(
      `DELETE FROM analytics_accounts WHERE property_name = $1 AND Fetched_by = $2 RETURNING *`,
      [property_name, fetched_by]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Account not found or not authorized" });
    }

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting Account:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new backlink website record
app.post("/backlinks_website", async (req, res) => {
  const {
    Project_id,
    Website_name,
    URL,
    User_id,
    Password,
    Remarks,
    Created_by,
  } = req.body;

  const query = `
    INSERT INTO Backlink_websites 
    (Project_id, Website_name, URL, User_id, Password, Remarks, Created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7) 
    RETURNING *;
  `;

  try {
    const client = await pool.connect();
    const result = await client.query(query, [
      Project_id,
      Website_name,
      URL,
      User_id,
      Password,
      Remarks,
      Created_by,
    ]);
    res.status(201).json(result.rows[0]);
    client.release();
  } catch (error) {
    console.error("Error inserting backlink:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all backlink website records
app.get("/backlinks_website", async (req, res) => {
  const query = `SELECT * FROM Backlink_websites;`;

  try {
    const client = await pool.connect();
    const result = await client.query(query);
    res.json(result.rows);
    client.release();
  } catch (error) {
    console.error("Error fetching backlinks:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get a single backlink website record by ID
app.get("/backlinks_website/:id", async (req, res) => {
  const { id } = req.params;
  const query = `SELECT * FROM Backlink_websites WHERE Id = $1;`;

  try {
    const client = await pool.connect();
    const result = await client.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }
    res.json(result.rows[0]);
    client.release();
  } catch (error) {
    console.error("Error fetching backlink:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update a backlink website record by ID
app.put("/backlinks_website/:id", async (req, res) => {
  const { id } = req.params;
  const {
    Project_id,
    Website_name,
    URL,
    User_id,
    Password,
    Remarks,
    Created_by,
  } = req.body;

  const query = `
    UPDATE Backlink_websites 
    SET 
      Project_id = $1,
      Website_name = $2,
      URL = $3,
      User_id = $4,
      Password = $5,
      Remarks = $6,
      Created_by = $7
    WHERE Id = $8 
    RETURNING *;
  `;

  try {
    const client = await pool.connect();
    const result = await client.query(query, [
      Project_id,
      Website_name,
      URL,
      User_id,
      Password,
      Remarks,
      Created_by,
      id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }
    res.json(result.rows[0]);
    client.release();
  } catch (error) {
    console.error("Error updating backlink:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete a backlink website record by ID
app.delete("/backlinks_website/:id", async (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM Backlink_websites WHERE Id = $1 RETURNING *;`;

  try {
    const client = await pool.connect();
    const result = await client.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }
    res.json({ message: "Record deleted successfully" });
    client.release();
  } catch (error) {
    console.error("Error deleting backlink:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all backlinks
app.get("/api/backlinks", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Backlinks");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching backlinks:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get a single backlink by ID
app.get("/api/backlinks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM Backlinks WHERE Id = $1", [
      id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Backlink not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching backlink:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create a new backlink
app.post("/api/backlinks", async (req, res) => {
  const {
    Project_id,
    Link_from,
    Link_to,
    Anchor_text,
    Do_follow,
    Source,
    Link_type,
    Remarks,
    Created_by,
    Last_checked_date,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO Backlinks (
        Project_id, Link_from, Link_to, Anchor_text, Do_follow, Source, Link_type, Remarks, Created_date, Created_by, Last_checked_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10) RETURNING *`,
      [
        Project_id,
        Link_from,
        Link_to,
        Anchor_text,
        Do_follow,
        Source,
        Link_type,
        Remarks,
        Created_by,
        Last_checked_date,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating backlink:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update an existing backlink
app.put("/api/backlinks/:id", async (req, res) => {
  const { id } = req.params;
  const {
    Project_id,
    Link_from,
    Link_to,
    Anchor_text,
    Do_follow,
    Source,
    Link_type,
    Remarks,
    Created_by,
    Last_checked_date,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE Backlinks
       SET Project_id = $1,
           Link_from = $2,
           Link_to = $3,
           Anchor_text = $4,
           Do_follow = $5,
           Source = $6,
           Link_type = $7,
           Remarks = $8,
           Created_by = $9,
           Last_checked_date = $10
       WHERE Id = $11 RETURNING *`,
      [
        Project_id,
        Link_from,
        Link_to,
        Anchor_text,
        Do_follow,
        Source,
        Link_type,
        Remarks,
        Created_by,
        Last_checked_date,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Backlink not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating backlink:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete a backlink
app.delete("/api/backlinks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM Backlinks WHERE Id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Backlink not found" });
    }

    res.json({
      message: "Backlink deleted successfully",
      deleted: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting backlink:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Add a website to monitor
app.post("/monitor/websites", async (req, res) => {
  const { Site_name, URL } = req.body;

  const query = `
    INSERT INTO Websites_Monitor (Site_name, URL)
    VALUES ($1, $2)
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [Site_name, URL]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error adding website:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all monitored websites
app.get("/monitor/websites_history", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Websites_Monitor_history;");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching websites:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/monitor/websites", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Websites_Monitor;");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching websites:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get website history
app.get("/websites/:id/history", async (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT * 
    FROM Websites_Monitor_History 
    WHERE Site_id = $1
    ORDER BY Check_time DESC;
  `;

  try {
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching website history:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Cron job to ping websites every 15 minutes
cron.schedule("*/15 * * * *", async () => {
  console.log("Pinging websites...");

  const query = `SELECT * FROM Websites_Monitor;`;

  try {
    const { rows: websites } = await pool.query(query);

    for (const website of websites) {
      const { id, url } = website;
      let status = "Fail";

      try {
        const startTime = Date.now();
        const response = await axios.get(url, { timeout: 5000 });
        const responseTime = Date.now() - startTime;

        // Determine status based on response
        if (response.status === 200) {
          status = responseTime < 3000 ? "Success" : "Slow";
        }
      } catch (error) {
        console.error(`Error pinging ${url}:`, error.message);
      }

      // Insert history record
      const insertHistoryQuery = `
        INSERT INTO websites_monitor_history (site_id, status)
        VALUES ($1, $2);
      `;
      await pool.query(insertHistoryQuery, [id, status]);

      // Update last check time
      const updateMonitorQuery = `
        UPDATE websites_monitor
        SET Last_check_time = CURRENT_TIMESTAMP
        WHERE id = $1;
      `;
      await pool.query(updateMonitorQuery, [id]);

      console.log(`Checked ${url} - Status: ${status}`);
    }
  } catch (error) {
    console.error("Error during website check:", error.message);
  }
});

// Configure the email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kevin@spiderworks.in",
    //user: "notifications-no-reply@spiderworks.info",
    pass: process.env.EMAIL_PASS,
  },
});

// Generate a secure OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

//Add a New User
app.post("/add-auth-user", verifyToken, async (req, res) => {
  const { name, email, userType, status = "active" } = req.body;
  const { id: createdById } = req.user;

  if (!name || !email || !userType) {
    return res
      .status(400)
      .json({ message: "Name, email, and user type are required" });
  }

  try {
    const insertQuery = `
      INSERT INTO auth_users (name, email, user_type, status, created_by_id) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id, name, email, user_type, status
    `;
    const result = await pool.query(insertQuery, [
      name,
      email,
      userType,
      status,
      createdById || null,
    ]);

    const newUser = result.rows[0]; // Extract the newly created user's details
    res.status(200).json({ message: "User added successfully", user: newUser });
  } catch (error) {
    console.error("Error adding user:", error);
    res
      .status(500)
      .json({ message: "Failed to add user", error: error.message });
  }
});

//Request OTP
app.post("/request-auth-otp", async (req, res) => {
  const { email } = req.body;
  

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // Check if the user exists and is active
    const userQuery = `
      SELECT * FROM auth_users 
      WHERE email = $1 AND status = 'active'
    `;
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "User not found or is not active" });
    }

    // Generate OTP and update the database
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // Valid for 5 minutes

    const updateOtpQuery = `
      UPDATE auth_users 
      SET otp = $1, otp_expiry = $2 
      WHERE email = $3
    `;
    await pool.query(updateOtpQuery, [otp, otpExpiry.toISOString(), email]);

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
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

//OTP Login Route
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  try {
    const query = `
      SELECT * FROM auth_users WHERE email = $1 AND otp = $2 AND otp_expiry > $3
    `;
    const result = await pool.query(query, [
      email,
      otp,
      new Date().toISOString(),
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.user_type },
      SECRET_KEY,
      { expiresIn: "24h" }
    );

    // Clear OTP from the database
    const clearOtpQuery = `
      UPDATE auth_users SET otp = NULL, otp_expiry = NULL WHERE id = $1
    `;
    await pool.query(clearOtpQuery, [user.id]);

    res.status(200).json({
      message: "Login successful",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.user_type,
        token: token,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Database error", message: error.message });
  }
});

app.get("/get-all-users",verifyToken, async (req, res) => {
  try {
    const selectQuery = `
      SELECT id, name, email, user_type, created_by_id,status
      FROM auth_users
    `;

    const result = await pool.query(selectQuery);
    const users = result.rows;

    res.status(200).json({ message: "Users fetched successfully", users });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: error.message });
  }
});

app.put("/edit-auth-user/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { name, email, user_type, status } = req.body;

  if (!name && !email && !user_type && !status) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const fields = [];
    const values = [];
    let counter = 1;

    if (name) {
      fields.push(`name = $${counter}`);
      values.push(name);
      counter++;
    }
    if (email) {
      fields.push(`email = $${counter}`);
      values.push(email);
      counter++;
    }
    if (user_type) {
      fields.push(`user_type = $${counter}`);
      values.push(user_type);
      counter++;
    }
    if (status) {
      fields.push(`status = $${counter}`);
      values.push(status);
      counter++;
    }

    values.push(id); // Add user ID as the last value

    const updateQuery = `
      UPDATE auth_users 
      SET ${fields.join(", ")} 
      WHERE id = $${counter}
      RETURNING id
    `;

    const result = await pool.query(updateQuery, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update user", error: error.message });
  }
});

app.delete("/delete-auth-user/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const deleteQuery = `
      DELETE FROM auth_users 
      WHERE id = $1 
      RETURNING id
    `;

    const result = await pool.query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
  }
});

// Example route to get user info (protected with JWT)
app.get("/profile", verifyToken, async (req, res) => {
  try {
    const { id } = req.user;

    const query =
      "SELECT id, name, email, user_type FROM auth_users WHERE id = $1";
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    res.json({ message: "Protected data", user });
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// API to assign a project to a user
app.post('/assign-project',verifyToken, async (req, res) => {
  const { user_id, project_id } = req.body;
  const { id: assigned_by } = req.user;

  // Validate input
  if (!user_id || !project_id || !assigned_by) {
    return res.status(400).json({ error: 'user_id, project_id, and assigned_by are required' });
  }

  try {
    const query = `
      INSERT INTO user_project_assignments (user_id, project_id, assigned_by)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const result = await pool.query(query, [user_id, project_id, assigned_by]);

    res.status(201).json({
      message: 'Project assigned successfully',
      assignment: result.rows[0],
    });
  } catch (error) {
    console.error('Error assigning project:', error);
    res.status(500).json({ error: 'Failed to assign project' });
  }
});

// --- Project Routes ---

// Route to add a new project (with user info from JWT)
app.post("/projects", verifyToken, async (req, res) => {
  const { name, domain_name, status = "Active" } = req.body;
  const { id: created_by } = req.user; // Get user ID from the decoded JWT (stored in req.user)

  // Parameterized query to insert the project into the database
  const query = `
    INSERT INTO projects (name, domain_name, created_by, status) 
    VALUES ($1, $2, $3, $4) RETURNING id, name, domain_name, created_by, status
  `;

  try {
    const result = await pool.query(query, [
      name,
      domain_name,
      created_by,
      status,
    ]);

    const project = result.rows[0]; // Get the newly inserted project details

    res.json({
      message: "Project created successfully",
      project,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route to get all projects
app.get("/projects", verifyToken, async (req, res) => {
  const query = `SELECT * FROM projects`;

  try {
    const result = await pool.query(query);
    res.json(result.rows); // Send back the rows from the database
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to get a specific project by ID
app.get("/projects/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const query = `SELECT * FROM projects WHERE id = $1`;

  try {
    const result = await pool.query(query, [id]);
    const project = result.rows[0]; // Get the first row (there should be only one project)

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to edit an existing project
app.put("/projects/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { name, domain_name, status } = req.body;
  const { id: updated_by } = req.user;

  // SQL query to update project
  const query = `
    UPDATE projects 
    SET name = $1, domain_name = $2, status = $3, updated_by = $4, last_used_date = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING id, name, domain_name, status, updated_by, last_used_date;
  `;

  try {
    const result = await pool.query(query, [
      name,
      domain_name,
      status,
      updated_by,
      id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const updatedProject = result.rows[0]; // Get the updated project
    res.json({
      message: "Project updated successfully",
      project: updatedProject,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to delete a project
app.delete("/projects/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const query = `DELETE FROM projects WHERE id = $1 RETURNING id`;

  try {
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ message: "Project deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to add a new keyword
app.post("/keywords", verifyToken, async (req, res) => {
  const {
    project_id,
    keyword,
    search_engine,
    search_location = "Default Location",
    status = "Active", // Default value
  } = req.body;

  const { id: created_by } = req.user;

  const query = `
    INSERT INTO keywords (project_id, keyword, search_engine, search_location, created_by, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, project_id, keyword, search_engine, search_location, created_by, status, created_date
  `;

  try {
    const result = await pool.query(query, [
      project_id,
      keyword,
      search_engine,
      search_location,
      created_by,
      status,
    ]);

    const keywordData = result.rows[0]; // Since we're using RETURNING, result.rows contains the inserted data

    res.json({
      message: "Keyword created successfully",
      keyword: {
        ...keywordData,
        created_date: new Date().toISOString(), // Add the created date manually if it's not in the database
      },
    });
  } catch (err) {
    res.status(400).json({ error: "Database error: " + err.message });
  }
});

// Route to get all keywords for a specific project
app.get("/keywords/:project_id", verifyToken, async (req, res) => {
  const { project_id } = req.params;

  const query = `
    SELECT * FROM keywords WHERE project_id = $1
  `;

  try {
    const result = await pool.query(query, [project_id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No keywords found for this project." });
    }

    res.json({
      message: "Keywords retrieved successfully",
      keywords: result.rows,
    });
  } catch (err) {
    res.status(400).json({ error: "Database error: " + err.message });
  }
});

//updating  the latest_manual_check_rank
app.put("/keywords/:id", verifyToken, async (req, res) => {
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

  try {
    // Query to check if the mapping already exists
    const checkQuery = `
      SELECT id FROM Keyword_Website_mapping
      WHERE keyword_id = $1 AND website_id = $2
    `;
    const { rows } = await pool.query(checkQuery, [keyword_id, website_id]);

    if (rows.length > 0) {
      // If the mapping exists, update the entry
      const updateQuery = `
        UPDATE Keyword_Website_mapping
        SET latest_manual_check_rank = $1, last_check_date = CURRENT_TIMESTAMP
        WHERE keyword_id = $2 AND website_id = $3
        RETURNING id, keyword_id, website_id, latest_manual_check_rank
      `;
      const updateResult = await pool.query(updateQuery, [
        latest_manual_check_rank,
        keyword_id,
        website_id,
      ]);

      res.json({
        message: "Mapping updated successfully",
        mapping: updateResult.rows[0],
      });
    } else {
      // If the mapping doesn't exist, insert a new mapping
      const insertQuery = `
        INSERT INTO Keyword_Website_mapping (
          keyword_id, website_id, latest_manual_check_rank, last_check_date
        )
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING id, keyword_id, website_id, latest_manual_check_rank
      `;
      const insertResult = await pool.query(insertQuery, [
        keyword_id,
        website_id,
        latest_manual_check_rank,
      ]);

      res.json({
        message: "Mapping added successfully",
        mapping: insertResult.rows[0],
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Database error: " + err.message });
  }
});

// updating the latest_auto_check_rank and also populating the rankhistory table
app.put("/keywordsauto/:id", verifyToken, async (req, res) => {
  const { id: keyword_id } = req.params;
  let { website_id, latest_auto_search_rank } = req.body;

  // Default value for invalid rank
  if (latest_auto_search_rank === undefined || isNaN(latest_auto_search_rank)) {
    latest_auto_search_rank = -1; // Set to -1 if invalid
  }

  // Validate website_id
  if (!website_id || isNaN(website_id)) {
    return res
      .status(400)
      .json({ message: "website_id must be a valid integer." });
  }

  try {
    // Check if the mapping already exists
    const checkQuery = `
      SELECT id FROM Keyword_Website_mapping 
      WHERE keyword_id = $1 AND website_id = $2
    `;
    const { rows: checkRows } = await pool.query(checkQuery, [
      keyword_id,
      website_id,
    ]);

    // Function to update rank history
    const updateRankHistory = async () => {
      const insertRankHistoryQuery = `
        INSERT INTO rankhistory (keyword_id, website_id, rank, checked_date)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `;
      await pool.query(insertRankHistoryQuery, [
        keyword_id,
        website_id,
        latest_auto_search_rank,
      ]);
    };

    if (checkRows.length > 0) {
      // If mapping exists, update it
      const updateQuery = `
        UPDATE Keyword_Website_mapping 
        SET latest_auto_search_rank = $1, last_check_date = CURRENT_TIMESTAMP
        WHERE keyword_id = $2 AND website_id = $3
        RETURNING id, keyword_id, website_id, latest_auto_search_rank
      `;
      const { rows: updateRows } = await pool.query(updateQuery, [
        latest_auto_search_rank,
        keyword_id,
        website_id,
      ]);

      // Update rank history and respond
      await updateRankHistory();
      res.json({
        message: "Mapping updated and rankhistory recorded successfully",
        mapping: updateRows[0],
      });
    } else {
      // If mapping doesn't exist, insert it
      const insertQuery = `
        INSERT INTO Keyword_Website_mapping (keyword_id, website_id, latest_auto_search_rank, last_check_date)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING id, keyword_id, website_id, latest_auto_search_rank
      `;
      const { rows: insertRows } = await pool.query(insertQuery, [
        keyword_id,
        website_id,
        latest_auto_search_rank,
      ]);

      // Update rank history and respond
      await updateRankHistory();
      res.json({
        message: "Mapping added and rankhistory recorded successfully",
        mapping: insertRows[0],
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Database error: " + err.message });
  }
});

//update status of keyword
app.put("/keywords/:id/status", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate the status value
  if (!["Active", "Inactive"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  try {
    // Update the keyword's status
    const query = `
      UPDATE keywords
      SET status = $1
      WHERE id = $2
      RETURNING id, status
    `;

    const { rows } = await pool.query(query, [status, id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Keyword not found." });
    }

    // Return a success message with the updated status
    res.json({
      message: `Keyword status updated to ${status}`,
      keyword: rows[0],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route to delete a keyword by its ID
app.delete("/keywords/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Delete the keyword
    const query = `
      DELETE FROM keywords
      WHERE id = $1
      RETURNING id
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Keyword not found." });
    }

    // Return a success message
    res.json({ message: "Keyword deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

//route to join keywords and rank route
app.get(
  "/ranks/project/:project_id/website/:website_id",
  verifyToken,
  async (req, res) => {
    const { project_id, website_id } = req.params;

    // Validate project_id and website_id
    if (isNaN(project_id) || isNaN(website_id)) {
      return res
        .status(400)
        .json({ message: "project_id and website_id must be valid integers." });
    }

    // Define the query to fetch ranks
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
        AND kwm.website_id = $1
      WHERE k.project_id = $2
    `;

    try {
      // Execute the query with parameterized values
      const { rows } = await pool.query(query, [website_id, project_id]);

      // If no records are found, return a 404
      if (rows.length === 0) {
        return res.status(404).json({
          message: "No records found for the given project_id and website_id.",
        });
      }

      // Send the results as JSON
      res.json({
        message: "Ranks fetched successfully",
        data: rows,
      });
    } catch (err) {
      // Handle errors
      res.status(500).json({ error: "Database error: " + err.message });
    }
  }
);

//route to retrieves all keywords for a specific project along with their corresponding rank for each website
app.get("/project/:projectId/keywords", async (req, res) => {
  const projectId = req.params.projectId;

  // Define the query
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
    WHERE k.project_id = $1
    ORDER BY k.keyword, w.website;
  `;

  try {
    // Execute the query using parameterized values
    const { rows } = await pool.query(query, [projectId]);

    // If no results are found
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No keywords found for this project." });
    }

    // Return the results
    res.json(rows);
  } catch (err) {
    console.error("Error fetching keywords:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

//route to add new website
app.post("/websites", verifyToken, async (req, res) => {
  const {
    project_id,
    website,
    ownership_type,
    website_type,
    status = "Active",
  } = req.body;
  const { id: created_by } = req.user;

  // Validate required fields
  if (!project_id || !website || !ownership_type || !website_type) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = `
    INSERT INTO websites (project_id, website, ownership_type, website_type, created_by, status) 
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, project_id, website, ownership_type, website_type, created_by, status;
  `;

  try {
    // Execute the query
    const { rows } = await pool.query(query, [
      project_id,
      website,
      ownership_type,
      website_type,
      created_by,
      status,
    ]);

    // Respond with the newly added website
    res.json({
      message: "Website added successfully",
      website: rows[0], // Return the first row (the newly added website)
    });
  } catch (err) {
    console.error("Error adding website:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

// Route to get all websites for a specific project
app.get("/websites/:project_id", verifyToken, async (req, res) => {
  const { project_id } = req.params;

  const query = `
    SELECT * FROM websites WHERE project_id = $1;
  `;

  try {
    // Execute the query
    const { rows } = await pool.query(query, [project_id]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No websites found for this project." });
    }

    res.json({
      message: "websites retrieved successfully",
      websites: rows,
    });
  } catch (err) {
    console.error("Error fetching websites:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

//update status of website
app.put("/website/:id/status", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate status
  if (!["Active", "Inactive"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  const query = `
    UPDATE websites
    SET status = $1
    WHERE id = $2
    RETURNING id, status;
  `;

  try {
    // Execute the query
    const { rows } = await pool.query(query, [status, id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Website not found." });
    }

    res.json({
      message: `Website status updated to ${status}`,
      website: rows[0], // Returning updated website data
    });
  } catch (err) {
    console.error("Error updating website status:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

// Route to get rank and date by keyword_id and website_id
app.get("/rankhistory/:keywordId/:websiteId", async (req, res) => {
  const { keywordId, websiteId } = req.params;

  const query = `
    SELECT rank, checked_date
    FROM rankhistory
    WHERE keyword_id = $1 AND website_id = $2
  `;

  try {
    // Execute the query
    const { rows } = await pool.query(query, [keywordId, websiteId]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No record found for the given keyword and website.",
      });
    }

    res.json(rows);
  } catch (err) {
    console.error("Error fetching data:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
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

    // Store scraped data into the PostgreSQL database
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert unique links
      const uniqueLinksArray = Array.from(uniqueLinks);
      for (const link of uniqueLinksArray) {
        await client.query(
          `INSERT INTO scraped_links (url, base_domain) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [link, baseDomain]
        );
      }

      // Insert unique images
      const uniqueImagesArray = Array.from(uniqueImages);
      for (const image of uniqueImagesArray) {
        await client.query(
          `INSERT INTO scraped_images (image_url, base_domain) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [image, baseDomain]
        );
      }

      // Insert detailed page scraping results
      for (const page of results) {
        await client.query(
          `INSERT INTO scraped_pages 
          (url, base_domain, linked_from, page_size, response_time_ms, title, meta_description, meta_keywords)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING`,
          [
            page.url,
            baseDomain,
            page.linked_from || null,
            page.page_size || null,
            page.response_time_ms || null,
            page.title || null,
            page.metaTags?.Description || null,
            page.metaTags?.Keywords || null,
          ]
        );
      }

      await client.query("COMMIT");

      // Return scraped results
      res.status(200).json({
        uniqueLinks: uniqueLinksArray, // Links stored in DB
        uniqueImages: uniqueImagesArray, // Images stored in DB
        pages: results, // Detailed page-wise scraping results
      });
    } catch (dbErr) {
      await client.query("ROLLBACK");
      console.error("Database error:", dbErr.message);
      res
        .status(500)
        .json({ error: "Failed to save scraped data to database." });
    } finally {
      client.release();
    }
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
    WHERE id = $1;
  `;

  // Prepare result data
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

  // Prepare query values
  const values = [
    jobId,
    "completed", // Status
    100, // Progress percentage
    JSON.stringify(resultData), // Result data as JSON
    JSON.stringify(errorLogs), // Error logs as JSON
    scrapedData[0] ? scrapedData[0].url : null, // Representative URL
  ];

  try {
    // Execute the query using a PostgreSQL client pool
    const result = await pool.query(query, values);

    if (result.rowCount > 0) {
      console.log(
        `Job updated successfully for websiteId ${websiteId} with jobId ${jobId}.`
      );
    } else {
      console.warn(`No job found with jobId ${jobId}.`);
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
  const { url, websiteId, jobId } = job.data; // Include jobId from database
  const baseDomain = new URL(url).hostname;

  const auditBy = job.id; // Bull job ID as an identifier for the audit

  console.log(`Processing job for URL: ${url} with Website ID: ${websiteId}`);

  try {
    // Initialize progress variables
    let totalScraped = 0;
    let totalUrls = 1; // Start with 1 to avoid division by zero

    // Function to update progress in PostgreSQL
    const updateProgress = async (scrapedData, queueSize) => {
      totalScraped = scrapedData.length;
      totalUrls = totalScraped + queueSize;

      // Ensure totalUrls is not zero to avoid NaN
      const progress = Math.min(
        ((totalScraped / totalUrls) * 100).toFixed(2),
        100
      );

      // Update progress in the database
      const query = `
        UPDATE scraping_jobs
        SET progress = $1
        WHERE job_id = $2;
      `;

      await pool.query(query, [progress, jobId]); // Update the job's progress
      console.log(`Progress for Job ${job.id}: ${progress}%`);
    };

    // Perform the scraping and database saving
    const results = await scrapeAllPages(
      url,
      baseDomain,
      websiteId,
      auditBy,
      updateProgress // Pass the progress updater
    );

    console.log(
      `Scraping and database operations for Job ${job.id} completed.`
    );

    // Save the final results in the database
    const resultQuery = `
      UPDATE scraping_jobs
      SET
        status = $1,
        progress = $2,
        result = $3,
        errors = $4
      WHERE job_id = $5;
    `;

    await pool.query(resultQuery, [
      "completed",
      100,
      JSON.stringify({
        uniqueLinks: Array.from(results.uniqueLinks),
        uniqueImages: Array.from(results.uniqueImages),
        pages: results.pages,
      }),
      JSON.stringify(results.errors),
      jobId,
    ]);

    console.log(`Job ${job.id} updated successfully in the database.`);

    // Return the results to store in Bull's job.returnvalue
    return {
      uniqueLinks: results.uniqueLinks,
      uniqueImages: results.uniqueImages,
      pages: results.pages,
      errors: results.errors,
    };
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error.message);

    // Update the job status to "failed" in the database
    const errorQuery = `
      UPDATE scraping_jobs
      SET
        status = $1,
        errors = $2
      WHERE job_id = $3;
    `;

    await pool.query(errorQuery, [
      "failed",
      JSON.stringify(error.message),
      jobId,
    ]);

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
  const client = await pool.connect(); // Get a connection from the pool

  try {
    await client.query("BEGIN"); // Start a transaction

    let auditId;

    // Insert into Site_Audits and return the generated audit_id
    try {
      const auditInsertQuery = `
        INSERT INTO site_audits (audit_id, website_id, audit_by, audit_status) 
        VALUES ($1, $2, $3, $4) RETURNING id
      `;
      const auditResult = await client.query(auditInsertQuery, [
        auditBy,
        websiteId,
        auditBy,
        "Completed",
      ]);
      auditId = auditResult.rows[0].id; // Get the generated audit ID
      console.log("Audit ID created:", auditId);
    } catch (err) {
      console.error("Error inserting into site_audits:", err.message);
      throw new Error("Failed to insert into site_audits.");
    }

    // Insert data into Site_Audit_Pages
    try {
      for (const page of scrapedData.pages) {
        await client.query(
          `
          INSERT INTO site_audit_pages 
          (audit_id, url, crawl_status, linked_from, page_size, response_time_ms, found_in_crawl, meta_title, meta_description, meta_keywords) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
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
          ]
        );
        //console.log("Inserted page:", page.url);
      }
    } catch (err) {
      console.error("Error inserting into site_audit_pages:", err.message);
      throw new Error("Failed to insert into site_audit_pages.");
    }

    // Insert data into Site_Audit_Images
    try {
      for (const image of scrapedData.uniqueImages) {
        await client.query(
          `
          INSERT INTO site_audit_images 
          (audit_id, image_url, crawl_status, linked_from, image_size, alt_text, file_name, response_time_ms) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [
            auditId,
            image.url || null,
            "Completed",
            image.linked_from || null,
            image.size || null,
            image.alt_text || null,
            image.url?.split("/").pop() || null,
            image.response_time_ms || null,
          ]
        );
        //console.log("Inserted image:", image.url);
      }
    } catch (err) {
      console.error("Error inserting into site_audit_images:", err.message);
      throw new Error("Failed to insert into site_audit_images.");
    }

    await client.query("COMMIT"); // Commit the transaction
    console.log("Audit data saved successfully.");
    return { success: true, auditId };
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback the transaction in case of an error
    console.error("Transaction failed:", err.message);
    throw err; // Rethrow error for further handling
  } finally {
    client.release(); // Release the client back to the pool
  }
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

  const client = await pool.connect(); // Get a client from the connection pool

  try {
    // Start a transaction
    await client.query("BEGIN");

    // Insert or update each job into scraping_jobs table
    const jobInsertQuery = `
      INSERT INTO scraping_jobs (id, url, website_id, status, progress, result)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        result = excluded.result
    `;

    for (const job of jobs) {
      await client.query(jobInsertQuery, [
        job.id,
        job.url,
        job.websiteId, // Ensure this is not null
        job.status,
        job.progress,
        JSON.stringify(job.result), // Storing the result as a JSON string
      ]);
    }

    // Commit the transaction
    await client.query("COMMIT");
    client.release(); // Release the client back to the pool

    res.status(200).json({ message: "Jobs saved successfully" });
  } catch (error) {
    // If an error occurs, rollback the transaction
    await client.query("ROLLBACK");
    client.release(); // Release the client back to the pool
    console.error("Error saving scraping jobs:", error.message);
    res
      .status(500)
      .json({ message: "Failed to save jobs", error: error.message });
  }
});

// Fetch Jobs API
app.get("/scraping-jobs", async (req, res) => {
  const client = await pool.connect(); // Get a client from the connection pool

  try {
    // Query to get all scraping jobs, including the 'date' column
    const result = await client.query("SELECT *, date FROM scraping_jobs");

    if (result.rows.length === 0) {
      console.log("No jobs found.");
      return res.status(200).json([]); // Return an empty array if no jobs exist
    }

    // Safely process each row and attempt to parse the `result` field
    const formattedJobs = result.rows.map((job) => {
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
  } catch (error) {
    console.error("Unexpected server error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch jobs", error: error.message });
  } finally {
    client.release(); // Release the client back to the pool
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
app.get("/results/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const client = await pool.connect(); // Get a client from the connection pool

  const query = `
    SELECT * 
    FROM scraping_jobs 
    WHERE id = $1
  `;

  try {
    // Query the database for the job with the provided jobId
    const result = await client.query(query, [jobId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "No record found for the given jobId.",
      });
    }

    const row = result.rows[0]; // Get the first (and only) result row

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

    // Return the job data along with the parsed or raw result
    res.json({
      ...row,
      result: parsedResult,
    });
  } catch (error) {
    console.error("Error fetching job data:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release(); // Release the client back to the pool
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(500).json({ error: "Something went wrong!" });
});

// Endpoint to update scraping job by jobId
app.patch("/update-scraping-job", async (req, res) => {
  const { jobId, result } = req.body;

  const client = await pool.connect(); // Get a client from the connection pool

  try {
    // Ensure jobId is treated as a string
    const jobIdStr = String(jobId);

    // SQL query to update the job status, progress, and result
    const query = `
      UPDATE scraping_jobs
      SET status = 'completed',
          progress = 100,
          result = $1
      WHERE id = $2
    `;

    // Execute the query with parameterized values
    const resultUpdate = await client.query(query, [result, jobIdStr]);

    if (resultUpdate.rowCount === 0) {
      // No rows were updated, meaning the jobId was not found
      return res.status(404).json({ message: "Job not found" });
    }

    // Return a success response if the update was successful
    res.status(200).json({ message: "Job updated successfully" });
  } catch (error) {
    console.error("Error updating job:", error.message);
    res
      .status(500)
      .json({ message: "Failed to update job", error: error.message });
  } finally {
    client.release(); // Release the client back to the pool
  }
});

// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

const server = app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
server.setTimeout(5 * 60 * 1000); // Set timeout to 5 minutes
