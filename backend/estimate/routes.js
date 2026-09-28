/**
 * HSW365 AI ESTIMATE — CallTwin add-on API. Mounted at /api/estimates.
 *
 * Owner / team (header x-portal-key = CallTwin owner portal key, or x-team-key = team member key)
 *   GET    /me                         account, settings, role, capabilities
 *   POST   /addon/start                start the add-on free trial (owner)
 *   POST   /addon/checkout             Stripe subscription for the add-on (owner)
 *   POST   /connect                    Stripe Connect onboarding so customer deposits go to the business (owner)
 *   PUT    /settings                   company, pricing rules, price book, templates, terms, follow-ups (owner/manager)
 *   POST   /team  DELETE /team/:id     team members + role keys (owner)
 *   GET    /jobs                       list + dashboard stats (q, status, from, to)
 *   POST   /jobs                       manual lead entry
 *   GET    /jobs/:id                   full job, photos, audit trail
 *   PATCH  /jobs/:id                   intake fields, customer, status
 *   POST   /jobs/:id/analyze           run AI job analysis (+ draft line items if empty)
 *   PUT    /jobs/:id/estimate          edit line items / terms (priced by the engine)
 *   POST   /jobs/:id/approve           human sign-off on the estimate (required before sending)
 *   POST   /jobs/:id/send              create the secure customer link and text/email it
 *   POST   /jobs/:id/reply             reply to a customer question
 *   POST   /jobs/:id/payment           record a deposit/balance paid outside Stripe
 *   POST   /jobs/:id/schedule          schedule the job
 *   POST   /jobs/:id/photos            upload photos (multipart "photos")
 *   GET    /jobs/:id/pdf               estimate or proposal PDF
 *   GET    /photos/:id  DELETE /photos/:id
 *   GET    /audit                      audit log
 *
 * Public (no login)
 *   GET/POST /public/intake/:key       website request form
 *   POST     /public/photos/:token     customer photo upload link
 *   GET      /public/proposal/:token   proposal page data (records view)
 *   GET      /public/proposal/:token/pdf
 *   POST     /public/proposal/:token/action   question | change_request | decline | approve (with e-signature)
 *   POST     /public/proposal/:token/pay      Stripe Checkout for the deposit
 *
 * Inbound
 *   POST /inbound/sms                  SignalWire messaging webhook for a CallTwin number
 *   POST /inbound/email                SendGrid Inbound Parse (address est+<intakeKey>@...)
 */
const express = require("express");
const multer = require("multer");
const Client = require("../models/Client");
const { EstimateSettings, EstimateJob, EstimatePhoto, EstimateAudit } = require("./models");
const { seal, open, newToken, hashToken, phoneHash } = require("./secure");
const { computeTotals, money } = require("./pricing");
const { pickProvider } = require("./ai");
const { renderPdf } = require("./pdf");
const S = require("./service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 } });
const IMG_OK = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/;

router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "content-type, x-portal-key, x-team-key");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.set("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
router.use(express.json({ limit: "1mb" }));
router.use(express.urlencoded({ extended: false, limit: "1mb" }));

const ADDON_PRICE_CENTS = () => Number(process.env.ESTIMATE_ADDON_PRICE_CENTS || 4900);
const ip = (req) => String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
const ua = (req) => String(req.headers["user-agent"] || "").slice(0, 300);
const clip = S.clip;
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  console.error("[estimate]", req.method, req.path, e);
  if (!res.headersSent) res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : "Something went wrong. Try again." });
});

// --------- tiny in-memory rate limiter for public endpoints ---------
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = `${req.path.split("/").slice(0, 3).join("/")}|${ip(req)}`;
    const now = Date.now();
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
    h.push(now); hits.set(k, h);
    if (h.length > max) return bad(res, "Too many requests. Wait a minute and try again.", 429);
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

// ---------------- auth ----------------
const PERMS = {
  owner: ["view", "job", "estimate", "send", "settings", "team", "billing"],
  manager: ["view", "job", "estimate", "send", "settings"],
  estimator: ["view", "job", "estimate"],
  tech: ["view", "job"],
};
async function auth(req, res, next) {
  try {
    const pk = clip(req.get("x-portal-key") || "", 80);
    const tk = clip(req.get("x-team-key") || "", 80);
    let client = null, settings = null, role = null, actor = null;
    if (pk) {
      client = await Client.findOne({ portalKey: pk });
      if (client) { role = "owner"; actor = "owner"; }
    } else if (tk) {
      const h = hashToken(tk);
      settings = await EstimateSettings.findOne({ "members.keyHash": h });
      const m = settings && settings.members.find((x) => x.keyHash === h && x.active);
      if (m) { client = await Client.findById(settings.client); role = m.role; actor = `member:${m.name}`; }
    }
    if (!client) return bad(res, "Sign-in link not recognized.", 401);
    req.client = client;
    req.settings = settings || await S.getSettings(client);
    req.role = role; req.actor = actor;
    next();
  } catch (e) { next(e); }
}
const can = (perm) => (req, res, next) => (PERMS[req.role] || []).includes(perm) ? next() : bad(res, "Your role can't do that.", 403);
const needAddon = (req, res, next) => req.settings.addonActive() ? next() : bad(res, "Turn on the Estimate add-on to use this.", 402);

async function loadJob(req, res, next) {
  try {
    const job = await EstimateJob.findOne({ _id: req.params.id, client: req.client._id }).catch(() => null);
    if (!job) return bad(res, "Job not found.", 404);
    req.job = job; next();
  } catch (e) { next(e); }
}

// ---------------- serializers ----------------
function settingsOut(s, role) {
  const o = s.toObject();
  delete o.members; delete o.stripeSessionId;
  o.members = (s.members || []).map((m) => ({ id: m._id, name: m.name, email: m.email, role: m.role, keyHint: m.keyHint, active: m.active, createdAt: m.createdAt }));
  o.addonActive = s.addonActive();
  if (role === "tech") { delete o.priceBook; delete o.laborRates; delete o.pricing; }
  return o;
}
function jobListOut(j) {
  const t = j.estimate.totals || {};
  return { id: j._id, number: j.number, status: j.status, source: j.source, customer: j.customer.name, service: j.service, urgency: j.urgency,
    totalCents: t.totalCents || 0, sendable: !!t.sendable, analysis: j.analysis.status, createdAt: j.createdAt, updatedAt: j.updatedAt,
    sentAt: j.proposal.sentAt, viewedAt: j.proposal.viewedAt, respondedAt: j.proposal.respondedAt, paid: j.payment.status, scheduleDate: j.schedule.date };
}
function jobOut(j, role) {
  const o = j.toObject();
  o.id = o._id;
  o.customer = { ...S.customerOf(j) };
  delete o.photoUploadToken;
  o.proposal = { ...o.proposal, link: j.proposal.tokenSealed ? S.proposalLink(j) : "", signature: { ...o.proposal.signature, image: j.proposal.signature.image ? open(j.proposal.signature.image) : "" } };
  delete o.proposal.tokenHash; delete o.proposal.tokenSealed;
  if (role === "tech") { o.estimate = { scope: o.estimate.scope, timeline: o.estimate.timeline }; }
  return o;
}

// ---------------- stats ----------------
async function stats(clientId) {
  const rows = await EstimateJob.aggregate([
    { $match: { client: clientId } },
    { $group: { _id: "$status", n: { $sum: 1 }, cents: { $sum: { $ifNull: ["$estimate.totals.totalCents", 0] } } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r]));
  const n = (...ks) => ks.reduce((a, k) => a + ((by[k] && by[k].n) || 0), 0);
  const c = (...ks) => ks.reduce((a, k) => a + ((by[k] && by[k].cents) || 0), 0);
  const won = n("approved", "deposit_paid", "scheduled", "completed");
  const decided = won + n("declined", "lost");
  const paid = await EstimateJob.aggregate([{ $match: { client: clientId } }, { $group: { _id: null, cents: { $sum: "$payment.paidCents" } } }]);
  return {
    newLeads: n("new"), preparing: n("drafting", "ready"), sent: n("sent"), viewed: n("viewed"), awaiting: n("sent", "viewed", "changes_requested"),
    changesRequested: n("changes_requested"), approved: won, declined: n("declined"), scheduled: n("scheduled"), completed: n("completed"),
    pipelineCents: c("sent", "viewed", "changes_requested"), wonCents: c("approved", "deposit_paid", "scheduled", "completed"),
    collectedCents: (paid[0] && paid[0].cents) || 0,
    conversionPct: decided ? Math.round((won / decided) * 1000) / 10 : null,
    total: rows.reduce((a, r) => a + r.n, 0),
  };
}

// ================= OWNER / TEAM =================
router.get("/me", auth, wrap(async (req, res) => {
  const c = req.client, s = req.settings;
  res.json({
    ok: true, role: req.role, actor: req.actor,
    client: { id: c._id, businessName: c.businessName, ownerName: c.ownerName, ownerEmail: c.ownerEmail, aiNumber: c.aiNumber, status: c.status, portalKey: req.role === "owner" ? c.portalKey : undefined },
    settings: settingsOut(s, req.role),
    addon: { status: s.status, active: s.addonActive(), trialEndsAt: s.trialEndsAt, paidThrough: s.paidThrough, priceCents: ADDON_PRICE_CENTS(), trialDays: Number(process.env.ESTIMATE_TRIAL_DAYS || 14) },
    capabilities: { ai: pickProvider() || "rules", sms: require("../routes/newark").smsReady(), email: S.emailReady(), stripe: !!process.env.STRIPE_SECRET_KEY, deposits: !!(s.stripeConnectId || process.env.ESTIMATE_PLATFORM_DEPOSITS === "true") && !!process.env.STRIPE_SECRET_KEY },
    links: { intake: `${S.SITE()}/request.html?c=${s.intakeKey}`, portal: `${S.SITE()}/portal.html?k=${c.portalKey}`, inboundEmail: process.env.ESTIMATE_INBOUND_DOMAIN ? `est+${s.intakeKey}@${process.env.ESTIMATE_INBOUND_DOMAIN}` : "" },
  });
}));

router.post("/addon/start", auth, can("billing"), wrap(async (req, res) => {
  const s = req.settings;
  if (s.status === "off" || s.status === "canceled") { S.startTrial(s); await s.save(); await S.audit(req.client._id, null, req.actor, "addon.trial_started", { trialEndsAt: s.trialEndsAt }, ip(req)); }
  if (s.addonActive()) { // teach the AI receptionist to collect estimate details
    const { updateTool, updateAgent } = require("../services/provision");
    updateTool(req.client).then(() => updateAgent(req.client)).catch(() => {});
  }
  res.json({ ok: true, addon: { status: s.status, active: s.addonActive(), trialEndsAt: s.trialEndsAt } });
}));

let stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error("Online card payments aren't set up yet."), { status: 400 });
  if (!stripe) stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

router.post("/addon/checkout", auth, can("billing"), wrap(async (req, res) => {
  const c = req.client, s = req.settings;
  if (s.status === "comp") return res.json({ ok: true, comp: true });
  const trialLeft = s.status === "trial" && s.trialEndsAt ? Math.max(1, Math.ceil((s.trialEndsAt - Date.now()) / 864e5)) : 0;
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: c.ownerEmail || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: ADDON_PRICE_CENTS(), recurring: { interval: "month" },
      product_data: { name: "CallTwin AI Estimate add-on", description: "AI job analysis, estimates, proposals, e-signature, deposits and automated follow-up." } } }],
    subscription_data: { trial_period_days: trialLeft || undefined, metadata: { addon: "estimate", client_id: String(c._id) } },
    metadata: { addon: "estimate", client_id: String(c._id) },
    success_url: `${S.SITE()}/estimate.html?k=${c.portalKey}&addon=paid`,
    cancel_url: `${S.SITE()}/estimate.html?k=${c.portalKey}&addon=canceled`,
    allow_promotion_codes: true,
  });
  s.stripeSessionId = session.id; await s.save();
  res.json({ ok: true, url: session.url });
}));

router.post("/connect", auth, can("billing"), wrap(async (req, res) => {
  const st = getStripe(), s = req.settings, c = req.client;
  if (!s.stripeConnectId) {
    const acct = await st.accounts.create({ type: "express", email: c.ownerEmail || undefined, business_profile: { name: s.company.name || c.businessName }, metadata: { client_id: String(c._id) } });
    s.stripeConnectId = acct.id; await s.save();
    await S.audit(c._id, null, req.actor, "stripe.connect_created", { account: acct.id }, ip(req));
  }
  const link = await st.accountLinks.create({
    account: s.stripeConnectId, type: "account_onboarding",
    refresh_url: `${S.SITE()}/estimate.html?k=${c.portalKey}#settings`, return_url: `${S.SITE()}/estimate.html?k=${c.portalKey}&connect=done#settings`,
  });
  res.json({ ok: true, url: link.url });
}));

// ---------- settings ----------
const cents = (v) => (v === "" || v == null ? null : Math.max(0, Math.round(Number(v))) || 0);
const pct = (v) => Math.max(0, Math.min(1000, Number(v) || 0));
const slug = (v) => String(v || "").trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, "-").slice(0, 40);

router.put("/settings", auth, can("settings"), wrap(async (req, res) => {
  const s = req.settings, b = req.body || {};
  const before = { pricing: s.pricing && s.pricing.toObject ? s.pricing.toObject() : s.pricing, priceBookCount: s.priceBook.length, laborRates: s.laborRates.map((r) => r.toObject ? r.toObject() : r) };
  if (b.company) {
    for (const k of ["name", "address", "phone", "email", "website", "license"]) if (k in b.company) s.company[k] = clip(b.company[k], 200);
    if ("logoUrl" in b.company) s.company.logoUrl = /^https:\/\//.test(b.company.logoUrl || "") ? clip(b.company.logoUrl, 500) : "";
    if ("brandColor" in b.company && /^#[0-9a-f]{6}$/i.test(b.company.brandColor || "")) s.company.brandColor = b.company.brandColor;
  }
  if (b.pricing) {
    const p = b.pricing;
    for (const k of ["taxRatePct", "materialMarkupPct", "equipmentMarkupPct", "emergencyLaborPct", "defaultDepositPct"]) if (k in p) s.pricing[k] = pct(p[k]);
    for (const k of ["serviceCallFeeCents", "minimumChargeCents", "travelFeeCents", "emergencyFeeCents", "afterHoursFeeCents"]) if (k in p) s.pricing[k] = cents(p[k]) || 0;
    if ("taxLabor" in p) s.pricing.taxLabor = !!p.taxLabor;
    if ("validDays" in p) s.pricing.validDays = Math.max(1, Math.min(365, Number(p.validDays) || 30));
    if (s.pricing.defaultDepositPct > 100) s.pricing.defaultDepositPct = 100;
  }
  if (Array.isArray(b.laborRates)) {
    const seen = new Set();
    s.laborRates = b.laborRates.slice(0, 30).map((r) => ({ key: slug(r.key || r.name).toLowerCase(), name: clip(r.name, 80), rateCents: cents(r.rateCents) || 0, unit: "hour" }))
      .filter((r) => r.key && r.name && !seen.has(r.key) && seen.add(r.key));
  }
  if (Array.isArray(b.priceBook)) {
    const seen = new Set();
    s.priceBook = b.priceBook.slice(0, 2000).map((i) => ({
      sku: slug(i.sku || i.name), name: clip(i.name, 160), category: clip(i.category, 60), kind: ["material", "equipment", "service", "fee"].includes(i.kind) ? i.kind : "material",
      unit: clip(i.unit, 20) || "each", costCents: cents(i.costCents), priceCents: cents(i.priceCents), taxable: i.taxable !== false, notes: clip(i.notes, 300), active: i.active !== false,
    })).filter((i) => i.sku && i.name && !seen.has(i.sku) && seen.add(i.sku));
  }
  if (Array.isArray(b.services)) {
    s.services = b.services.slice(0, 200).map((t) => ({
      name: clip(t.name, 100), description: clip(t.description, 500), laborKey: clip(t.laborKey, 40).toLowerCase(),
      laborHours: t.laborHours === "" || t.laborHours == null ? null : Math.max(0, Number(t.laborHours) || 0), timeline: clip(t.timeline, 200),
      items: (Array.isArray(t.items) ? t.items : []).slice(0, 40).map((x) => ({ sku: slug(x.sku), qty: Math.max(0, Number(x.qty) || 0) })).filter((x) => x.sku && x.qty),
    })).filter((t) => t.name);
  }
  if (Array.isArray(b.discounts)) s.discounts = b.discounts.slice(0, 30).map((d) => ({ name: clip(d.name, 60), type: d.type === "flat" ? "flat" : "pct", value: d.type === "flat" ? cents(d.value) || 0 : pct(d.value) })).filter((d) => d.name);
  for (const k of ["terms", "warranty", "paymentTerms", "defaultTimeline", "payInstructions"]) if (k in b) s[k] = clip(b[k], 8000);
  if (b.followUps) {
    if ("enabled" in b.followUps) s.followUps.enabled = !!b.followUps.enabled;
    if (Array.isArray(b.followUps.steps)) s.followUps.steps = b.followUps.steps.slice(0, 6).map((x) => ({ afterHours: Math.max(1, Math.min(24 * 60, Number(x.afterHours) || 24)), sms: clip(x.sms, 600), emailSubject: clip(x.emailSubject, 200), email: clip(x.email, 4000) }));
  }
  for (const k of ["autoDraftFromCalls", "notifyOwnerSms", "textCustomerPhotoLink"]) if (k in b) s[k] = !!b[k];
  if ("prefix" in b) s.prefix = slug(b.prefix).slice(0, 8) || "EST";
  await s.save();
  await S.audit(req.client._id, null, req.actor, "settings.updated", { keys: Object.keys(b), before, after: { pricing: s.pricing, priceBookCount: s.priceBook.length, laborRates: s.laborRates } }, ip(req));
  res.json({ ok: true, settings: settingsOut(s, req.role) });
}));

// ---------- team ----------
router.post("/team", auth, can("team"), wrap(async (req, res) => {
  const b = req.body || {};
  if (!clip(b.name)) return bad(res, "Name is required.");
  const key = newToken(24);
  req.settings.members.push({ name: clip(b.name, 80), email: clip(b.email, 160).toLowerCase(), role: PERMS[b.role] && b.role !== "owner" ? b.role : "estimator", keyHash: hashToken(key), keyHint: key.slice(-4) });
  await req.settings.save();
  await S.audit(req.client._id, null, req.actor, "team.added", { name: b.name, role: b.role }, ip(req));
  res.json({ ok: true, link: `${S.SITE()}/estimate.html?t=${key}`, settings: settingsOut(req.settings, req.role) });
}));
router.delete("/team/:id", auth, can("team"), wrap(async (req, res) => {
  const m = req.settings.members.id(req.params.id);
  if (!m) return bad(res, "Not found.", 404);
  m.active = false; await req.settings.save();
  await S.audit(req.client._id, null, req.actor, "team.removed", { name: m.name }, ip(req));
  res.json({ ok: true, settings: settingsOut(req.settings, req.role) });
}));

// ---------- jobs ----------
router.get("/jobs", auth, wrap(async (req, res) => {
  const q = { client: req.client._id };
  const status = clip(req.query.status, 200);
  if (status) q.status = { $in: status.split(",").map((x) => x.trim()) };
  const term = clip(req.query.q, 80).toLowerCase();
  if (term) {
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    q.$or = [{ search: rx }, { number: new RegExp(rx.source, "i") }, { service: new RegExp(rx.source, "i") }];
  }
  const from = req.query.from ? new Date(req.query.from) : null, to = req.query.to ? new Date(req.query.to) : null;
  if ((from && !isNaN(from)) || (to && !isNaN(to))) { q.createdAt = {}; if (from && !isNaN(from)) q.createdAt.$gte = from; if (to && !isNaN(to)) q.createdAt.$lte = new Date(+to + 864e5 - 1); }
  const jobs = await EstimateJob.find(q).sort({ updatedAt: -1 }).limit(Math.min(500, Number(req.query.limit) || 200));
  res.json({ ok: true, jobs: jobs.map(jobListOut), stats: await stats(req.client._id) });
}));

router.post("/jobs", auth, can("job"), needAddon, wrap(async (req, res) => {
  const b = req.body || {};
  if (!clip(b.name) && !clip(b.phone) && !clip(b.problem)) return bad(res, "Add at least a customer name, phone, or job description.");
  const job = await S.createJob(req.client, req.settings, { ...b, source: "manual" }, req.actor, ip(req));
  if (b.analyze !== false) await S.runAnalysis(req.client, req.settings, job, req.actor);
  res.json({ ok: true, job: jobOut(job, req.role) });
}));

router.get("/jobs/:id", auth, loadJob, wrap(async (req, res) => {
  const photos = await EstimatePhoto.find({ client: req.client._id, job: req.job._id }).select("-data").sort({ createdAt: 1 });
  const trail = await EstimateAudit.find({ client: req.client._id, job: req.job._id }).sort({ createdAt: -1 }).limit(200);
  res.json({ ok: true, job: jobOut(req.job, req.role), photos: photos.map((p) => ({ id: p._id, name: p.name, mime: p.mime, size: p.size, by: p.uploadedBy, at: p.createdAt })), audit: trail });
}));

const INTAKE_FIELDS = ["service", "problem", "urgency", "measurements", "materialsNeeded", "laborNotes", "notes", "preferredTime"];
router.patch("/jobs/:id", auth, can("job"), loadJob, wrap(async (req, res) => {
  const j = req.job, b = req.body || {}, changed = {};
  for (const k of INTAKE_FIELDS) if (k in b && String(b[k] || "") !== String(j[k] || "")) { changed[k] = { from: j[k], to: clip(b[k], 3000) }; j[k] = clip(b[k], 3000); }
  if ("afterHours" in b) { changed.afterHours = { from: j.afterHours, to: !!b.afterHours }; j.afterHours = !!b.afterHours; }
  if (b.customer) {
    const c = S.customerOf(j);
    if ("name" in b.customer) { changed.customerName = { from: c.name, to: b.customer.name }; j.customer.name = clip(b.customer.name, 120); }
    if ("phone" in b.customer) { const ph = S.e164(b.customer.phone) || clip(b.customer.phone, 40); j.customer.phone = seal(ph); j.customer.phoneHash = phoneHash(ph); changed.customerPhone = true; }
    if ("email" in b.customer) { j.customer.email = seal(clip(b.customer.email, 160).toLowerCase()); changed.customerEmail = true; }
    if ("address" in b.customer) { j.customer.address = seal(clip(b.customer.address, 300)); changed.customerAddress = true; }
  }
  if (b.status && ["new", "drafting", "ready", "completed", "lost", "scheduled"].includes(b.status) && b.status !== j.status) { changed.status = { from: j.status, to: b.status }; j.status = b.status; }
  j.search = S.searchKey(j.customer.name, j.service, S.customerOf(j).phone);
  if (j.estimate.lineItems.length && ("urgency" in b || "afterHours" in b)) S.recompute(req.settings, j);
  await j.save();
  if (Object.keys(changed).length) await S.audit(req.client._id, j._id, req.actor, "job.updated", changed, ip(req));
  res.json({ ok: true, job: jobOut(j, req.role) });
}));

router.post("/jobs/:id/analyze", auth, can("estimate"), needAddon, loadJob, wrap(async (req, res) => {
  if (req.job.analysis.status === "running" && Date.now() - +req.job.updatedAt < 120e3) return bad(res, "Analysis is already running.");
  if (req.body && req.body.redraft) req.job.estimate.lineItems = [];
  const job = await S.runAnalysis(req.client, req.settings, req.job, req.actor);
  res.json({ ok: true, job: jobOut(job, req.role) });
}));

const KINDS = ["labor", "material", "equipment", "fee", "custom"];
function diffItems(before, after) {
  const b = new Map(before.map((x) => [x.id, x])), a = new Map(after.map((x) => [x.id, x]));
  const out = [];
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y) out.push({ op: "add", id, description: x.description, qty: x.qty, unitCents: x.unitCents });
    else for (const k of ["description", "qty", "unitCents", "taxable", "kind", "sku", "laborKey"]) if (String(x[k]) !== String(y[k])) out.push({ op: "change", id, field: k, from: y[k], to: x[k] });
  }
  for (const [id, y] of b) if (!a.has(id)) out.push({ op: "remove", id, description: y.description });
  return out;
}

router.put("/jobs/:id/estimate", auth, can("estimate"), loadJob, wrap(async (req, res) => {
  const j = req.job, b = req.body || {}, s = req.settings;
  const beforeItems = j.estimate.lineItems.map((x) => x.toObject());
  const beforeTotal = (j.estimate.totals || {}).totalCents;
  if (Array.isArray(b.lineItems)) {
    const prev = new Map(beforeItems.map((x) => [x.id, x]));
    j.estimate.lineItems = b.lineItems.slice(0, 200).map((x) => {
      const old = prev.get(x.id) || {};
      const kind = KINDS.includes(x.kind) ? x.kind : "custom";
      const qty = x.qty === "" || x.qty == null ? null : Math.max(0, Math.round(Number(x.qty) * 100) / 100);
      const unitCents = x.unitCents === "" || x.unitCents == null ? null : Math.round(Number(x.unitCents));
      const item = {
        id: clip(x.id, 20) || S.lid(), kind, description: clip(x.description, 300), sku: slug(x.sku), laborKey: clip(x.laborKey, 40).toLowerCase(),
        qty: Number.isFinite(qty) ? qty : null, unit: clip(x.unit, 20), unitCents: Number.isFinite(unitCents) ? unitCents : null,
        taxable: kind === "labor" ? !!(x.taxable ?? s.pricing.taxLabor) : x.taxable !== false,
        origin: old.origin || "owner", basis: old.basis || "owner", aiNote: old.aiNote || "",
      };
      // Owner typed a price different from the rule price → it becomes an owner price, and is kept as-is.
      if (!old.id) { item.origin = item.sku && s.priceBook.some((p) => p.sku === item.sku) && item.unitCents == null ? "price_book" : (item.kind === "labor" && item.unitCents == null ? "price_book" : "owner"); item.basis = "owner"; }
      else if (item.unitCents !== old.unitCents) { item.origin = "owner"; }
      if (old.id && item.qty !== old.qty && old.basis === "assumed") item.basis = "owner"; // owner confirmed the assumption
      if (x.confirm === true) item.basis = "owner";
      return item;
    });
  }
  if (b.discount) j.estimate.discount = { name: clip(b.discount.name, 60), type: ["pct", "flat"].includes(b.discount.type) ? b.discount.type : "", value: b.discount.type === "flat" ? cents(b.discount.value) || 0 : pct(b.discount.value) };
  if ("depositPct" in b) j.estimate.depositPct = Math.max(0, Math.min(100, Number(b.depositPct) || 0));
  for (const k of ["scope", "timeline", "terms", "warranty", "paymentTerms", "notes"]) if (k in b) j.estimate[k] = clip(b[k], 8000);
  if ("overview" in b) j.proposal.overview = clip(b.overview, 4000);
  if ("validUntil" in b) { const d = new Date(b.validUntil); j.estimate.validUntil = isNaN(d) ? null : d; }
  S.recompute(s, j);
  const diff = diffItems(beforeItems, j.estimate.lineItems.map((x) => (x.toObject ? x.toObject() : x)));
  const touched = diff.length || Object.keys(b).some((k) => k !== "lineItems");
  if (touched) {
    j.estimate.version += 1;
    if (j.estimate.approvedAt) { j.estimate.approvedAt = null; j.estimate.approvedBy = ""; }
    if (["sent", "viewed", "changes_requested"].includes(j.status)) j.status = "ready"; // must be re-approved and re-sent
    else if (["new", "drafting"].includes(j.status)) j.status = "ready";
  }
  await j.save();
  if (touched) await S.audit(req.client._id, j._id, req.actor, "estimate.edited", { version: j.estimate.version, items: diff, totalFrom: beforeTotal, totalTo: j.estimate.totals.totalCents, fields: Object.keys(b).filter((k) => k !== "lineItems") }, ip(req));
  res.json({ ok: true, job: jobOut(j, req.role) });
}));

router.post("/jobs/:id/approve", auth, can("send"), loadJob, wrap(async (req, res) => {
  const j = req.job;
  S.recompute(req.settings, j);
  const t = j.estimate.totals;
  if (!t.sendable) return res.status(400).json({ ok: false, error: "Fix these before approving: " + t.issues.map((i) => i.message).join("; "), issues: t.issues });
  if ((t.warnings || []).length && !(req.body && req.body.acceptAssumptions)) return res.status(409).json({ ok: false, error: "Confirm the AI assumptions first.", warnings: t.warnings });
  j.estimate.approvedAt = new Date(); j.estimate.approvedBy = req.actor;
  await j.save();
  await S.audit(req.client._id, j._id, req.actor, "estimate.approved", { version: j.estimate.version, totalCents: t.totalCents, acceptedAssumptions: (t.warnings || []).map((w) => w.message) }, ip(req));
  res.json({ ok: true, job: jobOut(j, req.role) });
}));

function snapshotOf(settings, client, j) {
  return {
    version: j.estimate.version,
    number: j.number,
    service: j.service,
    overview: j.proposal.overview,
    estimate: {
      lineItems: j.estimate.lineItems.map((x) => (x.toObject ? x.toObject() : x)).map(({ id, kind, description, qty, unit, unitCents, taxable }) => ({ id, kind, description, qty, unit, unitCents, taxable })),
      discount: j.estimate.discount, depositPct: j.estimate.depositPct, scope: j.estimate.scope, timeline: j.estimate.timeline, terms: j.estimate.terms,
      warranty: j.estimate.warranty, paymentTerms: j.estimate.paymentTerms, notes: j.estimate.notes, validUntil: j.estimate.validUntil, totals: j.estimate.totals, approvedAt: j.estimate.approvedAt,
    },
    company: { ...(settings.company.toObject ? settings.company.toObject() : settings.company), name: settings.company.name || client.businessName },
    sentAt: new Date(),
  };
}

router.post("/jobs/:id/send", auth, can("send"), needAddon, loadJob, wrap(async (req, res) => {
  const j = req.job, s = req.settings, c = req.client, b = req.body || {};
  if (!j.estimate.approvedAt) return bad(res, "Approve the estimate before sending it.");
  S.recompute(s, j);
  if (!j.estimate.totals.sendable) return bad(res, "The estimate changed and has problems: " + j.estimate.totals.issues.map((i) => i.message).join("; "));
  if (!j.proposal.tokenHash) { const t = newToken(24); j.proposal.tokenHash = hashToken(t); j.proposal.tokenSealed = seal(t); }
  j.proposal.snapshot = snapshotOf(s, c, j);
  j.markModified("proposal.snapshot");
  j.proposal.sentAt = new Date(); j.proposal.response = ""; j.proposal.respondedAt = null;
  j.proposal.followups = []; j.proposal.followupsStopped = false;
  j.status = "sent";
  const vars = S.msgVars(c, s, j);
  const cu = S.customerOf(j);
  const channels = [];
  const wantSms = b.sms !== false, wantEmail = b.email !== false;
  const smsText = clip(b.smsText, 600) || `Hi {customer}, it's {business}. Your estimate {number} for {service} is ready ({total}). View, ask questions, or approve here: {link}`;
  const emailText = clip(b.emailText, 4000) || `Hi {customer},\n\nThank you for contacting {business}. Your estimate {number} for {service} is ready.\n\nTotal: {total}\n\nYou can view the full proposal, ask a question, request changes, or approve and sign online here:\n{link}\n\nThank you,\n{business}`;
  if (wantSms && cu.phone && await S.sendSms(cu.phone, S.fill(smsText, vars))) channels.push("sms");
  if (wantEmail && cu.email && await S.sendEmail(cu.email, S.fill(clip(b.emailSubject, 200) || "Your estimate from {business}", vars), S.fill(emailText, vars), s.company.email || c.ownerEmail)) channels.push("email");
  j.proposal.sentVia = channels.length ? channels : ["link"];
  await j.save();
  await S.audit(c._id, j._id, req.actor, "proposal.sent", { version: j.estimate.version, totalCents: j.estimate.totals.totalCents, channels: j.proposal.sentVia }, ip(req));
  res.json({ ok: true, link: S.proposalLink(j), channels, job: jobOut(j, req.role) });
}));

router.post("/jobs/:id/reply", auth, can("job"), loadJob, wrap(async (req, res) => {
  const j = req.job, text = clip(req.body && req.body.text, 1500);
  if (!text) return bad(res, "Write a reply.");
  const cu = S.customerOf(j), channels = [];
  const biz = req.settings.company.name || req.client.businessName;
  if (cu.phone && await S.sendSms(cu.phone, `${biz}: ${text}${j.proposal.tokenSealed ? `\n${S.proposalLink(j)}` : ""}`)) channels.push("sms");
  if (cu.email && await S.sendEmail(cu.email, `Re: your estimate ${j.number}`, `${text}\n\n${j.proposal.tokenSealed ? S.proposalLink(j) + "\n\n" : ""}${biz}`, req.settings.company.email)) channels.push("email");
  j.proposal.events.push({ type: "reply", text, by: req.actor });
  j.messages.push({ from: "owner", channel: channels.join(",") || "note", text });
  await j.save();
  await S.audit(req.client._id, j._id, req.actor, "customer.replied", { channels }, ip(req));
  res.json({ ok: true, channels, job: jobOut(j, req.role) });
}));

router.post("/jobs/:id/payment", auth, can("send"), loadJob, wrap(async (req, res) => {
  const j = req.job, b = req.body || {};
  const amt = Math.round(Number(b.amountCents));
  if (!(amt > 0)) return bad(res, "Enter the amount received.");
  j.payment.paidCents += amt; j.payment.method = clip(b.method, 40) || "manual"; j.payment.paidAt = new Date();
  j.payment.status = "manual";
  if (["approved", "sent", "viewed"].includes(j.status) && j.payment.paidCents >= (j.payment.depositCents || 0)) j.status = "deposit_paid";
  await j.save();
  await S.audit(req.client._id, j._id, req.actor, "payment.recorded", { amountCents: amt, method: j.payment.method }, ip(req));
  res.json({ ok: true, job: jobOut(j, req.role) });
}));

router.post("/jobs/:id/schedule", auth, can("job"), loadJob, wrap(async (req, res) => {
  const j = req.job, b = req.body || {};
  const d = new Date(b.date);
  if (isNaN(d)) return bad(res, "Pick a date.");
  j.schedule = { date: d, window: clip(b.window, 80), notes: clip(b.notes, 1000) };
  if (!["completed"].includes(j.status)) j.status = "scheduled";
  await j.save();
  const cu = S.customerOf(j);
  let texted = false;
  if (b.notify && cu.phone) texted = await S.sendSms(cu.phone, `${req.settings.company.name || req.client.businessName}: your job is scheduled for ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}${j.schedule.window ? ", " + j.schedule.window : ""}. Reply here with any questions.`);
  await S.audit(req.client._id, j._id, req.actor, "job.scheduled", { date: d, window: j.schedule.window, notified: texted }, ip(req));
  res.json({ ok: true, texted, job: jobOut(j, req.role) });
}));

async function savePhotos(client, job, files, by) {
  const saved = [];
  const existing = await EstimatePhoto.countDocuments({ job: job._id });
  for (const f of (files || []).slice(0, Math.max(0, 20 - existing))) {
    if (!IMG_OK.test(f.mimetype)) continue;
    const p = await EstimatePhoto.create({ client: client._id, job: job._id, name: clip(f.originalname, 120), mime: f.mimetype, size: f.size, data: f.buffer, uploadedBy: by });
    saved.push(p._id);
  }
  return saved;
}

router.post("/jobs/:id/photos", auth, can("job"), loadJob, upload.array("photos", 8), wrap(async (req, res) => {
  const ids = await savePhotos(req.client, req.job, req.files, req.actor);
  await S.audit(req.client._id, req.job._id, req.actor, "photos.uploaded", { count: ids.length }, ip(req));
  res.json({ ok: true, added: ids.length });
}));

router.get("/photos/:id", auth, wrap(async (req, res) => {
  const p = await EstimatePhoto.findOne({ _id: req.params.id, client: req.client._id }).catch(() => null);
  if (!p) return bad(res, "Not found.", 404);
  res.set("Content-Type", p.mime).set("Cache-Control", "private, max-age=3600").set("Content-Disposition", `inline; filename="${p.name.replace(/[^\w.-]/g, "_")}"`).send(p.data);
}));
router.delete("/photos/:id", auth, can("job"), wrap(async (req, res) => {
  const p = await EstimatePhoto.findOneAndDelete({ _id: req.params.id, client: req.client._id }).catch(() => null);
  if (p) await S.audit(req.client._id, p.job, req.actor, "photo.deleted", { name: p.name }, ip(req));
  res.json({ ok: !!p });
}));

router.get("/jobs/:id/pdf", auth, can("view"), loadJob, wrap(async (req, res) => {
  if (req.role === "tech") return bad(res, "Your role can't view pricing.", 403);
  const kind = req.query.kind === "estimate" ? "estimate" : "proposal";
  const j = req.job;
  const pdfJob = { number: j.number, updatedAt: j.updatedAt, estimate: j.estimate, proposal: { overview: j.proposal.overview, signature: { name: j.proposal.signature.name, at: j.proposal.signature.at, imageData: j.proposal.signature.image ? open(j.proposal.signature.image) : "" } } };
  const buf = await renderPdf({ settings: req.settings, client: req.client, job: pdfJob, customer: S.customerOf(j), kind });
  res.set("Content-Type", "application/pdf").set("Content-Disposition", `inline; filename="${kind}-${j.number}.pdf"`).send(buf);
}));

router.get("/audit", auth, can("send"), wrap(async (req, res) => {
  const q = { client: req.client._id };
  if (req.query.job) q.job = req.query.job;
  const rows = await EstimateAudit.find(q).sort({ createdAt: -1 }).limit(300).catch(() => []);
  res.json({ ok: true, audit: rows });
}));

// ================= PUBLIC =================
async function settingsByIntake(key) {
  if (!key || String(key).length < 10) return null;
  const s = await EstimateSettings.findOne({ intakeKey: String(key) });
  if (!s || !s.addonActive()) return null;
  const client = await Client.findById(s.client);
  return client ? { s, client } : null;
}

router.get("/public/intake/:key", limit(60, 60e3), wrap(async (req, res) => {
  const hit = await settingsByIntake(req.params.key);
  if (!hit) return bad(res, "This request form isn't active.", 404);
  const { s, client } = hit;
  res.json({ ok: true, company: { name: s.company.name || client.businessName, logoUrl: s.company.logoUrl, brandColor: s.company.brandColor, phone: s.company.phone || client.businessPhone }, services: s.services.map((x) => x.name) });
}));

router.post("/public/intake/:key", limit(8, 600e3), upload.array("photos", 8), wrap(async (req, res) => {
  const hit = await settingsByIntake(req.params.key);
  if (!hit) return bad(res, "This request form isn't active.", 404);
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  if (!clip(b.name) || (!clip(b.phone) && !clip(b.email)) || !clip(b.problem)) return bad(res, "Please add your name, a phone or email, and describe the job.");
  const { s, client } = hit;
  const job = await S.createJob(client, s, { ...b, source: "web_form" }, "customer", ip(req));
  const n = await savePhotos(client, job, req.files, "customer");
  if (n.length) await S.audit(client._id, job._id, "customer", "photos.uploaded", { count: n.length }, ip(req));
  res.json({ ok: true, number: job.number });
  S.runAnalysis(client, s, job, "web_form").then(() => S.notifyOwner(client, s, `New estimate request ${job.number} from ${job.customer.name} (${job.service || "web form"}). Draft ready to review: ${S.ownerLink(client, job._id)}`)).catch((e) => console.error("[estimate] intake analysis:", e.message));
}));

router.post("/public/photos/:token", limit(10, 600e3), upload.array("photos", 8), wrap(async (req, res) => {
  const job = await EstimateJob.findOne({ photoUploadToken: hashToken(req.params.token) });
  if (!job || !job.photoUploadToken) return bad(res, "This upload link has expired.", 404);
  const client = await Client.findById(job.client);
  const ids = await savePhotos(client, job, req.files, "customer");
  if (req.body && clip(req.body.note)) job.messages.push({ from: "customer", channel: "photo_link", text: clip(req.body.note, 1500) });
  await job.save();
  await S.audit(job.client, job._id, "customer", "photos.uploaded", { count: ids.length, via: "photo_link" }, ip(req));
  const s = await EstimateSettings.findOne({ client: job.client });
  if (ids.length && s) S.notifyOwner(client, s, `${job.customer.name || "Customer"} sent ${ids.length} photo(s) for ${job.number}: ${S.ownerLink(client, job._id)}`);
  res.json({ ok: true, added: ids.length });
}));
router.get("/public/photos/:token", limit(30, 60e3), wrap(async (req, res) => {
  const job = await EstimateJob.findOne({ photoUploadToken: hashToken(req.params.token) });
  if (!job || !job.photoUploadToken) return bad(res, "This upload link has expired.", 404);
  const s = await EstimateSettings.findOne({ client: job.client });
  const client = await Client.findById(job.client);
  res.json({ ok: true, number: job.number, service: job.service, company: { name: (s && s.company.name) || client.businessName, logoUrl: s && s.company.logoUrl, brandColor: s && s.company.brandColor } });
}));

async function jobByToken(token) {
  if (!token || String(token).length < 20) return null;
  const job = await EstimateJob.findOne({ "proposal.tokenHash": hashToken(token) });
  if (!job || !job.proposal.snapshot) return null;
  return job;
}

function publicOut(job, settings) {
  const snap = job.proposal.snapshot;
  const cu = S.customerOf(job);
  const expired = snap.estimate.validUntil && new Date(snap.estimate.validUntil) < new Date() && !job.proposal.response;
  return {
    number: snap.number, service: snap.service, overview: snap.overview, estimate: snap.estimate, company: snap.company, sentAt: snap.sentAt,
    customer: { name: cu.name, address: cu.address },
    status: job.status, response: job.proposal.response, respondedAt: job.proposal.respondedAt,
    signature: job.proposal.signature.at ? { name: job.proposal.signature.name, at: job.proposal.signature.at } : null,
    events: (job.proposal.events || []).filter((e) => ["question", "change_request", "reply"].includes(e.type)).map((e) => ({ type: e.type, text: e.text, at: e.at, fromBusiness: e.type === "reply" })),
    payment: { status: job.payment.status, depositCents: snap.estimate.totals.depositCents || 0, paidCents: job.payment.paidCents,
      online: !!process.env.STRIPE_SECRET_KEY && !!(settings.stripeConnectId || process.env.ESTIMATE_PLATFORM_DEPOSITS === "true"), instructions: settings.payInstructions || "" },
    expired: !!expired,
    revised: job.estimate.version !== snap.version && !job.proposal.response,
  };
}

router.get("/public/proposal/:token", limit(120, 60e3), wrap(async (req, res) => {
  const job = await jobByToken(req.params.token);
  if (!job) return bad(res, "This proposal link isn't valid.", 404);
  const settings = await EstimateSettings.findOne({ client: job.client });
  const first = !job.proposal.viewedAt;
  if (req.query.preview !== "1") {
    job.proposal.viewCount += 1;
    if (first) job.proposal.viewedAt = new Date();
    if (job.status === "sent") job.status = "viewed";
    await job.save();
    if (first) {
      await S.audit(job.client, job._id, "customer", "proposal.viewed", { ua: ua(req) }, ip(req));
      const client = await Client.findById(job.client);
      if (client) S.notifyOwner(client, settings, `${job.customer.name || "Your customer"} just opened estimate ${job.number}.`);
    }
  }
  res.json({ ok: true, proposal: publicOut(job, settings) });
}));

router.get("/public/proposal/:token/pdf", limit(30, 60e3), wrap(async (req, res) => {
  const job = await jobByToken(req.params.token);
  if (!job) return bad(res, "This proposal link isn't valid.", 404);
  const settings = await EstimateSettings.findOne({ client: job.client });
  const client = await Client.findById(job.client);
  const snap = job.proposal.snapshot;
  const sig = job.proposal.signature;
  const pdfJob = { number: snap.number, updatedAt: snap.sentAt, estimate: snap.estimate, proposal: { overview: snap.overview, signature: { name: sig.name, at: sig.at, imageData: sig.image ? open(sig.image) : "" } } };
  const buf = await renderPdf({ settings: { ...settings.toObject(), company: snap.company }, client, job: pdfJob, customer: S.customerOf(job), kind: "proposal" });
  res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="proposal-${snap.number}.pdf"`).send(buf);
}));

router.post("/public/proposal/:token/action", limit(20, 600e3), wrap(async (req, res) => {
  const job = await jobByToken(req.params.token);
  if (!job) return bad(res, "This proposal link isn't valid.", 404);
  const b = req.body || {};
  const type = String(b.type || "");
  const settings = await EstimateSettings.findOne({ client: job.client });
  const client = await Client.findById(job.client);
  const snap = job.proposal.snapshot;
  const text = clip(b.text, 2000);
  const who = job.customer.name || "Customer";
  if (["approved", "declined"].includes(job.proposal.response) && type !== "question") return bad(res, `This proposal was already ${job.proposal.response}.`);

  if (type === "question" || type === "change_request") {
    if (!text) return bad(res, "Type your message.");
    job.proposal.events.push({ type, text, by: "customer", ip: ip(req) });
    job.messages.push({ from: "customer", channel: "proposal", text });
    if (type === "change_request") { job.status = "changes_requested"; job.proposal.response = "changes_requested"; job.proposal.respondedAt = new Date(); }
    await job.save();
    await S.audit(job.client, job._id, "customer", `proposal.${type}`, { text }, ip(req));
    S.notifyOwner(client, settings, `${who} ${type === "question" ? "asked a question" : "requested changes"} on ${job.number}: "${text.slice(0, 300)}" ${S.ownerLink(client, job._id)}`);
    return res.json({ ok: true, proposal: publicOut(job, settings) });
  }

  if (type === "decline") {
    job.status = "declined"; job.proposal.response = "declined"; job.proposal.respondedAt = new Date(); job.proposal.declineReason = text; job.proposal.followupsStopped = true;
    job.proposal.events.push({ type: "declined", text, by: "customer", ip: ip(req) });
    await job.save();
    await S.audit(job.client, job._id, "customer", "proposal.declined", { reason: text }, ip(req));
    S.notifyOwner(client, settings, `${who} declined estimate ${job.number}${text ? `: "${text.slice(0, 300)}"` : "."}`);
    return res.json({ ok: true, proposal: publicOut(job, settings) });
  }

  if (type === "approve") {
    const name = clip(b.name, 120);
    const sigImg = String(b.signature || "");
    if (!name) return bad(res, "Type your full name to sign.");
    if (!b.agree) return bad(res, "Please check the box to agree to the terms.");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sigImg) || sigImg.length > 400000 || sigImg.length < 400) return bad(res, "Please draw your signature.");
    if (job.estimate.version !== snap.version) { /* owner revised after sending; customer approves exactly what they saw */ }
    job.proposal.signature = { name, image: seal(sigImg), at: new Date(), ip: ip(req), ua: ua(req) };
    job.proposal.response = "approved"; job.proposal.respondedAt = new Date(); job.proposal.followupsStopped = true;
    job.proposal.events.push({ type: "approved", text: `Signed by ${name}`, by: "customer", ip: ip(req) });
    job.payment.depositCents = snap.estimate.totals.depositCents || 0;
    job.status = "approved";
    await job.save();
    await S.audit(job.client, job._id, "customer", "proposal.approved", { name, version: snap.version, totalCents: snap.estimate.totals.totalCents, depositCents: job.payment.depositCents, ip: ip(req), ua: ua(req) }, ip(req));
    S.notifyOwner(client, settings, `APPROVED: ${name} signed estimate ${job.number} (${money(snap.estimate.totals.totalCents)}).${job.payment.depositCents ? ` Deposit due ${money(job.payment.depositCents)}.` : ""} ${S.ownerLink(client, job._id)}`);
    return res.json({ ok: true, proposal: publicOut(job, settings) });
  }
  bad(res, "Unknown action.");
}));

router.post("/public/proposal/:token/pay", limit(10, 600e3), wrap(async (req, res) => {
  const job = await jobByToken(req.params.token);
  if (!job) return bad(res, "This proposal link isn't valid.", 404);
  if (job.proposal.response !== "approved") return bad(res, "Approve the proposal first.");
  const settings = await EstimateSettings.findOne({ client: job.client });
  const client = await Client.findById(job.client);
  const snap = job.proposal.snapshot;
  const due = Math.max(0, (job.payment.depositCents || snap.estimate.totals.depositCents || 0) - (job.payment.paidCents || 0));
  if (!due) return bad(res, "No deposit is due.");
  const platformOk = process.env.ESTIMATE_PLATFORM_DEPOSITS === "true";
  if (!settings.stripeConnectId && !platformOk) return bad(res, settings.payInstructions ? `Pay your deposit: ${settings.payInstructions}` : "Online payment isn't available. The business will contact you about the deposit.");
  const token = req.params.token;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: S.customerOf(job).email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: due, product_data: { name: `Deposit — ${snap.company.name || client.businessName}`, description: `Estimate ${snap.number}${snap.service ? " · " + snap.service : ""}` } } }],
    payment_intent_data: { metadata: { estimate_job: String(job._id), client_id: String(job.client) }, ...(settings.stripeConnectId ? { transfer_data: { destination: settings.stripeConnectId } } : {}) },
    metadata: { estimate_job: String(job._id), client_id: String(job.client), kind: "deposit" },
    success_url: `${S.SITE()}/proposal.html?t=${token}&paid=1`,
    cancel_url: `${S.SITE()}/proposal.html?t=${token}`,
  });
  job.payment.status = job.payment.status === "none" ? "pending" : job.payment.status; job.payment.stripeSessionId = session.id;
  await job.save();
  await S.audit(job.client, job._id, "customer", "payment.checkout_started", { amountCents: due }, ip(req));
  res.json({ ok: true, url: session.url });
}));

// ================= INBOUND =================
router.post("/inbound/sms", wrap(async (req, res) => {
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  const p = { ...req.query, ...req.body };
  const to = String(p.To || "").replace(/\D/g, "").slice(-10);
  const from = S.e164(p.From);
  const body = clip(p.Body, 1500);
  if (to.length !== 10 || !from) return;
  const client = await Client.findOne({ aiNumber: "+1" + to });
  if (!client) return;
  const s = await S.getSettings(client, { create: false });
  if (!s || !s.addonActive()) return;
  if (/^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i.test(body)) {
    await EstimateJob.updateMany({ client: client._id, "customer.phoneHash": phoneHash(from) }, { "proposal.followupsStopped": true });
    return;
  }
  const open30 = await EstimateJob.findOne({ client: client._id, "customer.phoneHash": phoneHash(from), updatedAt: { $gte: new Date(Date.now() - 30 * 864e5) }, status: { $nin: ["completed", "lost", "declined"] } }).sort({ updatedAt: -1 });
  if (open30) {
    if (body) open30.messages.push({ from: "customer", channel: "sms", text: body });
    if (body && ["sent", "viewed"].includes(open30.status)) open30.proposal.events.push({ type: "question", text: body, by: "customer" });
    await open30.save();
    await S.audit(client._id, open30._id, "customer", "sms.received", { text: body }, "");
    S.notifyOwner(client, s, `Text from ${open30.customer.name || from} about ${open30.number}: "${body.slice(0, 300)}" ${S.ownerLink(client, open30._id)}`);
    return;
  }
  if (!body) return;
  const job = await S.createJob(client, s, { source: "sms", phone: from, problem: body, message: body }, "customer", "");
  await S.runAnalysis(client, s, job, "sms");
  S.notifyOwner(client, s, `New text request ${job.number} from ${from}: "${body.slice(0, 200)}". Draft ready: ${S.ownerLink(client, job._id)}`);
}));

router.post("/inbound/email", upload.any(), wrap(async (req, res) => {
  res.json({ ok: true });
  const b = req.body || {};
  const m = String(b.to || "").match(/est\+([A-Za-z0-9_-]{10,})@/);
  if (!m) return;
  const hit = await settingsByIntake(m[1]);
  if (!hit) return;
  const { s, client } = hit;
  const fromRaw = String(b.from || "");
  const email = (fromRaw.match(/<([^>]+)>/) || [null, fromRaw])[1].trim();
  const name = fromRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
  const text = clip(b.text || String(b.html || "").replace(/<[^>]+>/g, " "), 5000);
  const job = await S.createJob(client, s, { source: "email", name, email, service: clip(b.subject, 160), problem: text, message: text }, "customer", "");
  const photos = (req.files || []).filter((f) => IMG_OK.test(f.mimetype) && f.size <= 5 * 1024 * 1024);
  if (photos.length) await savePhotos(client, job, photos, "customer");
  await S.runAnalysis(client, s, job, "email");
  S.notifyOwner(client, s, `New email request ${job.number} from ${name || email}: ${S.ownerLink(client, job._id)}`);
}));

// ================= STRIPE (called from routes/webhooks.js) =================
async function stripeEvent(type, obj) {
  const meta = obj.metadata || {};
  if (type === "checkout.session.completed" && meta.estimate_job) {
    const job = await EstimateJob.findById(meta.estimate_job).catch(() => null);
    if (!job || obj.payment_status !== "paid") return true;
    if (job.payment.stripeSessionId === obj.id && job.payment.status === "paid") return true;
    job.payment.paidCents += obj.amount_total || 0; job.payment.status = "paid"; job.payment.method = "card"; job.payment.paidAt = new Date(); job.payment.stripeSessionId = obj.id;
    if (job.status === "approved") job.status = "deposit_paid";
    await job.save();
    await S.audit(job.client, job._id, "system", "payment.received", { amountCents: obj.amount_total, session: obj.id });
    const client = await Client.findById(job.client); const s = await EstimateSettings.findOne({ client: job.client });
    if (client) S.notifyOwner(client, s, `Deposit received: ${money(obj.amount_total)} for ${job.number} (${job.customer.name}). Time to schedule it: ${S.ownerLink(client, job._id)}`);
    return true;
  }
  let s = null;
  const subMeta = (obj.subscription_details || {}).metadata || {};
  if (subMeta.addon === "estimate" && subMeta.client_id) s = await EstimateSettings.findOne({ client: subMeta.client_id });
  if (!s && meta.addon === "estimate" && meta.client_id) s = await EstimateSettings.findOne({ client: meta.client_id });
  const subId = obj.subscription || (obj.object === "subscription" ? obj.id : null);
  if (!s && subId) s = await EstimateSettings.findOne({ stripeSubscriptionId: subId });
  if (!s) return false;
  if (type === "checkout.session.completed") { s.stripeSubscriptionId = obj.subscription || s.stripeSubscriptionId; if (s.status !== "comp") s.status = s.trialEndsAt && s.trialEndsAt > new Date() ? "trial" : "active"; }
  if (type === "invoice.paid" && (obj.amount_paid || 0) > 0) { s.status = "active"; s.paidThrough = new Date(Date.now() + 32 * 864e5); }
  if (type === "invoice.payment_failed") s.status = "past_due";
  if (type === "customer.subscription.deleted" && s.status !== "comp") s.status = "canceled";
  await s.save();
  await S.audit(s.client, null, "system", `addon.${type}`, { status: s.status });
  return true;
}

module.exports = { router, stripeEvent };
