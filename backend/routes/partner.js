/**
 * Partner provisioning API.
 *
 * Lets trusted HSW365 products (QUEENEE website builder) create and activate
 * CallTwin accounts for customers who buy CallTwin as an add-on.
 *
 * Auth: header `x-partner-key` must equal PARTNER_API_KEY (Render env).
 * If PARTNER_API_KEY is not set, every partner request is rejected.
 */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();
const STATUSES = ["none", "active", "past_due", "canceled"];

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function requirePartner(req, res, next) {
  const key = process.env.PARTNER_API_KEY;
  if (!key) return res.status(503).json({ error: "Partner API is not configured." });
  if (!safeEqual(req.get("x-partner-key"), key)) return res.status(401).json({ error: "Unauthorized partner." });
  next();
}

function view(user, created) {
  return {
    ok: true,
    created: !!created,
    email: user.email,
    businessName: user.businessName,
    subscriptionStatus: user.subscriptionStatus,
    isLifetime: !!user.isLifetime,
    hasPassword: !!user.passwordHash,
    partnerSource: user.partnerSource || null,
    partnerRef: user.partnerRef || null
  };
}

/**
 * POST /api/partner/accounts
 * Upserts an account by email.
 * Body: { email, password?, businessName?, status?, source?, ref?, stripeCustomerId? }
 * - password is only applied when the account is created (never overwrites an existing password)
 * - status is never downgraded on founder / lifetime accounts
 */
router.post("/accounts", requirePartner, async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || "").toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Valid email required." });
    if (b.status && !STATUSES.includes(b.status)) return res.status(400).json({ error: "Invalid status." });

    let user = await User.findOne({ email });
    let created = false;
    if (!user) {
      const passwordHash = b.password && String(b.password).length >= 8 ? await bcrypt.hash(String(b.password), 10) : null;
      user = new User({ email, passwordHash, businessName: String(b.businessName || "").trim() });
      created = true;
    }
    if (b.businessName && !user.businessName) user.businessName = String(b.businessName).trim();
    if (b.source) user.partnerSource = String(b.source).slice(0, 60);
    if (b.ref) user.partnerRef = String(b.ref).slice(0, 120);
    if (b.stripeCustomerId) user.stripeCustomerId = String(b.stripeCustomerId);
    if (b.status) {
      const protectedAccount = user.isLifetime || user.isFounderAccount;
      if (!(protectedAccount && b.status !== "active")) user.subscriptionStatus = b.status;
    }
    await user.save();
    res.status(created ? 201 : 200).json(view(user, created));
  } catch (err) {
    console.error("[partner/accounts]", err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/partner/accounts/:email — read status */
router.get("/accounts/:email", requirePartner, async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.params.email || "").toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "Not found." });
    res.json(view(user, false));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
