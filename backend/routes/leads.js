const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { requireAuth } = require("../middleware/authMiddleware");
const Lead = require("../models/Lead");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Add a single lead manually.
router.post("/", requireAuth, async (req, res) => {
  try {
    const { businessName, contactName, phone, city, state, campaign } = req.body;
    const lead = await Lead.create({
      owner: req.user._id,
      businessName,
      contactName: contactName || "",
      phone,
      city: city || "",
      state: state || "",
      campaign: campaign || null,
    });
    res.json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bulk upload via CSV: businessName,contactName,phone,city,state
router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const records = parse(req.file.buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const campaignId = req.body.campaign || null;
    let created = 0;
    let skipped = 0;

    for (const row of records) {
      if (!row.phone) { skipped++; continue; }
      try {
        await Lead.create({
          owner: req.user._id,
          businessName: row.businessName || "Unknown",
          contactName: row.contactName || "",
          phone: row.phone,
          city: row.city || "",
          state: row.state || "",
          campaign: campaignId,
        });
        created++;
      } catch (e) {
        skipped++; // likely a duplicate phone number for this owner
      }
    }

    res.json({ created, skipped, total: records.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req, res) => {
  const leads = await Lead.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(500);
  res.json(leads);
});

module.exports = router;
