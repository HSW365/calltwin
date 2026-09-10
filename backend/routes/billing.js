const express = require("express");
const Stripe = require("stripe");
const { requireAuth } = require("../middleware/authMiddleware");
const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const plan = req.body?.plan === "lifetime" ? "lifetime" : "monthly";
    if (plan === "lifetime") {
      if (!process.env.LIFETIME_PRICE_ID) return res.status(500).json({ error: "LIFETIME_PRICE_ID is not configured." });
      const session = await stripe.checkout.sessions.create({
        mode: "payment", payment_method_types: ["card"], line_items: [{ price: process.env.LIFETIME_PRICE_ID, quantity: 1 }],
        customer_email: req.user.email, success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success`, cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled`,
        metadata: { userId: req.user._id.toString(), plan: "lifetime" }, allow_promotion_codes: true
      });
      return res.json({ url: session.url });
    }

    const recurringPrice = process.env.CALLTWIN_PRICE_ID;
    if (!recurringPrice) return res.status(500).json({ error: "CALLTWIN_PRICE_ID is not configured in Render." });
    const line_items = [{ price: recurringPrice, quantity: 1 }];
    // Optional $500 one-time implementation fee, independent of website purchase.
    if (process.env.CALLTWIN_SETUP_PRICE_ID) line_items.push({ price: process.env.CALLTWIN_SETUP_PRICE_ID, quantity: 1 });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", payment_method_types: ["card"], line_items, customer_email: req.user.email,
      success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success`, cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled`,
      metadata: { userId: req.user._id.toString(), plan: "monthly" }, allow_promotion_codes: true
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/status", requireAuth, async (req, res) => res.json({ subscriptionStatus: req.user.subscriptionStatus || "inactive", isLifetime: !!req.user.isLifetime }));
module.exports = router;
