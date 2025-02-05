const { google } = require("googleapis");
require("dotenv").config();

// Set up OAuth 2.0 client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Generate the authentication URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/analytics.manage.users.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/business.manage",
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/business.manage",
    "https://www.googleapis.com/auth/plus.business.manage",
    "https://www.googleapis.com/auth/adwords",
  ],
});

console.log("Authorize this app by visiting this URL:", authUrl);

// Exchange code for tokens
async function getTokens(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log("Access tokens:", tokens);
    return tokens;
  } catch (error) {
    console.error("Error fetching tokens:", error.message);
    throw error;
  }
}

// Function to set credentials from stored tokens
function setCredentials(tokens) {
  oauth2Client.setCredentials(tokens);
}

// Refresh tokens automatically
oauth2Client.on("tokens", (tokens) => {
  if (tokens.refresh_token) {
    console.log("Refresh token:", tokens.refresh_token);
    // Save the refresh token securely (e.g., in a database)
  }
  console.log("Access token:", tokens.access_token);
});

// Export both oauth2Client and authUrl
module.exports = { oauth2Client, authUrl, getTokens, setCredentials };
