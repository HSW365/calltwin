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
    // Self-serve CallTwin clients
    try {
      const o = event.data.object || {};
      if (["invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"].includes(event.type)) await require("./clients").stripeEvent(event.type, o);
      if (event.type === "checkout.session.completed" && o.metadata && o.metadata.client === "calltwin") return res.json({ received: true });
    } catch (e) { console.error("[webhooks] clients:", e.message); }
    // Estimate add-on: customer deposits + add-on subscription
    try {
      const o = event.data.object || {};
      const meta = o.metadata || {};
      const types = ["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"];
      if (types.includes(event.type) && (meta.estimate_job || meta.addon === "estimate" || o.subscription || o.object === "subscription")) {
        const handled = await require("../estimate/routes").stripeEvent(event.type, o);
        if (handled && (meta.estimate_job || meta.addon === "estimate")) return res.json({ received: true });
      }
    } catch (e) { console.error("[webhooks] estimate:", e.message); }
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.metadata && session.metadata.client === "newark") {
          await require("./newark").billingUpdate({ stripe_session_id: session.id, status: "active", stripe_customer_id: session.customer, stripe_subscription_id: session.subscription });
          break;
        }
        const user = await User.findById(session.metadata.userId);
        if (user) {
          if (session.metadata.plan === "lifetime" || session.mode === "payment") {
            // One-time $1,000 purchase — active forever, no subscription record.
            user.subscriptionStatus = "active";
            user.isLifetime = true;
            user.stripeCustomerId = session.customer;
          } else {
            user.subscriptionStatus = "active";
            user.stripeCustomerId = session.customer;
            user.stripeSubscriptionId = session.subscription;
          }
          await user.save();
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        if (invoice.subscription) require("./newark").billingUpdate({ stripe_subscription_id: invoice.subscription, status: "active" });
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user && !user.isLifetime) {
          user.subscriptionStatus = "active";
          user.minutesUsed = 0; // reset usage each billing cycle
          user.minutesResetAt = new Date();
          await user.save();
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) require("./newark").billingUpdate({ stripe_subscription_id: invoice.subscription, status: "past_due" });
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user && !user.isLifetime) {
          user.subscriptionStatus = "past_due";
          await user.save();
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        if (sub.metadata && sub.metadata.client === "newark") require("./newark").billingUpdate({ stripe_subscription_id: sub.id, status: "canceled" });
        const user = await User.findOne({ stripeSubscriptionId: sub.id });
        if (user && !user.isLifetime) {
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
