const express = require("express");
const Stripe = require("stripe");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    if (!process.env.CALLTWIN_PRICE_ID) {
      return res.status(500).json({
        error: "CALLTWIN_PRICE_ID is not set on the backend. Create a $20/mo recurring price in Stripe and add its price ID to Render env vars.",
      });
    }

    // Subscription line item (required). Optional one-time setup fee line
    // item ($299 setup) is included automatically if SETUP_FEE_PRICE_ID is
    // set — Stripe Checkout supports mixing a one-time price with a
    // recurring price in a single "subscription" mode session.
    const line_items = [{ price: process.env.CALLTWIN_PRICE_ID, quantity: 1 }];
    if (process.env.SETUP_FEE_PRICE_ID) {
      line_items.push({ price: process.env.SETUP_FEE_PRICE_ID, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items,
      customer_email: req.user.email,
      success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled`,
      metadata: { userId: req.user._id.toString() },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lets the dashboard confirm right after redirect back from Stripe whether
// the webhook has landed yet, without needing to hit /api/auth/me repeatedly.
router.get("/status", requireAuth, async (req, res) => {
  res.json({ subscriptionStatus: req.user.subscriptionStatus || "inactive" });
});

module.exports = router;
