const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const Campaign = require("../models/Campaign");

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const campaign = await Campaign.create({ owner: req.user._id, ...req.body });
    res.json(campaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req, res) => {
  const campaigns = await Campaign.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.json(campaigns);
});

// Turn a campaign on/off — this is the literal "start it running 24/7" switch.
router.patch("/:id/toggle", requireAuth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id });
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    campaign.active = req.body.active !== undefined ? req.body.active : !campaign.active;
    await campaign.save();
    res.json(campaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
      { new: true }
    );
    res.json(campaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
