// const scrapeAllPages = async (startUrl, baseDomain) => {
//   const queue = [startUrl];
//   const scrapedData = [];

//   while (queue.length > 0) {
//     const currentUrl = queue.shift();

//     if (visitedUrls.has(currentUrl)) {
//       continue;
//     }

//     console.log(`Scraping URL: ${currentUrl}`);
//     visitedUrls.add(currentUrl); // Mark URL as visited

//     try {
//       const { data: html } = await axios.get(currentUrl);
//       const $ = cheerio.load(html);

//       const title = $("title").text();

//       const metaTags = {};
//       $("meta").each((_, el) => {
//         const name = $(el).attr("name") || $(el).attr("property");
//         const content = $(el).attr("content");
//         if (name && content) {
//           metaTags[name] = content;
//         }
//       });

//       const links = [];
//       $("a").each((_, el) => {
//         const href = $(el).attr("href");
//         if (href) {
//           const resolvedUrl = new URL(href, currentUrl).href;

//           // Exclude image URLs based on file extensions
//           if (
//             !/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(resolvedUrl) &&
//             isSameDomain(resolvedUrl, baseDomain)
//           ) {
//             links.push(resolvedUrl);
//             uniqueLinks.add(resolvedUrl); // Add to unique links
//             if (!visitedUrls.has(resolvedUrl)) {
//               queue.push(resolvedUrl);
//             }
//           }
//         }
//       });

//       const images = [];
//       $("img").each((_, el) => {
//         const src = $(el).attr("src");
//         if (src) {
//           const resolvedImage = new URL(src, currentUrl).href;
//           images.push(resolvedImage);
//           uniqueImages.add(resolvedImage); // Add to unique images
//         }
//       });

//       const favicon = $('link[rel="icon"]').attr("href");
//       const canonical = $('link[rel="canonical"]').attr("href");

//       scrapedData.push({
//         url: currentUrl,
//         title,
//         metaTags,
//         links,
//         images,
//         favicon: favicon ? new URL(favicon, currentUrl).href : null,
//         canonical,
//       });
//     } catch (error) {
//       console.error(`Failed to scrape URL: ${currentUrl} - ${error.message}`);
//     }
//   }

//   return scrapedData;
// };

// const scrapeAllPages = async (
//     startUrl,
//     baseDomain,
//     websiteId,
//     auditBy,
//     progressCallback
//   ) => {
//     const queue = [startUrl];
//     const scrapedData = [];
//     const visitedUrls = new Set(); // Keep this local as it's specific to the function

//     while (queue.length > 0) {
//       const currentUrl = queue.shift();

//       if (visitedUrls.has(currentUrl)) continue; // Skip already visited URLs
//       visitedUrls.add(currentUrl);

//       try {
//         const { data: html } = await axios.get(currentUrl);
//         const $ = cheerio.load(html);

//         const title = $("title").text();
//         const metaTags = {};
//         $("meta").each((_, el) => {
//           const name = $(el).attr("name") || $(el).attr("property");
//           const content = $(el).attr("content");
//           if (name && content) metaTags[name] = content;
//         });

//         const links = [];
//         // Updated section to filter out image links
//         $("a").each((_, el) => {
//           const href = $(el).attr("href");
//           if (href) {
//             const resolvedUrl = new URL(href, currentUrl).href;

//             // Exclude links with image extensions
//             const imageExtensions = [
//               ".jpg",
//               ".jpeg",
//               ".png",
//               ".gif",
//               ".webp",
//               ".svg",
//             ];
//             const isImageLink = imageExtensions.some((ext) =>
//               resolvedUrl.toLowerCase().endsWith(ext)
//             );

//             if (
//               !isImageLink && // Exclude image links
//               !visitedUrls.has(resolvedUrl) &&
//               isSameDomain(resolvedUrl, baseDomain)
//             ) {
//               links.push(resolvedUrl);
//               uniqueLinks.add(resolvedUrl); // Ensure uniqueness
//               queue.push(resolvedUrl); // Add to queue for further scraping
//             }
//           }
//         });

//         const images = [];
//         $("img").each((_, el) => {
//           const src = $(el).attr("src");
//           if (src) {
//             const resolvedImage = new URL(src, currentUrl).href;
//             images.push(resolvedImage);
//             uniqueImages.add(resolvedImage); // Update the global set
//           }
//         });

//         const favicon = $('link[rel="icon"]').attr("href");
//         const canonical = $('link[rel="canonical"]').attr("href");

//         scrapedData.push({
//           url: currentUrl,
//           title,
//           metaTags,
//           links,
//           images,
//           favicon: favicon ? new URL(favicon, currentUrl).href : null,
//           canonical,
//         });

//         // Invoke progress callback
//         if (progressCallback) {
//           progressCallback(scrapedData.length, queue.length);
//         }
//       } catch (error) {
//         console.error(`Failed to scrape ${currentUrl}: ${error.message}`);
//       }
//     }

//     // Save data to the database
//     try {
//       await saveAuditData(websiteId, auditBy, {
//         uniqueLinks: Array.from(uniqueLinks),
//         uniqueImages: Array.from(uniqueImages),
//         pages: scrapedData,
//       });
//       console.log("Data saved to the database.");
//     } catch (error) {
//       console.error("Error saving data:", error.message);
//     }

//     // Return collected data
//     return {
//       uniqueLinks: Array.from(uniqueLinks), // Use global sets
//       uniqueImages: Array.from(uniqueImages), // Use global sets
//       pages: scrapedData,
//     };
//   };

// scrapeQueue.process(async (job) => {
//   const { url, websiteId } = job.data;
//   const baseDomain = new URL(url).hostname;

//   // Use job.id as auditBy for tracking and logging
//   const auditBy = job.id;

//   try {
//     console.log(`Processing job for URL: ${url} with Website ID: ${websiteId}`);

//     // Initialize tracking variables
//     let totalScraped = 0;
//     let totalUrls = 0;

//     // Start scraping and keep track of progress
//     const results = await scrapeAllPages(
//       url,
//       baseDomain,
//       websiteId, // Use the provided websiteId
//       auditBy,
//       (scrapedData, queueSize) => {
//         totalScraped = scrapedData.length;
//         totalUrls = queueSize;

//         // Update progress: calculate the percentage of scraping completed
//         job.progress(((totalScraped / totalUrls) * 100).toFixed(2));
//       }
//     );

//     console.log("Scraping complete!");

//     // Notify frontend via WebSocket
//     // io.emit("scrapeComplete", {
//     //   jobId: job.id,
//     //   websiteId,
//     //   status: "completed",
//     //   results: {
//     //     uniqueLinks: Array.from(uniqueLinks),
//     //     uniqueImages: Array.from(uniqueImages),
//     //     pages: results,
//     //   },
//     // });

//     // Finally, return the result when scraping is finished
//     return {
//       uniqueLinks: Array.from(uniqueLinks),
//       uniqueImages: Array.from(uniqueImages),
//       pages: results,
//     };
//   } catch (error) {
//     console.error("Scraping failed:", error.message);
//     throw new Error("Scraping failed");
//   }
// });

// const saveAuditData = async (websiteId, auditBy, scrapedData) => {
//   db.serialize(() => {
//     // Insert into Site_Audits
//     db.run(
//       `INSERT INTO Site_Audits (website_id, audit_by, audit_status) VALUES (?, ?, ?)`,
//       [websiteId, auditBy, "Completed"],
//       function (err) {
//         if (err) {
//           console.error("Error inserting into Site_Audits:", err.message);
//           return;
//         }

//         const auditId = this.lastID; // Get the inserted audit ID

//         // Insert into Site_Audit_Pages
//         scrapedData.pages.forEach((page) => {
//           db.run(
//             `INSERT INTO Site_Audit_Pages (audit_id, url, crawl_status, linked_from, page_size, response_time_ms, found_in_crawl, meta_title, meta_description, meta_keywords)
//              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//             [
//               auditId,
//               page.url,
//               "Completed",
//               page.linked_from || null,
//               page.page_size || null,
//               page.response_time_ms || null,
//               true, // found_in_crawl
//               page.title || null,
//               page.metaTags?.Description || null,
//               page.metaTags?.Keywords || null,
//             ],
//             (err) => {
//               if (err) {
//                 console.error(
//                   "Error inserting into Site_Audit_Pages:",
//                   err.message
//                 );
//               }
//             }
//           );
//         });

//         // Insert into Site_Audit_Images
//         scrapedData.uniqueImages.forEach((image) => {
//           db.run(
//             `INSERT INTO Site_Audit_Images (audit_id, image_url, crawl_status, linked_from, image_size, alt_text, file_name, response_time_ms)
//              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//             [
//               auditId,
//               image,
//               "Completed",
//               image.linked_from || null,
//               image.size || null,
//               image.alt_text || null,
//               image.file_name || null,
//               image.response_time_ms || null,
//             ],
//             (err) => {
//               if (err) {
//                 console.error(
//                   "Error inserting into Site_Audit_Images:",
//                   err.message
//                 );
//               }
//             }
//           );
//         });
//       }
//     );
//   });
// };

// app.get("/job-status/:jobId", async (req, res) => {
//   const { jobId } = req.params;

//   try {
//     const job = await scrapeQueue.getJob(jobId);

//     if (!job) {
//       return res.status(404).json({ error: "Job not found" });
//     }

//     if (job.isCompleted()) {
//       return res.json({ status: "completed", result: await job.returnvalue });
//     } else if (job.isFailed()) {
//       return res.json({ status: "failed", error: job.failedReason });
//     } else {
//       // Show progress while the job is in progress
//       return res.json({
//         status: "in-progress",
//         progress: job.progress(),
//       });
//     }
//   } catch (error) {
//     console.error("Error fetching job status:", error.message);
//     res.status(500).json({ error: "Failed to fetch job status" });
//   }
// });
