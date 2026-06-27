const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/authMiddleware");
const { cloneVoice } = require("../services/voiceEngine");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload one or more audio samples -> clones into ElevenLabs -> saves voice_id.
router.post("/clone", requireAuth, upload.array("samples", 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "At least one audio file is required." });
    }

    const samples = req.files.map((f) => ({ filename: f.originalname, buffer: f.buffer }));
    const voiceId = await cloneVoice({ name: req.user.businessName || req.user.email, samples });

    req.user.voiceId = voiceId;
    await req.user.save();

    res.json({ voiceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/update the pitch script (knowledge base) the AI uses on calls.
router.post("/pitch-script", requireAuth, async (req, res) => {
  try {
    req.user.pitchScript = req.body.pitchScript || "";
    await req.user.save();
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
