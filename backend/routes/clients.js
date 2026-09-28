/**
 * Self-serve CallTwin clients.
 *   POST /api/clients/signup          public: business signs up (14-day free trial, then $99/mo)
 *   POST /api/clients/checkout        public: Stripe card subscription with the trial (needs STRIPE_SECRET_KEY)
 *   GET  /api/clients/confirm         public: confirm Stripe checkout
 *   POST /api/clients/lead            AI agent tool (x-client-key) -> saves job, texts owner
 *   POST /api/clients/voicemail       SignalWire <Record> callback for a client line
 *   GET  /api/clients/portal?k=       owner dashboard data
 *   POST /api/clients/portal          owner actions (update settings, lead status, test text)
 *   GET/POST /api/clients/admin       HSW365 admin (x-admin-key = CALLTWIN_ADMIN_KEY)
 */
const express = require("express");
const crypto = require("crypto");
const Client = require("../models/Client");
const ClientLead = require("../models/ClientLead");
const { provision, updateAgent } = require("../services/provision");

const router = express.Router();
router.use(express.json({ limit: "200kb" }));
router.use(express.urlencoded({ extended: false }));
router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "content-type, x-admin-key, x-client-key");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PRICE_CENTS = Number(process.env.CALLTWIN_PRICE_CENTS || 9900);
const TRIAL_DAYS = Number(process.env.CALLTWIN_TRIAL_DAYS || 14);
const SETUP_CENTS = Number(process.env.CALLTWIN_SETUP_CENTS || 50000); // one-time setup fee, paid at signup
const SITE = (process.env.CALLTWIN_SITE || "https://hsw365.github.io/calltwin").replace(/\/$/, "");
const COMP_EMAILS = ["hsw365media@gmail.com", "hoodstarent365@gmail.com"];
const clip = (v, n = 500) => (v == null ? "" : String(v).trim().slice(0, n));
const e164 = (n) => {
  const d = String(n || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return null;
};
const token = (n = 24) => crypto.randomBytes(n).toString("base64url");
const adminOk = (req) => !!process.env.CALLTWIN_ADMIN_KEY && (req.get("x-admin-key") || req.query.admin) === process.env.CALLTWIN_ADMIN_KEY;

function sms() { return require("./newark"); }
const { promoFor, applyClientPromo } = require("../services/promos");
/** Look up a client by portal key and apply any custom deal (e.g. New Ark: 30 days free). */
async function byKey(k) {
  const c = await Client.findOne({ portalKey: clip(k, 80) });
  if (c && applyClientPromo(c)) await c.save();
  return c;
}
async function textOwner(c, body) {
  const to = e164(c.ownerCell);
  if (!to || c.alertSms === false || !sms().smsReady()) return false;
  try { await sms().sendSms(to, body.slice(0, 1400)); return true; } catch (e) { console.error("[clients] sms:", e.message); return false; }
}
async function textAdmin(body) {
  const to = e164(process.env.CALLTWIN_ADMIN_CELL || "8567968081");
  if (!to || !sms().smsReady()) return;
  try { await sms().sendSms(to, body.slice(0, 1400)); } catch (e) { console.error("[clients] admin sms:", e.message); }
}
function publicClient(c) {
  return {
    id: c._id, businessName: c.businessName, industry: c.industry, ownerName: c.ownerName, ownerEmail: c.ownerEmail,
    ownerCell: c.ownerCell, businessPhone: c.businessPhone, city: c.city, services: c.services, hours: c.hours, notes: c.notes,
    aiNumber: c.aiNumber, aiEnabled: c.aiEnabled, alertSms: c.alertSms, status: c.status, payMethod: c.payMethod,
    trialEndsAt: c.trialEndsAt, paidThrough: c.paidThrough, inService: c.inService(), setupDue: !!c.setupDue, setupPaidAt: c.setupPaidAt, ready: !!(c.agentId && c.aiNumber && c.elPhoneId),
    agentId: c.agentId, payoutZelle: c.payoutZelle, payoutCashapp: c.payoutCashapp, payoutStripeLink: c.payoutStripeLink, createdAt: c.createdAt,
  };
}

// ---------- signup ----------
function welcomeText(c) {
  return `${c.businessName}: your CallTwin AI receptionist is ready. Open this on your business phone and tap TURN ON: ${SITE}/on.html?k=${c.portalKey}`;
}
async function createClient(b, { byAdmin = false } = {}) {
  const email = clip(b.ownerEmail, 160).toLowerCase();
  const cell = e164(b.ownerCell);
  if (!clip(b.businessName) || !clip(b.ownerName) || !cell || (!byAdmin && !email.includes("@")))
    throw Object.assign(new Error(byAdmin ? "Business name, owner name and a 10-digit cell are required." : "Business name, your name, email and a 10-digit cell are required."), { status: 400 });
  const payMethod = ["card", "zelle", "cashapp"].includes(b.payMethod) ? b.payMethod : (byAdmin ? "zelle" : "card");
  const comp = COMP_EMAILS.includes(email) || b.comp === true;
  const c = await Client.create({
    businessName: clip(b.businessName, 120), industry: clip(b.industry, 60), ownerName: clip(b.ownerName, 120), ownerEmail: email,
    ownerCell: cell, businessPhone: e164(b.businessPhone) || clip(b.businessPhone, 30), city: clip(b.city, 80),
    areaCode: String(e164(b.businessPhone) || cell).slice(2, 5),
    services: clip(b.services, 1500), hours: clip(b.hours, 300), notes: clip(b.notes, 2000),
    payoutZelle: clip(b.payoutZelle, 120), payoutCashapp: clip(b.payoutCashapp, 60), payoutStripeLink: /^https:\/\//.test(b.payoutStripeLink || "") ? clip(b.payoutStripeLink, 300) : "",
    portalKey: token(), hookKey: token(), payMethod: comp ? "comp" : payMethod, status: comp ? "comp" : "trial",
    trialEndsAt: new Date(Date.now() + ((promoFor({ ownerEmail: email, businessName: b.businessName }) || {}).calltwinTrialDays || TRIAL_DAYS) * 864e5),
    promo: (promoFor({ ownerEmail: email, businessName: b.businessName }) || {}).id || "",
    setupDue: !comp && !byAdmin && SETUP_CENTS > 0 && !(promoFor({ ownerEmail: email, businessName: b.businessName }) || {}).noSetupFee,
    aiNumber: byAdmin && e164(b.useNumber) ? e164(b.useNumber) : "",
    forwardedLines: [e164(b.businessPhone), (b.cellForwarded === true || b.cellForwarded === "on") ? cell : null].filter(Boolean),
  });
  if (!byAdmin) textAdmin(`New CallTwin signup: ${c.businessName} (${c.ownerName}, ${c.ownerCell}${c.ownerEmail ? ", " + c.ownerEmail : ""}). Pays by ${c.payMethod}.${c.setupDue ? ` $${SETUP_CENTS / 100} setup due${c.payMethod !== "card" ? " (confirm in admin when it lands)" : ""}.` : ` Trial ends ${c.trialEndsAt.toDateString()}.`}`);
  return c;
}
function provisionAndWelcome(c) {
  return provision(c).then(async (done) => {
    if (done.aiNumber && done.elPhoneId) await textOwner({ ...done.toObject(), alertSms: true }, welcomeText(done));
    return done;
  }).catch((e) => { console.error("[clients] provision:", e.message); return c; });
}

/** Setup fee received: start the trial clock now and build the receptionist. Idempotent. */
async function activateSetup(c, how) {
  if (!c || !c.setupDue) return false;
  c.setupDue = false; c.setupPaidAt = new Date();
  if (c.status !== "comp") { c.status = "trial"; c.trialEndsAt = new Date(Date.now() + ((promoFor(c) || {}).calltwinTrialDays || TRIAL_DAYS) * 864e5); }
  await c.save();
  textAdmin(`CallTwin setup paid (${how}): ${c.businessName} (${c.ownerName}). Building their receptionist now.`);
  provisionAndWelcome(c);
  return true;
}

router.post("/signup", async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot
    const c = await createClient(b);
    if (!c.setupDue) provisionAndWelcome(c); // background; the page polls for the number
    res.json({ ok: true, portal: `${SITE}/portal.html?k=${c.portalKey}`, on: `${SITE}/on.html?k=${c.portalKey}`, key: c.portalKey, id: c._id, trialEndsAt: c.trialEndsAt, payMethod: c.payMethod,
      setupDue: c.setupDue, setupCents: SETUP_CENTS, priceCents: PRICE_CENTS, trialDays: TRIAL_DAYS, stripe: !!process.env.STRIPE_SECRET_KEY });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ ok: false, error: e.message });
    console.error("[clients] signup:", e);
    res.status(500).json({ ok: false, error: "Signup failed. Try again." });
  }
});

// Public info for the one-tap activation page.
router.get("/on", async (req, res) => {
  const c = await byKey(req.query.k);
  if (!c) return res.status(404).json({ ok: false, error: "Link not found." });
  res.json({ ok: true, businessName: c.businessName, aiNumber: c.aiNumber, ready: !!(c.aiNumber && c.elPhoneId), portal: `${SITE}/portal.html?k=${c.portalKey}` });
});

// ---------- Stripe: card on file, 14-day trial, then $99/mo ----------
let stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Card payments are being set up. Pick Zelle or Cash App for now; your trial is already running.");
  if (!stripe) stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  return stripe;
}
router.post("/checkout", async (req, res) => {
  try {
    const c = await byKey(req.body && req.body.k);
    if (!c) return res.status(404).json({ ok: false, error: "Account not found." });
    const fullTrial = (promoFor(c) || {}).calltwinTrialDays || TRIAL_DAYS;
    // Setup still due: trial starts when they pay, so give the full trial on the monthly plan.
    const trialLeft = c.setupDue ? fullTrial : Math.max(1, Math.ceil(((c.trialEndsAt || new Date()) - Date.now()) / 864e5));
    const line_items = [{ quantity: 1, price_data: { currency: "usd", unit_amount: PRICE_CENTS, recurring: { interval: "month" },
      product_data: { name: "CallTwin Pro - 24/7 AI receptionist", description: `${c.businessName}: every call answered, jobs texted to you, owner dashboard.` } } }];
    if (c.setupDue) line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: SETUP_CENTS,
      product_data: { name: "CallTwin setup (one-time)", description: "AI receptionist build, local phone number, call routing and onboarding." } } });
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: c.ownerEmail,
      line_items,
      subscription_data: { trial_period_days: c.status === "trial" ? Math.min(trialLeft, fullTrial) : undefined, metadata: { client: "calltwin", client_id: String(c._id) } },
      metadata: { client: "calltwin", client_id: String(c._id), setup: c.setupDue ? "1" : "" },
      success_url: `${SITE}/portal.html?k=${c.portalKey}&paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/portal.html?k=${c.portalKey}&canceled=1`,
      allow_promotion_codes: true,
    });
    c.stripeSessionId = session.id; await c.save();
    res.json({ ok: true, url: session.url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
router.get("/confirm", async (req, res) => {
  try {
    const id = clip(req.query.session_id, 200);
    const s = await getStripe().checkout.sessions.retrieve(id);
    const c = await Client.findOne({ stripeSessionId: id });
    if (c && s.status === "complete") {
      c.stripeCustomerId = s.customer || ""; c.stripeSubscriptionId = s.subscription || "";
      c.payMethod = "card"; if (c.status !== "comp") c.status = c.trialEndsAt > new Date() ? "trial" : "active";
      await c.save();
      if (c.setupDue && (s.metadata || {}).setup === "1" && s.payment_status === "paid") await activateSetup(c, "card");
    }
    res.json({ ok: true, complete: s.status === "complete" });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
// Called from the Stripe webhook router.
async function stripeEvent(type, obj) {
  const subId = obj.subscription || (obj.object === "subscription" ? obj.id : null);
  const meta = obj.metadata || {};
  if (meta.addon === "estimate" || ((obj.subscription_details || {}).metadata || {}).addon === "estimate") return false; // add-on billing is handled in estimate/routes.js
  let c = null;
  if (meta.client_id) c = await Client.findById(meta.client_id).catch(() => null);
  if (!c && subId) c = await Client.findOne({ stripeSubscriptionId: subId });
  if (!c) return false;
  if (type === "checkout.session.completed") {
    if (meta.client !== "calltwin") return false;
    c.stripeCustomerId = obj.customer || c.stripeCustomerId; c.stripeSubscriptionId = obj.subscription || c.stripeSubscriptionId;
    if (c.payMethod !== "comp") c.payMethod = "card";
    await c.save();
    if (meta.setup === "1" && obj.payment_status === "paid") await activateSetup(c, "card");
    return true;
  }
  // The first invoice of a subscription is the setup fee (monthly is still in trial): it doesn't pay for a month.
  if (type === "invoice.paid" && obj.billing_reason === "subscription_create") { if (c.setupDue && (obj.amount_paid || 0) > 0) await activateSetup(c, "card"); return true; }
  if (type === "invoice.paid" && (obj.amount_paid || 0) > 0) { c.status = "active"; c.paidThrough = new Date(Date.now() + 32 * 864e5); }
  if (type === "invoice.payment_failed") c.status = "past_due";
  if (type === "customer.subscription.deleted") c.status = "canceled";
  await c.save();
  return true;
}

// ---------- AI agent tool: save a job ticket ----------
router.post("/lead", async (req, res) => {
  try {
    const c = await Client.findOne({ hookKey: req.get("x-client-key") || "" });
    if (!c) return res.status(401).json({ ok: false, error: "Bad key." });
    const b = req.body || {};
    const lead = await ClientLead.create({
      client: c._id, source: "phone", name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160), service: clip(b.service, 120),
      urgency: clip(b.urgency, 40), address: clip(b.address, 300), preferredTime: clip(b.preferred_time, 120), details: clip(b.details, 2000),
      summary: clip(b.summary, 2000), conversationId: clip(b.conversation_id, 120),
    });
    // HSW365 AI Estimate add-on: turn the call into a draft estimate for the owner to review (no-op when the add-on is off).
    require("../estimate/service").fromCallTwinLead(c, lead, { measurements: clip(b.measurements, 1000), equipment: clip(b.equipment, 500), access: clip(b.access_notes, 500) });
    const d = String(lead.phone || "").replace(/\D/g, "");
    lead.notified = await textOwner(c, [`${lead.urgency === "Emergency" ? "EMERGENCY " : ""}New call for ${c.businessName}: ${lead.name || "Caller"} ${lead.phone || ""}`,
      [lead.service, lead.urgency].filter(Boolean).join(" / "), lead.address, lead.summary || lead.details, d ? `Call back: tel:${d}` : ""].filter(Boolean).join("\n"));
    await lead.save();
    res.json({ ok: true, message: "Saved. The owner has been texted and will call the customer back." });
  } catch (e) {
    console.error("[clients] lead:", e);
    res.status(500).json({ ok: false, error: "Could not save." });
  }
});

router.post("/voicemail", async (req, res) => {
  const p = { ...req.query, ...req.body };
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">Got it. We will call you back shortly. Goodbye.</Say><Hangup/></Response>`);
  if (!p.RecordingUrl || !p.c) return;
  const c = await Client.findById(p.c).catch(() => null);
  if (!c) return;
  const lead = await ClientLead.create({ client: c._id, source: "voicemail", name: "Voicemail caller", phone: p.From || "", summary: `Voicemail (${p.RecordingDuration || "?"}s): ${p.RecordingUrl}.mp3` });
  lead.notified = await textOwner(c, `New voicemail for ${c.businessName} from ${p.From || "unknown"}. Listen: ${p.RecordingUrl}.mp3`);
  await lead.save();
  require("../estimate/service").fromCallTwinLead(c, lead);
});

// ---------- owner portal ----------
router.get("/portal", async (req, res) => {
  const c = await byKey(req.query.k);
  if (!c) return res.status(404).json({ ok: false, error: "Dashboard link not found." });
  const leads = await ClientLead.find({ client: c._id }).sort({ createdAt: -1 }).limit(300);
  res.json({ ok: true, client: publicClient(c), leads, price: PRICE_CENTS / 100, setupFee: SETUP_CENTS / 100, trialDays: TRIAL_DAYS, stripe: !!process.env.STRIPE_SECRET_KEY });
});
router.post("/portal", async (req, res) => {
  try {
    const b = req.body || {};
    const c = await byKey(b.k);
    if (!c) return res.status(404).json({ ok: false, error: "Dashboard link not found." });
    if (b.a === "status") {
      if (!["new", "contacted", "booked", "done", "lost"].includes(b.status)) return res.status(400).json({ ok: false, error: "Bad status." });
      await ClientLead.updateOne({ _id: b.id, client: c._id }, { status: b.status });
      return res.json({ ok: true });
    }
    if (b.a === "test_text") {
      const ok = await textOwner({ ...c.toObject(), alertSms: true }, `CallTwin test for ${c.businessName}: job alerts will arrive at this number.`);
      return res.json({ ok, error: ok ? undefined : "Text alerts aren't connected yet. Jobs still show on this dashboard." });
    }
    if (b.a === "paid_notice") {
      await textAdmin(`CallTwin payment notice: ${c.businessName} (${c.ownerName}) says they sent $${(c.setupDue ? SETUP_CENTS : PRICE_CENTS) / 100}${c.setupDue ? " setup fee" : ""} by ${clip(b.method, 20) || c.payMethod}. Confirm in admin.`);
      return res.json({ ok: true });
    }
    if (b.a === "update") {
      const s = b.settings || {};
      for (const k of ["businessName", "ownerName", "city", "services", "hours", "notes", "payoutZelle", "payoutCashapp"]) if (k in s) c[k] = clip(s[k], k === "notes" ? 2000 : 1500);
      if ("ownerCell" in s) { const cell = e164(s.ownerCell); if (!cell) return res.status(400).json({ ok: false, error: "Enter a 10-digit cell." }); c.ownerCell = cell; }
      if ("businessPhone" in s) c.businessPhone = e164(s.businessPhone) || clip(s.businessPhone, 30);
      if ("payoutStripeLink" in s) c.payoutStripeLink = /^https:\/\//.test(s.payoutStripeLink || "") ? clip(s.payoutStripeLink, 300) : "";
      if (typeof s.aiEnabled === "boolean") c.aiEnabled = s.aiEnabled;
      if (typeof s.alertSms === "boolean") c.alertSms = s.alertSms;
      if (["card", "zelle", "cashapp"].includes(s.payMethod) && c.payMethod !== "comp") c.payMethod = s.payMethod;
      await c.save();
      updateAgent(c);
      return res.json({ ok: true, client: publicClient(c) });
    }
    res.status(400).json({ ok: false, error: "Unknown action." });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- admin ----------
router.get("/admin", async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ ok: false, error: "Wrong admin key." });
  const clients = await Client.find().sort({ createdAt: -1 }).limit(500);
  const counts = await ClientLead.aggregate([{ $group: { _id: "$client", n: { $sum: 1 } } }]);
  const byId = Object.fromEntries(counts.map((x) => [String(x._id), x.n]));
  res.json({ ok: true, price: PRICE_CENTS / 100, setupFee: SETUP_CENTS / 100, clients: clients.map((c) => ({ ...publicClient(c), portalKey: c.portalKey, leads: byId[String(c._id)] || 0, log: c.provisionLog.slice(-6) })) });
});
router.post("/admin", async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ ok: false, error: "Wrong admin key." });
  const b = req.body || {};
  if (b.a === "create") {
    try {
      const nc = await createClient(b, { byAdmin: true });
      const done = await provisionAndWelcome(nc); // waits so admin sees the number right away
      return res.json({ ok: true, client: { ...publicClient(done), portalKey: done.portalKey, log: done.provisionLog.slice(-6) }, texted: !!(done.aiNumber && done.elPhoneId) });
    } catch (e) { return res.status(e.status || 500).json({ ok: false, error: e.message }); }
  }
  const c = await Client.findById(b.id).catch(() => null);
  if (!c) return res.status(404).json({ ok: false, error: "Client not found." });
  if (b.a === "setup_paid") { await activateSetup(c, clip(b.method, 20) || c.payMethod); return res.json({ ok: true, client: { ...publicClient(c), log: c.provisionLog.slice(-6) } }); }
  if (b.a === "mark_paid") { c.status = "active"; c.paidThrough = new Date(Math.max(Date.now(), +(c.paidThrough || 0)) + 31 * 864e5); }
  else if (b.a === "comp") { c.status = "comp"; c.payMethod = "comp"; }
  else if (b.a === "cancel") c.status = "canceled";
  else if (b.a === "set_number") { const n = e164(b.number); if (!n) return res.status(400).json({ ok: false, error: "Bad number." }); c.aiNumber = n; c.elPhoneId = ""; }
  else if (b.a === "reprovision") { /* fall through to provision */ }
  else if (b.a === "resend") { const ok = await textOwner({ ...c.toObject(), alertSms: true }, welcomeText(c)); return res.json({ ok, error: ok ? undefined : "Text failed." }); }
  else return res.status(400).json({ ok: false, error: "Unknown action." });
  await c.save();
  if (b.a === "set_number" || b.a === "reprovision") await provision(c);
  res.json({ ok: true, client: { ...publicClient(c), log: c.provisionLog.slice(-6) } });
});

// SignalWire credential check (admin only)
router.get("/admin/swtest", async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ ok: false });
  const axios = require("axios");
  const { swConfig } = require("../services/provision");
  const sw = swConfig();
  if (!sw) return res.json({ ok: false, error: "not configured" });
  const out = { api: sw.api.replace(/Accounts\/.*/, "Accounts/<project>"), project_prefix: sw.auth.username.slice(0, 8), token_len: (sw.auth.password || "").length, token_prefix: (sw.auth.password || "").slice(0, 3) };
  for (const [k, url] of [["account", `${sw.api}.json`], ["numbers", `${sw.api}/IncomingPhoneNumbers.json`], ["available", `${sw.api}/AvailablePhoneNumbers/US/Local.json?AreaCode=856&PageSize=2`]]) {
    try { const r = await axios.get(url, { auth: sw.auth, timeout: 15000 }); out[k] = { status: r.status, body: JSON.stringify(r.data).slice(0, 400) }; }
    catch (e) { out[k] = { status: e.response && e.response.status, body: e.response ? JSON.stringify(e.response.data).slice(0, 300) : e.message }; }
  }
  res.json(out);
});

// ---------- used by inbound call routing ----------
async function clientForNumber(to) {
  const d = String(to || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return null;
  return Client.findOne({ aiNumber: "+1" + d });
}

module.exports = { router, clientForNumber, stripeEvent };
