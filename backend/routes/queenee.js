/**
 * QUEENEE integration.
 *
 * QUEENEE is a static landing page on GitHub Pages. It sells:
 *   - Business website: $500 one-time           (Stripe Payment Link)
 *   - Website + CallTwin add-on: $500 + $99/mo   (Stripe Payment Link, subscription mode)
 *     CallTwin is billed $99 on day one, then $99/month for 5 more months, then stops.
 *
 * GitHub Pages can't run server code, so this backend does it:
 *   POST /api/queenee/orders          order form in the signup popup (CORS)
 *   GET  /api/queenee/orders/:id      status for the success page (needs order token)
 *   GET  /api/queenee/session/:sid    status by Stripe checkout session id (success page fallback)
 *   GET  /api/queenee/admin/orders    admin list (header x-admin-token = QUEENEE_ADMIN_TOKEN)
 *   PATCH /api/queenee/admin/orders/:id
 *   handleStripeEvent(event)          called from routes/webhooks.js for every Stripe event
 */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");
const QueeneeOrder = require("../models/QueeneeOrder");
const User = require("../models/User");

const router = express.Router();

const cfg = () => ({
  origins: (process.env.QUEENEE_ORIGINS || "https://hsw365.github.io,https://queenee.io,https://www.queenee.io")
    .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
  adminToken: process.env.QUEENEE_ADMIN_TOKEN || "",
  addonMonths: Number.isFinite(parseInt(process.env.CALLTWIN_ADDON_MONTHS, 10)) ? parseInt(process.env.CALLTWIN_ADDON_MONTHS, 10) : 5,
  afterPlan: (process.env.CALLTWIN_AFTER_PLAN || "keep").toLowerCase() === "end" ? "end" : "keep",
  ownerEmails: (process.env.OWNER_EMAILS || "hsw365media@gmail.com,hoodstarent365@gmail.com").split(",").map((s) => s.trim().toLowerCase()),
  paymentLinkIds: (process.env.QUEENEE_PAYMENT_LINK_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)
});
const totalPayments = () => 1 + cfg().addonMonths;

let stripeClient = null;
function stripe() {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) stripeClient = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
function setStripeForTests(s) { stripeClient = s; }

const clean = (s, max = 1000) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const safeEqual = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- CORS for the GitHub Pages site ----------
router.use((req, res, next) => {
  const origin = (req.get("origin") || "").replace(/\/$/, "");
  if (origin && cfg().origins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
    res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- CallTwin account ----------
async function upsertCallTwin(order, status, password) {
  if (!order.addCallTwin) return null;
  let user = await User.findOne({ email: order.email });
  if (!user) {
    const passwordHash = password && password.length >= 8 ? await bcrypt.hash(password, 10) : null;
    user = new User({ email: order.email, passwordHash, businessName: order.business || "" });
  }
  if (!user.businessName && order.business) user.businessName = order.business;
  user.partnerSource = "queenee";
  user.partnerRef = order.orderId;
  if (order.stripeCustomerId) user.stripeCustomerId = order.stripeCustomerId;
  const protectedAccount = user.isLifetime || user.isFounderAccount;
  if (status && !(protectedAccount && status !== "active")) user.subscriptionStatus = status;
  await user.save();
  return user;
}

function publicView(o, user) {
  return {
    id: o.orderId, business: o.business, email: o.email, status: o.status, comp: o.comp,
    siteType: o.siteType, url: o.url || null,
    addCallTwin: o.addCallTwin,
    calltwin: o.addCallTwin ? {
      status: user ? user.subscriptionStatus : "none",
      hasPassword: !!(user && user.passwordHash),
      paymentsMade: o.addonPaymentsMade, totalPayments: o.addonTotalPayments, planStatus: o.addonPlanStatus
    } : null
  };
}

// ---------- public API ----------
router.post("/orders", express.json({ limit: "64kb" }), async (req, res) => {
  try {
    const b = req.body || {};
    const email = clean(b.email, 200).toLowerCase();
    const siteType = b.siteType === "rebuild" ? "rebuild" : "new";
    const addCallTwin = b.addCallTwin === true || b.addCallTwin === "true";
    const password = String(b.calltwinPassword || "");
    if (!clean(b.name) || !email || !clean(b.business)) return res.status(400).json({ error: "Name, email and business name are required." });
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (siteType === "rebuild" && !clean(b.url)) return res.status(400).json({ error: "Enter your current website address." });
    if (addCallTwin && password.length < 8) return res.status(400).json({ error: "Choose a CallTwin password of at least 8 characters." });

    const comp = cfg().ownerEmails.includes(email);
    const order = await QueeneeOrder.create({
      orderId: "Q-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      token: crypto.randomBytes(16).toString("hex"),
      status: comp ? "paid" : "pending_payment", comp, paidAt: comp ? new Date() : undefined,
      name: clean(b.name, 120), email, phone: clean(b.phone, 40), business: clean(b.business, 160),
      industry: clean(b.industry, 120), location: clean(b.location, 160), siteType, url: clean(b.url, 500),
      services: clean(b.services, 2000), goal: clean(b.goal), style: clean(b.style, 500), notes: clean(b.notes, 2000),
      addCallTwin, addonTotalPayments: addCallTwin ? totalPayments() : 0,
      addonPlanStatus: addCallTwin ? (comp ? "comp" : "pending") : null
    });
    // Login is created now (inactive until paid) so the password never has to be stored anywhere else.
    await upsertCallTwin(order, comp ? "active" : "none", password);
    res.status(201).json({ ok: true, id: order.orderId, token: order.token, comp });
  } catch (err) {
    console.error("[queenee/orders]", err);
    res.status(500).json({ error: "Could not save the order. Please try again." });
  }
});

router.get("/orders/:id", async (req, res) => {
  const o = await QueeneeOrder.findOne({ orderId: req.params.id });
  if (!o || !safeEqual(req.query.t, o.token)) return res.status(404).json({ error: "Order not found" });
  const user = o.addCallTwin ? await User.findOne({ email: o.email }) : null;
  res.json(publicView(o, user));
});

// Success page fallback: Stripe redirects with ?session_id=cs_...
router.get("/session/:sid", async (req, res) => {
  try {
    const sid = String(req.params.sid || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: "Bad session" });
    let o = await QueeneeOrder.findOne({ stripeSessionId: sid });
    if (!o && stripe()) {
      // Webhook not processed yet: pull the session from Stripe and process it now.
      const s = await stripe().checkout.sessions.retrieve(sid);
      if (s.status === "complete") { await onCheckoutCompleted(s); o = await QueeneeOrder.findOne({ stripeSessionId: sid }); }
    }
    if (!o) return res.status(404).json({ error: "Order not found yet" });
    const user = o.addCallTwin ? await User.findOne({ email: o.email }) : null;
    res.json(publicView(o, user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- admin ----------
function admin(req, res, next) {
  const t = cfg().adminToken;
  if (!t || !safeEqual(req.get("x-admin-token"), t)) return res.status(401).json({ error: "Unauthorized" });
  next();
}
router.get("/admin/orders", admin, async (req, res) => {
  res.json(await QueeneeOrder.find({}, { token: 0, addonInvoiceIds: 0 }).sort({ createdAt: -1 }).limit(500).lean());
});
router.patch("/admin/orders/:id", admin, express.json(), async (req, res) => {
  const allowed = ["pending_payment", "paid", "in_progress", "review", "delivered", "canceled", "refunded"];
  const patch = {};
  if (req.body?.status) { if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" }); patch.status = req.body.status; }
  if (typeof req.body?.liveUrl === "string") patch.liveUrl = clean(req.body.liveUrl, 500);
  if (typeof req.body?.adminNotes === "string") patch.adminNotes = clean(req.body.adminNotes, 4000);
  const o = await QueeneeOrder.findOneAndUpdate({ orderId: req.params.id }, { $set: patch }, { new: true, projection: { token: 0 } }).lean();
  if (!o) return res.status(404).json({ error: "Not found" });
  res.json(o);
});

// ---------- Stripe ----------
function isQueeneeSession(s) {
  return /^Q-/.test(s.client_reference_id || "") || (s.payment_link && cfg().paymentLinkIds.includes(s.payment_link)) || s.metadata?.source === "queenee";
}

async function recountInstallments(order) {
  if (!order.addCallTwin || !order.stripeSubscriptionId || !stripe()) return order;
  const list = await stripe().invoices.list({ subscription: order.stripeSubscriptionId, status: "paid", limit: 100 });
  const paid = list.data.filter((i) => (i.amount_paid || 0) > 0 || i.total === 0).map((i) => i.id);
  order.addonInvoiceIds = paid;
  order.addonPaymentsMade = paid.length;
  const done = paid.length >= order.addonTotalPayments;
  if (order.addonPlanStatus !== "canceled") order.addonPlanStatus = done ? "completed" : "active";
  await order.save();
  if (done) {
    // Final installment collected: stop the subscription before it bills again.
    await stripe().subscriptions.update(order.stripeSubscriptionId, { cancel_at_period_end: true, metadata: { queeneeOrderId: order.orderId, installments: "complete" } });
  }
  return order;
}

async function onCheckoutCompleted(s) {
  if (!isQueeneeSession(s)) return false;
  let order = /^Q-/.test(s.client_reference_id || "") ? await QueeneeOrder.findOne({ orderId: s.client_reference_id }) : null;
  const email = String(s.customer_details?.email || s.customer_email || "").toLowerCase();
  if (!order) {
    // The popup's order call never landed (backend asleep, network): build the order from checkout.
    const custom = Object.fromEntries((s.custom_fields || []).map((f) => [f.key, f.text?.value || f.dropdown?.value || ""]));
    order = await QueeneeOrder.create({
      orderId: /^Q-/.test(s.client_reference_id || "") ? s.client_reference_id : "Q-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      token: crypto.randomBytes(16).toString("hex"), source: "stripe",
      name: s.customer_details?.name || "", email, phone: s.customer_details?.phone || "",
      business: custom.business || custom.businessname || s.customer_details?.name || "", url: custom.website || custom.url || "",
      siteType: custom.website || custom.url ? "rebuild" : "new",
      addCallTwin: s.mode === "subscription", addonTotalPayments: s.mode === "subscription" ? totalPayments() : 0,
      addonPlanStatus: s.mode === "subscription" ? "pending" : null
    });
  }
  const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
  order.stripeSessionId = s.id;
  order.stripeCustomerId = s.customer || order.stripeCustomerId;
  order.stripeSubscriptionId = s.subscription || order.stripeSubscriptionId;
  if (paid) {
    if (order.status === "pending_payment") order.status = "paid";
    order.paidAt = order.paidAt || new Date();
    order.amountPaidCents = s.amount_total;
    if (order.addCallTwin && order.addonPlanStatus === "pending") order.addonPlanStatus = "active";
  }
  await order.save();
  if (paid && order.addCallTwin) {
    if (stripe() && order.stripeSubscriptionId) {
      await stripe().subscriptions.update(order.stripeSubscriptionId, { metadata: { queeneeOrderId: order.orderId, source: "queenee", totalPayments: String(order.addonTotalPayments) } });
    }
    await recountInstallments(order);
    await upsertCallTwin(order, "active");
  }
  return true;
}

function invoiceSubscriptionId(inv) {
  const sub = inv.subscription || inv.parent?.subscription_details?.subscription || null;
  return sub && typeof sub === "object" ? sub.id : sub;
}

/** Returns true when the event belonged to a QUEENEE order. */
async function handleStripeEvent(event) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return onCheckoutCompleted(obj);
    case "invoice.paid": {
      const subId = invoiceSubscriptionId(obj);
      const order = subId && await QueeneeOrder.findOne({ stripeSubscriptionId: subId });
      if (!order) return false; // first invoice can land before checkout.session.completed; that handler recounts
      await recountInstallments(order);
      await upsertCallTwin(order, "active");
      return true;
    }
    case "invoice.payment_failed": {
      const subId = invoiceSubscriptionId(obj);
      const order = subId && await QueeneeOrder.findOne({ stripeSubscriptionId: subId });
      if (!order) return false;
      order.addonPlanStatus = "past_due"; await order.save();
      await upsertCallTwin(order, "past_due");
      return true;
    }
    case "customer.subscription.deleted": {
      const order = await QueeneeOrder.findOne({ stripeSubscriptionId: obj.id });
      if (!order) return false;
      const complete = order.addonPaymentsMade >= order.addonTotalPayments;
      order.addonPlanStatus = complete ? "completed" : "canceled"; await order.save();
      await upsertCallTwin(order, complete && cfg().afterPlan === "keep" ? "active" : "canceled");
      return true;
    }
    default:
      return false;
  }
}

module.exports = { router, handleStripeEvent, setStripeForTests };
