const express = require("express");
const Stripe = require("stripe");
const User = require("../models/User");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// NOTE: this route must receive the RAW body for signature verification.
// In server.js, mount this BEFORE the global express.json() middleware,
// or use express.raw({ type: 'application/json' }) specifically here.
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const user = await User.findById(session.metadata.userId);
        if (user) {
          user.subscriptionStatus = "active";
          user.stripeCustomerId = session.customer;
          user.stripeSubscriptionId = session.subscription;
          await user.save();
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          user.subscriptionStatus = "active";
          user.minutesUsed = 0; // reset usage each billing cycle
          user.minutesResetAt = new Date();
          await user.save();
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          user.subscriptionStatus = "past_due";
          await user.save();
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: sub.id });
        if (user) {
          user.subscriptionStatus = "canceled";
          await user.save();
        }
        break;
      }
      default:
        break; // ignore other event types
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[webhooks/stripe] handler error:", err);
    res.status(500).json({ error: "Internal error processing webhook." });
  }
});

module.exports = router;
