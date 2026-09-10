const express = require("express");
const Stripe = require("stripe");
const { requireAuth } = require("../middleware/authMiddleware");
const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ENV = {
  starter: "CALLTWIN_STARTER_PRICE_ID",
  growth: "CALLTWIN_GROWTH_PRICE_ID",
  scale: "CALLTWIN_SCALE_PRICE_ID",
};

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const plan = ["starter", "growth", "scale"].includes(req.body?.plan) ? req.body.plan : (req.body?.plan === "lifetime" ? "lifetime" : "starter");
    if (!process.env.PUBLIC_BASE_URL) return res.status(500).json({ error: "PUBLIC_BASE_URL is not configured in Render." });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY is not configured in Render." });

    if (plan === "lifetime") {
      if (!process.env.LIFETIME_PRICE_ID) return res.status(500).json({ error: "LIFETIME_PRICE_ID is not configured." });
      const session = await stripe.checkout.sessions.create({
        mode: "payment", payment_method_types: ["card"],
        line_items: [{ price: process.env.LIFETIME_PRICE_ID, quantity: 1 }],
        customer_email: req.user.email,
        success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success`,
        cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled`,
        metadata: { userId: req.user._id.toString(), plan: "lifetime" }, allow_promotion_codes: true
      });
      return res.json({ url: session.url });
    }

    const envName = PRICE_ENV[plan];
    const recurringPrice = process.env[envName] || (plan === "starter" ? process.env.CALLTWIN_PRICE_ID : "");
    if (!recurringPrice) return res.status(500).json({ error: `${envName} is not configured in Render.` });

    const line_items = [{ price: recurringPrice, quantity: 1 }];
    if (process.env.CALLTWIN_SETUP_PRICE_ID) line_items.push({ price: process.env.CALLTWIN_SETUP_PRICE_ID, quantity: 1 });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", payment_method_types: ["card"], line_items,
      customer_email: req.user.email,
      success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled`,
      metadata: { userId: req.user._id.toString(), plan }, allow_promotion_codes: true
    });
    res.json({ url: session.url });
  } catch (err) { console.error("[billing/checkout]", err); res.status(500).json({ error: err.message }); }
});

router.get("/status", requireAuth, async (req, res) => res.json({ subscriptionStatus: req.user.subscriptionStatus || "inactive", isLifetime: !!req.user.isLifetime }));
module.exports = router;
