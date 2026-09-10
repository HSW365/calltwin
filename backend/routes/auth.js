const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: {
    email: req.user.email,
    businessName: req.user.businessName,
    twilioPhoneNumber: req.user.twilioPhoneNumber,
    subscriptionStatus: req.user.subscriptionStatus || "inactive",
    isLifetime: !!req.user.isLifetime
  }});
});

function signToken(user) { return jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "365d" }); }

router.post("/signup", async (req, res) => {
  try {
    const { email, password, businessName } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Account already exists." });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, businessName: businessName || "" });
    res.json({ token: signToken(user), user: { email: user.email, businessName: user.businessName, subscriptionStatus: user.subscriptionStatus } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials." });
    if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Invalid credentials." });
    res.json({ token: signToken(user), user: { email: user.email, businessName: user.businessName, subscriptionStatus: user.subscriptionStatus, isLifetime: !!user.isLifetime } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    if (typeof req.body.businessName === "string") req.user.businessName = req.body.businessName.trim();
    if (typeof req.body.twilioPhoneNumber === "string") req.user.twilioPhoneNumber = req.body.twilioPhoneNumber.trim();
    await req.user.save();
    res.json({ saved: true, businessName: req.user.businessName, twilioPhoneNumber: req.user.twilioPhoneNumber });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
