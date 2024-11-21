//npm install express axios cheerio

// const express = require("express");
// const axios = require("axios");
// const cheerio = require("cheerio");

// const app = express();
// const PORT = 3000;

// Route to scrape website details
app.get("/scrape", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    // Fetch website's HTML
    const { data: html } = await axios.get(url);

    // Load HTML into Cheerio
    const $ = cheerio.load(html);

    // Extract title
    const title = $("title").text();

    // Extract meta tags
    const metaTags = {};
    $("meta").each((_, el) => {
      const name = $(el).attr("name") || $(el).attr("property");
      const content = $(el).attr("content");
      if (name && content) {
        metaTags[name] = content;
      }
    });

    // Extract links
    const links = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        links.push(href);
      }
    });

    // Extract images
    const images = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        images.push(src);
      }
    });

    // Extract favicon
    const favicon = $('link[rel="icon"]').attr("href");

    // Extract canonical URL
    const canonical = $('link[rel="canonical"]').attr("href");

    // Return the extracted details
    res.status(200).json({
      title,
      metaTags,
      links,
      images,
      favicon,
      canonical,
      url,
    });
  } catch (error) {
    console.error("Error scraping website:", error.message);
    res.status(500).json({ error: "Failed to scrape website." });
  }
});

// Start the server
// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

//http://localhost:3000/scrape?url=https://example.com
