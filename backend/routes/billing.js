const express = require("express");
const Stripe = require("stripe");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: process.env.CALLTWIN_PRICE_ID, quantity: 1 }],
      customer_email: req.user.email,
      success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled`,
      metadata: { userId: req.user._id.toString() },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
