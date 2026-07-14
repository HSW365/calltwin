const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// Returns the real current user + real subscription status.
// Used by the dashboard on session restore instead of assuming "active".
router.get("/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      email: req.user.email,
      businessName: req.user.businessName,
      subscriptionStatus: req.user.subscriptionStatus || "inactive",
    },
  });
});

function signToken(user) {
  return jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// Free, instant signup — no card required.
router.post("/signup", async (req, res) => {
  try {
    const { email, password, businessName } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Account already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, businessName: businessName || "" });

    res.json({ token: signToken(user), user: { email: user.email, subscriptionStatus: user.subscriptionStatus } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials." });

    res.json({ token: signToken(user), user: { email: user.email, subscriptionStatus: user.subscriptionStatus } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
