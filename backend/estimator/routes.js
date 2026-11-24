/**
 * HSW365 AI Estimate: the standalone service API. Mounted at /api/estimator.
 * Static front end: estimate.hsw365.net (cross-origin, Bearer token, no cookies).
 *
 *   GET  /plans                         public prices (one source of truth: estimator/plans.js)
 *   POST /signup  { business, email, trade?, phone? }   -> { token, pin }  (the account PIN is generated, shown once and emailed)
 *   POST /login   { pin }                               -> { token }       PIN only, no email
 *   POST /reset   { email }                             a new PIN is emailed (always answers ok)
 *   POST /owner   x-hsw-owner: <owner PIN session>     -> { token }  HSW365 owner: free account, every plan, no limits
 *   --- signed in (Authorization: Bearer <token>) ---
 *   POST /me, /list, /get, /save, /delete, /letterhead, /pdf, /email, /writeup
 *   POST /analyze    multipart: size, type, notes, photos[], audio[]   one conversion: reserve -> AI -> refund on failure
 *   POST /transcribe multipart: audio                                  dictation fallback (free)
 *   POST /checkout   { kind: "plan"|"pack"|"topup", key }              Stripe Checkout URL
 *   POST /portal                                                       Stripe billing portal URL
 *   POST /admin/stats { key }                                          owner dashboard numbers (CALLTWIN_ADMIN_KEY or owner PIN session)
 *   stripeEvent(type, obj) is called from routes/webhooks.js.
 */
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const axios = require("axios");
const P = require("./plans");
const M = require("./math");
const { renderProposalPdf } = require("./pdf");
const { analyzeJob, transcribe, noMoney } = require("./analyze");
const DB = require("./models");
const { Account, Doc, Usage } = DB;
const ownerPin = require("../services/ownerPin");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 16, fieldSize: 64 * 1024 } });
const IMG = /^image\/(jpeg|png|webp)$/, AUD = /^(audio|video)\//;
const secret = () => process.env.JWT_SECRET || process.env.CALLTWIN_ADMIN_KEY || "";
const SITE = () => String(process.env.ESTIMATOR_SITE || "https://hsw365-ai-estimate.onrender.com").replace(/\/+$/, "");
const bad = (res, error, code = 400, extra = {}) => res.status(code).json({ ok: false, error, ...extra });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error("[estimator]", req.path, e.message);
  if (!res.headersSent) bad(res, "Something went wrong. Try again.", 500);
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- CORS: the front end is a separate static site; auth is a Bearer token, never a cookie ----------
router.use((req, res, next) => {
  const o = req.get("origin");
  if (o) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); }
  res.set("Access-Control-Allow-Headers", "content-type, authorization, x-hsw-owner");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Expose-Headers", "content-disposition");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
router.use(express.json({ limit: "8mb" }));

// ---------- tiny in-memory rate limits ----------
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  return false;
}
function note(key) { const a = hits.get(key) || []; a.push(Date.now()); hits.set(key, a); }
const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const f = v.filter((t) => now - t < 3600e3); if (f.length) hits.set(k, f); else hits.delete(k); } }, 600e3).unref();

const sign = (a) => jwt.sign({ est: String(a._id) }, secret(), { expiresIn: "90d" });
async function auth(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.get("authorization") || "");
    if (!m) return bad(res, "Sign in first.", 401);
    let p; try { p = jwt.verify(m[1], secret()); } catch (_) { return bad(res, "Your session ended. Sign in again.", 401); }
    if (!p.est || !mongoose.isValidObjectId(p.est)) return bad(res, "Sign in first.", 401);
    const a = await Account.findById(p.est);
    if (!a) return bad(res, "Sign in first.", 401);
    req.acct = a;
    next();
  } catch (e) { console.error("[estimator] auth", e.message); bad(res, "Something went wrong. Try again.", 500); }
}

// ---------- public ----------
router.get("/plans", (req, res) => res.json({ ok: true, ...P.publicPlans() }));
router.get("/health", (req, res) => res.json({ ok: true, ai: require("./analyze").ready(), email: require("../services/mailer").emailReady(), stripe: !!process.env.STRIPE_SECRET_KEY }));

async function sendPin(a, pin, fresh) {
  const mailer = require("../services/mailer");
  if (!mailer.emailReady()) return false;
  const text = [
    `Hi ${a.business || "there"},`, "",
    fresh ? "Welcome to HSW365 AI Estimate. Your account is ready." : "Here is your new sign-in PIN.", "",
    `Your PIN: ${pin}`, "",
    `Sign in at ${SITE()}/app.html with just the PIN. Keep it somewhere safe. If you lose it, use "Forgot PIN" and we will email a new one.`, "",
    fresh ? `You have ${P.FREE_TRIAL} free estimates to try. Take photos or a short video of any job, talk through it, and get a finished estimate and PDF in about a minute.` : "", "",
    "HSW365 Media LLC",
  ].join("\n");
  return mailer.sendEmail(a.email, fresh ? "Your HSW365 AI Estimate PIN" : "Your new HSW365 AI Estimate PIN", text, { fromName: "HSW365 AI Estimate", replyTo: "hsw365media@gmail.com" });
}

router.post("/signup", wrap(async (req, res) => {
  const ip = ipOf(req);
  if (limited(`su:${ip}`, 5, 3600e3)) return bad(res, "Too many sign-ups from this connection. Try again later.", 429);
  const business = String(req.body.business || "").trim().slice(0, 120);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 160);
  if (business.length < 2) return bad(res, "Add your business name.");
  if (!EMAIL.test(email)) return bad(res, "Add a valid email address.");
  if (await Account.findOne({ email }).lean()) return bad(res, "That email already has an account. Use Forgot PIN to get a new PIN.", 409);
  note(`su:${ip}`);
  let a = null, pin = "";
  for (let i = 0; i < 5 && !a; i++) {
    pin = DB.newPin();
    try {
      a = await Account.create({
        email, business, trade: String(req.body.trade || "").trim().slice(0, 80), phone: String(req.body.phone || "").trim().slice(0, 40),
        pinHash: DB.pinHash(pin), trialLeft: P.FREE_TRIAL, company: { name: business }, source: String(req.body.source || "").slice(0, 60),
      });
    } catch (e) { if (e.code === 11000 && /email/.test(e.message)) return bad(res, "That email already has an account.", 409); if (e.code !== 11000) throw e; }
  }
  if (!a) return bad(res, "Couldn't create the account. Try again.", 500);
  sendPin(a, pin, true).catch((e) => console.error("[estimator] welcome email:", e.message));
  res.json({ ok: true, token: sign(a), pin, me: DB.summary(a) });
}));

router.post("/login", wrap(async (req, res) => {
  const ip = ipOf(req);
  if (limited(`li:${ip}`, 6, 15 * 60e3)) return bad(res, "Too many tries. Wait 15 minutes and try again.", 429);
  const pin = String(req.body.pin || "").replace(/\s+/g, "");
  const a = /^\d{8}$/.test(pin) ? await Account.findOne({ pinHash: DB.pinHash(pin) }) : null;
  if (!a) { note(`li:${ip}`); return bad(res, "That PIN isn't right.", 401); }
  hits.delete(`li:${ip}`);
  res.json({ ok: true, token: sign(a), me: DB.summary(a) });
}));

router.post("/reset", wrap(async (req, res) => {
  const ip = ipOf(req);
  const email = String(req.body.email || "").trim().toLowerCase();
  if (limited(`rs:${ip}`, 5, 3600e3)) return bad(res, "Too many tries. Try again later.", 429);
  note(`rs:${ip}`);
  if (EMAIL.test(email)) {
    const a = await Account.findOne({ email });
    if (a) {
      for (let i = 0; i < 5; i++) {
        const pin = DB.newPin();
        try { a.pinHash = DB.pinHash(pin); await a.save(); sendPin(a, pin, false).catch(() => {}); break; }
        catch (e) { if (e.code !== 11000) throw e; }
      }
    }
  }
  res.json({ ok: true, message: "If that email has an account, a new PIN is on its way." });
}));

// HSW365 owner: the PIN session from the Owner login tab, re-checked with the owner-pin service. Signs in to the owner's own
// account (OWNER_EMAILS, created on first use). It is a comp account: every plan and job size, unlimited, no checkout.
router.post("/owner", wrap(async (req, res) => {
  const ip = ipOf(req);
  if (limited(`ow:${ip}`, 20, 15 * 60e3)) return bad(res, "Too many tries. Wait 15 minutes and try again.", 429);
  if (!(await ownerPin.isOwner(req))) { note(`ow:${ip}`); return bad(res, "Owner sign in needed. Use the Owner login tab.", 401); }
  const email = ownerPin.ownerEmail();
  let a = await Account.findOne({ email });
  for (let i = 0; i < 5 && !a; i++) {
    try { a = await Account.create({ email, business: "HSW365 Media", pinHash: DB.pinHash(DB.newPin() + ":" + Date.now()), comp: true, company: { name: "HSW365 Media" }, source: "owner-pin" }); }
    catch (e) { if (e.code !== 11000) throw e; a = await Account.findOne({ email }); }
  }
  if (!a) return bad(res, "Couldn't open the owner account. Try again.", 500);
  if (!a.comp) { a.comp = true; await a.save(); }
  res.json({ ok: true, owner: true, token: sign(a), me: DB.summary(a) });
}));

// ---------- signed in ----------
router.post("/me", auth, (req, res) => res.json({ ok: true, me: DB.summary(req.acct), company: companyOf(req.acct), defaults: M.DEFAULT_TERMS }));

function companyOf(a) {
  const base = { ...M.COMPANY, name: a.business || M.COMPANY.name };
  const c = { ...base, ...(a.company || {}) };
  return { ...c, badge: DB.summary(a).badge };
}
async function nextNumber(acctId) {
  const yr = new Date().getFullYear();
  const last = await Doc.find({ acct: acctId, number: new RegExp(`^${yr}-\\d+$`) }).sort({ createdAt: -1 }).limit(50).lean();
  const max = last.reduce((m, p) => Math.max(m, parseInt(String(p.number).split("-")[1], 10) || 0), 0);
  return `${yr}-${String(max + 1).padStart(3, "0")}`;
}
const finished = (a, raw) => M.normalize({ ...(raw || {}), company: { ...companyOf(a), ...((raw && raw.company) || {}), badge: DB.summary(a).badge } });
const fileName = (d) => `${d.company.name} ${M.TYPES[d.type]} ${d.number || d.date}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") + ".pdf";

router.post("/list", auth, wrap(async (req, res) => {
  const rows = await Doc.find({ acct: req.acct._id }).sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ ok: true, me: DB.summary(req.acct), next: await nextNumber(req.acct._id), company: companyOf(req.acct), defaults: M.DEFAULT_TERMS,
    items: rows.map((r) => ({ id: r._id, number: r.number, type: r.type, customer: r.customer, totalCents: r.totalCents, updatedAt: r.updatedAt,
      photoCount: ((r.doc && r.doc.photos) || []).length, doc: { ...r.doc, photos: undefined } })) });
}));

router.post("/get", auth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.id)) return bad(res, "Not found.", 404);
  const r = await Doc.findOne({ _id: req.body.id, acct: req.acct._id }).lean();
  if (!r) return bad(res, "Not found.", 404);
  res.json({ ok: true, id: r._id, doc: r.doc });
}));

router.post("/save", auth, wrap(async (req, res) => {
  const d = finished(req.acct, req.body.doc);
  if (!d.number) d.number = await nextNumber(req.acct._id);
  delete d.company;
  const set = { acct: req.acct._id, number: d.number, type: d.type, customer: d.customer.company || d.customer.contact || "", totalCents: d.totals.totalCents, doc: d };
  let row;
  if (req.body.id && mongoose.isValidObjectId(req.body.id)) row = await Doc.findOneAndUpdate({ _id: req.body.id, acct: req.acct._id }, set, { new: true });
  if (!row) row = await Doc.create(set);
  res.json({ ok: true, id: row._id, number: row.number, totals: d.totals });
}));

router.post("/delete", auth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.id)) return bad(res, "Not found.", 404);
  await Doc.deleteOne({ _id: req.body.id, acct: req.acct._id });
  res.json({ ok: true });
}));

router.post("/letterhead", auth, wrap(async (req, res) => {
  const c = req.body.company || {};
  const doc = {};
  for (const k of Object.keys(M.COMPANY)) {
    if (k === "brand") { const b = String(c.brand || "").trim(); doc.brand = /^#[0-9a-fA-F]{6}$/.test(b) ? b : M.COMPANY.brand; continue; }
    doc[k] = String(c[k] == null ? "" : c[k]).trim().slice(0, 200);
  }
  if (!doc.name) doc.name = req.acct.business;
  req.acct.company = doc; req.acct.markModified("company");
  if (doc.name && doc.name !== req.acct.business) req.acct.business = doc.name;
  await req.acct.save();
  res.json({ ok: true, company: companyOf(req.acct) });
}));

router.post("/pdf", auth, wrap(async (req, res) => {
  const d = finished(req.acct, req.body.doc);
  if (!d.items.length) return bad(res, "Add at least one line with a price.");
  const pdf = await renderProposalPdf(d);
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `inline; filename="${fileName(d)}"`);
  res.send(pdf);
}));

router.post("/email", auth, wrap(async (req, res) => {
  const mailer = require("../services/mailer");
  const to = String(req.body.to || "").trim();
  if (!EMAIL.test(to)) return bad(res, "Add the customer's email address.");
  if (limited(`em:${req.acct._id}`, 60, 3600e3)) return bad(res, "That's a lot of emails in an hour. Try again shortly.", 429);
  const d = finished(req.acct, req.body.doc);
  if (!d.items.length) return bad(res, "Add at least one line with a price.");
  if (!mailer.emailReady()) return bad(res, "Email isn't available right now. Download the PDF and send it yourself.", 503);
  note(`em:${req.acct._id}`);
  const pdf = await renderProposalPdf(d);
  const kind = M.TYPES[d.type];
  const who = d.customer.contact || d.customer.company || "there";
  const msg = String(req.body.message || "").trim().slice(0, 2000);
  const t = d.totals;
  const text = [
    `Hello ${who},`, "",
    msg || `Attached is our ${kind.toLowerCase()} ${d.number} for ${d.jobsite || d.title || "your project"}.`, "",
    `Total: ${M.money(t.totalCents)}${d.payments.length ? `\nBalance due: ${M.money(t.balanceCents)}` : ""}`, "",
    d.type === "invoice" ? "Thank you for your business." : "To accept, sign the attached page and reply to this email.", "",
    d.company.name, [d.company.office && `Office ${d.company.office}`, d.company.cell && `Cell ${d.company.cell}`].filter(Boolean).join("  |  "),
  ].join("\n");
  const ok = await mailer.sendEmail(to, `${d.company.name} ${kind} ${d.number}`, text, {
    fromName: d.company.name, replyTo: d.company.email || req.acct.email,
    attachments: [{ filename: fileName(d), content: pdf, contentType: "application/pdf" }],
  });
  if (!ok) return bad(res, "The email didn't go through. Download the PDF and send it yourself, or try again.", 502);
  res.json({ ok: true, sentTo: to });
}));

// ---------- the conversion ----------
router.post("/transcribe", upload.single("audio"), auth, wrap(async (req, res) => {
  const f = req.file;
  if (!f || !AUD.test(f.mimetype) || f.size < 800) return bad(res, "I didn't catch anything. Tap the mic and try again.");
  try {
    const text = await transcribe(f);
    if (!text) return bad(res, "I didn't catch anything. Tap the mic and try again.");
    res.json({ ok: true, text });
  } catch (e) { console.error("[estimator] transcribe:", e.message); bad(res, "Talking to type isn't working right now. Type it instead.", 502); }
}));

router.post("/analyze", upload.fields([{ name: "photos", maxCount: 12 }, { name: "audio", maxCount: 3 }]), auth, wrap(async (req, res) => {
  const images = ((req.files && req.files.photos) || []).filter((f) => IMG.test(f.mimetype) && f.size <= 4 * 1024 * 1024);
  const audios = ((req.files && req.files.audio) || []).filter((f) => AUD.test(f.mimetype));
  const notes = String(req.body.notes || "").trim().slice(0, 2000);
  if (!images.length && !audios.length && !notes) return bad(res, "Add photos, a video, or a voice note first.");
  const size = DB.SIZES.includes(req.body.size) ? req.body.size : "small";
  if (limited(`an:${req.acct._id}`, 30, 600e3)) return bad(res, "Slow down a little. Try again in a few minutes.", 429);
  note(`an:${req.acct._id}`);
  const got = await DB.reserve(req.acct, size);
  if (!got) {
    return bad(res, "You're out of estimates. Add a plan or buy a pack to keep going.", 402, { me: DB.summary(req.acct), needs: size });
  }
  const docs = (await Doc.find({ acct: req.acct._id }, { "doc.items": 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(300).lean())
    .map((r) => ({ items: (r.doc && r.doc.items) || [], updatedAt: r.updatedAt }));
  const biz = { name: req.acct.business, trade: req.acct.trade };
  try {
    const out = await analyzeJob({ type: M.TYPES[req.body.type] ? req.body.type : "estimate", notes, images, audios, docs, biz });
    await Usage.create({ acct: req.acct._id, source: got.source, size, ok: true }).catch(() => {});
    res.json({ ok: true, ...out, charged: got.source, me: DB.summary(got.acct) });
  } catch (e) {
    await DB.refund(req.acct._id, got.source).catch((x) => console.error("[estimator] refund failed:", x.message));
    await Usage.create({ acct: req.acct._id, source: got.source, size, ok: false }).catch(() => {});
    if (e.status) return bad(res, `${e.message} You were not charged.`, e.status);
    throw e;
  }
}));

// ---------- AI write-up: words only, never numbers ----------
const SYS = (type, biz) => `You write the heading and scope paragraph for a ${M.TYPES[type].toLowerCase()} from ${biz.name || "a contractor"}${biz.trade ? `, a ${biz.trade} contractor` : ""}.
Use only the facts the contractor gives you. Do not add work, materials, brands, code sections, warranties, schedules or promises they did not mention.
Never write any price, dollar amount, total, percentage or payment term. Money is handled elsewhere.
Plain, professional contractor wording. No sales talk.
Reply with JSON only: {"title": "<one line, under 15 words>", "scope": "<2 to 4 sentences>"}`;
async function aiWriteup(type, notes, lines, biz) {
  const base = String(process.env.CHAT_BASE_URL || "").replace(/\/+$/, "");
  const models = String(process.env.CHAT_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
  if (!base || !models.length) return null;
  const user = `Notes: ${notes || "(none)"}\nLine items: ${lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join("; ") : "(none)"}`;
  for (const model of models) {
    try {
      const r = await axios.post(`${base}/chat/completions`, { model, max_tokens: 500, temperature: 0.2, messages: [{ role: "system", content: SYS(type, biz) }, { role: "user", content: user }] },
        { headers: process.env.CHAT_API_KEY ? { Authorization: `Bearer ${process.env.CHAT_API_KEY}` } : {}, timeout: 25000 });
      const j = JSON.parse((String(r.data.choices[0].message.content).match(/\{[\s\S]*\}/) || ["{}"])[0]);
      const title = noMoney(j.title).slice(0, 160), scope = noMoney(j.scope).slice(0, 1200);
      if (title || scope) return { title, scope };
    } catch (e) { console.error("[estimator] writeup engine failed:", e.response ? e.response.status : e.message); }
  }
  return null;
}
function plainWriteup(notes, lines) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return { title: cap(noMoney(notes.split(/[.\n]/)[0] || lines[0] || "").slice(0, 160)), scope: lines.length ? `Work includes: ${lines.map((l) => l.replace(/\.$/, "")).join("; ")}.` : cap(noMoney(notes).slice(0, 1200)) };
}
router.post("/writeup", auth, wrap(async (req, res) => {
  const notes = String(req.body.notes || "").trim().slice(0, 1500);
  const lines = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => String((i && i.desc) || "").trim().slice(0, 300)).filter(Boolean).slice(0, 30);
  if (!notes && !lines.length) return bad(res, "Type a few words about the job first.");
  const type = M.TYPES[req.body.type] ? req.body.type : "proposal";
  const out = await aiWriteup(type, notes, lines, { name: req.acct.business, trade: req.acct.trade });
  res.json({ ok: true, ...(out || plainWriteup(notes, lines)), ai: !!out });
}));

// ---------- billing ----------
let stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error("Card payments aren't set up yet."), { status: 503 });
  if (!stripe) stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  return stripe;
}
const MONTH = { interval: "month" };

router.post("/checkout", auth, wrap(async (req, res) => {
  let s; try { s = getStripe(); } catch (e) { return bad(res, e.message, e.status || 503); }
  const a = req.acct, kind = String(req.body.kind || ""), key = String(req.body.key || "");
  const meta = { estimator: "1", acct: String(a._id), kind, key };
  const common = { success_url: `${SITE()}/app.html?paid=1`, cancel_url: `${SITE()}/app.html?canceled=1`, client_reference_id: String(a._id), allow_promotion_codes: true,
    ...(a.stripeCustomerId ? { customer: a.stripeCustomerId } : { customer_email: a.email }) };
  let session;
  if (kind === "plan") {
    const p = P.planOf(key);
    if (!p) return bad(res, "Pick a plan.");
    if (DB.planLive(a)) return bad(res, "You already have a plan. Use Manage billing to change it.");
    const items = [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.monthlyCents, recurring: MONTH, product_data: { name: `HSW365 AI Estimate ${p.name}`, description: `${p.included} estimates a month. ${p.jobs}.` } } }];
    if (p.setupCents) items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: p.setupCents, product_data: { name: `${p.name} setup: your letterhead, price book and forms` } } });
    session = await s.checkout.sessions.create({ mode: "subscription", line_items: items, metadata: meta, subscription_data: { metadata: meta }, ...common });
  } else if (kind === "pack") {
    const k = P.PACKS[key];
    if (!k) return bad(res, "Pick a pack.");
    session = await s.checkout.sessions.create({ mode: "payment", metadata: meta, ...common,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: k.priceCents, product_data: { name: `${k.qty} AI estimates, ${k.jobs}`, description: `HSW365 AI Estimate pay-per-conversion pack` } } }] });
  } else if (kind === "license") {
    const [tier, term = "buyout"] = key.split(":");
    const cents = P.licenseCents(tier, term);
    if (!cents || !["buyout", "year"].includes(term)) return bad(res, "Pick a license.");
    const l = P.LICENSES[tier];
    session = await s.checkout.sessions.create({ mode: "payment", metadata: { ...meta, key: `${tier}:${term}` }, ...common,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: `HSW365 AI Estimate license: ${l.name}, ${term === "year" ? "12 months" : "buyout"}`, description: `Unlimited estimates and proposals. ${l.blurb}.` } } }] });
  } else if (kind === "topup") {
    if (!DB.planLive(a)) return bad(res, "Top-ups are for subscribers. Pick a plan or a pack.");
    const cents = P.topupCents(a.plan);
    session = await s.checkout.sessions.create({ mode: "payment", metadata: { ...meta, key: a.plan }, ...common,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: `${P.TOPUP_QTY} extra AI estimates`, description: "HSW365 AI Estimate top-up" } } }] });
  } else return bad(res, "Pick what to buy.");
  res.json({ ok: true, url: session.url });
}));

router.post("/portal", auth, wrap(async (req, res) => {
  let s; try { s = getStripe(); } catch (e) { return bad(res, e.message, e.status || 503); }
  if (!req.acct.stripeCustomerId) return bad(res, "No billing yet. Pick a plan or a pack first.");
  const ps = await s.billingPortal.sessions.create({ customer: req.acct.stripeCustomerId, return_url: `${SITE()}/app.html` });
  res.json({ ok: true, url: ps.url });
}));

// Called from routes/webhooks.js for every Stripe event. Returns true when the event belonged to this service.
async function stripeEvent(type, obj) {
  const meta = obj.metadata || {};
  const subMeta = (obj.subscription_details || {}).metadata || {};
  const acctId = meta.estimator === "1" ? meta.acct : subMeta.estimator === "1" ? subMeta.acct : null;
  const subId = obj.subscription || (obj.object === "subscription" ? obj.id : null);
  let a = null;
  if (acctId && mongoose.isValidObjectId(acctId)) a = await Account.findById(acctId);
  if (!a && subId) a = await Account.findOne({ stripeSubscriptionId: subId });
  if (!a) return false;

  if (type === "checkout.session.completed") {
    if (a.sessions.includes(obj.id)) return true;
    const set = { $push: { sessions: { $each: [obj.id], $slice: -50 } }, $inc: { paidCents: obj.amount_total || 0 } };
    if (obj.customer) set.$set = { stripeCustomerId: obj.customer };
    if (meta.kind === "plan" && P.PLANS[meta.key]) {
      set.$set = { ...(set.$set || {}), plan: meta.key, subStatus: "active", stripeSubscriptionId: obj.subscription || a.stripeSubscriptionId, periodStart: new Date(), usedPeriod: 0 };
    } else if (obj.payment_status === "paid" && meta.kind === "license") {
      const [tier, term] = String(meta.key || "").split(":");
      if (!P.licenseCents(tier, term)) return true;
      const expiresAt = term === "year" ? new Date(Date.now() + 365 * 86400000) : null;
      set.$set = { ...(set.$set || {}), license: { tier, term, expiresAt, boughtAt: new Date() } };
    } else if (obj.payment_status === "paid" && meta.kind === "pack" && P.PACKS[meta.key]) {
      set.$inc[`packs.${meta.key}`] = P.PACKS[meta.key].qty;
    } else if (obj.payment_status === "paid" && meta.kind === "topup") {
      set.$inc.topups = P.TOPUP_QTY;
    } else if (obj.payment_status !== "paid") return true;
    await Account.updateOne({ _id: a._id }, set);
    return true;
  }
  if (type === "invoice.paid" && (obj.amount_paid || 0) > 0) {
    // A renewal starts a fresh month of included estimates. (The first invoice is already handled by checkout.)
    const renewal = obj.billing_reason === "subscription_cycle";
    await Account.updateOne({ _id: a._id }, { $set: { subStatus: "active", ...(renewal ? { usedPeriod: 0, periodStart: new Date() } : {}) }, ...(renewal ? { $inc: { paidCents: obj.amount_paid } } : {}) });
    return true;
  }
  if (type === "invoice.payment_failed") { await Account.updateOne({ _id: a._id }, { $set: { subStatus: "past_due" } }); return true; }
  if (type === "customer.subscription.deleted") { await Account.updateOne({ _id: a._id }, { $set: { subStatus: "canceled", plan: "" } }); return true; }
  return false;
}

// ---------- owner dashboard ----------
const adminKeyOk = (req) => !!process.env.CALLTWIN_ADMIN_KEY && String(req.body.key || "") === process.env.CALLTWIN_ADMIN_KEY;
router.post("/admin/stats", wrap(async (req, res) => {
  if (!adminKeyOk(req) && !(await ownerPin.isOwner(req))) return bad(res, "No.", 401);
  const since = new Date(Date.now() - 30 * 864e5);
  const [accounts, active, used, ok] = await Promise.all([
    Account.countDocuments(), Account.find({ subStatus: "active" }, { plan: 1 }).lean(),
    Usage.countDocuments({ at: { $gte: since } }), Usage.countDocuments({ at: { $gte: since }, ok: true }),
  ]);
  const byPlan = {}; let mrrCents = 0;
  for (const x of active) { byPlan[x.plan] = (byPlan[x.plan] || 0) + 1; mrrCents += (P.PLANS[x.plan] || {}).monthlyCents || 0; }
  const revenue = await Account.aggregate([{ $group: { _id: null, cents: { $sum: "$paidCents" } } }]);
  res.json({ ok: true, accounts, subscribers: active.length, byPlan, mrrCents, conversions30d: used, successful30d: ok, collectedCents: (revenue[0] || {}).cents || 0 });
}));

// Fulfil a Shopify order (or a comp) by hand: { key, email, plan? | pack?, qty? }. Admin key only.
router.post("/admin/grant", wrap(async (req, res) => {
  if (!adminKeyOk(req) && !(await ownerPin.isOwner(req))) return bad(res, "No.", 401);
  const a = await Account.findOne({ email: String(req.body.email || "").trim().toLowerCase() });
  if (!a) return bad(res, "No account with that email. They need to sign up first.", 404);
  if (req.body.plan) {
    if (!P.PLANS[req.body.plan]) return bad(res, "Unknown plan.");
    a.plan = req.body.plan; a.subStatus = "active"; a.usedPeriod = 0; a.periodStart = new Date();
  } else if (req.body.pack) {
    if (!P.PACKS[req.body.pack]) return bad(res, "Unknown pack.");
    a.packs[req.body.pack] = (a.packs[req.body.pack] || 0) + (parseInt(req.body.qty, 10) || P.PACKS[req.body.pack].qty);
  } else return bad(res, "Say plan or pack.");
  await a.save();
  res.json({ ok: true, me: DB.summary(a) });
}));

module.exports = { router, stripeEvent };
