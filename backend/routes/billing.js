const express = require("express");
const Stripe = require("stripe");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  calltwin: {
    env: "CALLTWIN_ONE_TIME_PRICE_ID",
    plan: "calltwin",
    label: "CallTwin AI Phone Receptionist",
  },
  website: {
    env: "WEBSITE_ONE_TIME_PRICE_ID",
    plan: "website",
    label: "New Business Website",
  },
  bundle: {
    env: "CALLTWIN_WEBSITE_BUNDLE_PRICE_ID",
    plan: "bundle",
    label: "CallTwin + New Business Website",
  },
};

router.get("/products", (req, res) => {
  res.json({
    products: [
      { id: "calltwin", label: PRODUCTS.calltwin.label, price: 500, currency: "usd", oneTime: true },
      { id: "website", label: PRODUCTS.website.label, price: Number(process.env.WEBSITE_DISPLAY_PRICE || 500), currency: "usd", oneTime: true },
      { id: "bundle", label: PRODUCTS.bundle.label, price: Number(process.env.BUNDLE_DISPLAY_PRICE || 900), currency: "usd", oneTime: true },
    ],
  });
});

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const product = PRODUCTS[req.body?.product || "calltwin"];
    if (!product) return res.status(400).json({ error: "Invalid product." });

    const priceId = process.env[product.env];
    if (!priceId) {
      return res.status(500).json({
        error: `${product.env} is not configured. Create the matching one-time Stripe Price and add its Price ID to Render.`,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: req.user.email,
      success_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=success&product=${product.plan}`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/dashboard?billing=canceled&product=${product.plan}`,
      metadata: { userId: req.user._id.toString(), plan: product.plan },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, product: product.plan, label: product.label });
  } catch (err) {
    console.error("[billing/checkout]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/status", requireAuth, async (req, res) => {
  res.json({
    subscriptionStatus: req.user.subscriptionStatus || "inactive",
    isLifetime: !!req.user.isLifetime,
    products: {
      calltwin: !!req.user.calltwinPurchased,
      website: !!req.user.websitePurchased,
      bundle: !!req.user.bundlePurchased,
    },
  });
});

module.exports = router;
