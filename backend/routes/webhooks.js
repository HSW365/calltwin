const express = require("express");
const Stripe = require("stripe");
const User = require("../models/User");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const user = await User.findById(session.metadata?.userId);
        if (!user) break;

        const plan = session.metadata?.plan;
        user.stripeCustomerId = session.customer || user.stripeCustomerId;

        if (plan === "calltwin") user.calltwinPurchased = true;
        if (plan === "website") user.websitePurchased = true;
        if (plan === "bundle") {
          user.bundlePurchased = true;
          user.calltwinPurchased = true;
          user.websitePurchased = true;
        }

        if (plan === "calltwin" || plan === "bundle") {
          user.subscriptionStatus = "active";
        }
        await user.save();
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[webhooks/stripe] handler error:", err);
    res.status(500).json({ error: "Internal error processing webhook." });
  }
});

module.exports = router;
