/**
 * New Ark proposal maker API. Mounted at /api/newark/proposal. Every route is owner only:
 * the body carries the owner's portal PIN, checked by routes/newark.js ownerPin() before anything runs.
 *
 *   POST /list      { pin }                          saved proposals (newest first) + next number + letterhead
 *   POST /save      { pin, doc, id? }                save or update one -> { id, number }
 *   POST /delete    { pin, id }
 *   POST /letterhead { pin, company }                save the company block used on every document
 *   POST /pdf       { pin, doc }                     the finished PDF (application/pdf)
 *   POST /email     { pin, doc, to, message? }       email the PDF to the customer (reply-to = owner)
 *   POST /writeup   { pin, notes, items, type }      AI turns the owner's short notes into the title + scope paragraph.
 *                                                    The AI never sees or writes prices; all money comes from the owner's lines.
 */
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const M = require("../services/newarkProposalMath");
const { renderProposalPdf } = require("../services/newarkProposalPdf");

const Proposal = mongoose.models.NewarkProposal || mongoose.model("NewarkProposal", new mongoose.Schema({
  kind: { type: String, default: "doc", index: true }, // "doc" | "letterhead"
  number: String,
  type: String,
  customer: String,
  totalCents: Number,
  doc: { type: Object, default: {} },
}, { timestamps: true, minimize: false }));

const JSON_TYPE = { "Content-Type": "application/json" };
const bad = (res, error, code = 400) => res.status(code).json({ ok: false, error });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error("[newark proposal]", req.path, e.message);
  if (!res.headersSent) bad(res, "Something went wrong. Try again.", 500);
});

// The saved letterhead; if the database is down, the PDF still goes out with the standard New Ark details.
async function letterhead() {
  if (mongoose.connection.readyState !== 1) return { ...M.COMPANY };
  try {
    const l = await Proposal.findOne({ kind: "letterhead" }).maxTimeMS(4000).lean();
    return { ...M.COMPANY, ...((l && l.doc) || {}) };
  } catch (e) {
    console.error("[newark proposal] letterhead read failed:", e.message);
    return { ...M.COMPANY };
  }
}
// Next number: year + running count, e.g. 2026-015. The owner can always type his own.
async function nextNumber() {
  const yr = new Date().getFullYear();
  const last = await Proposal.find({ kind: "doc", number: new RegExp(`^${yr}-\\d+$`) }).sort({ createdAt: -1 }).limit(50).lean();
  const max = last.reduce((a, p) => Math.max(a, parseInt(String(p.number).split("-")[1], 10) || 0), 0);
  return `${yr}-${String(max + 1).padStart(3, "0")}`;
}
async function finished(raw) {
  const doc = M.normalize({ ...(raw || {}), company: { ...(await letterhead()), ...((raw && raw.company) || {}) } });
  return doc;
}
const fileName = (d) => `${d.company.name} ${M.TYPES[d.type]} ${d.number || d.date}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") + ".pdf";

module.exports = function proposalRouter(ownerPin) {
  const router = express.Router();
  router.use(express.json({ limit: "400kb" }));
  router.use(ownerPin);

  router.post("/list", wrap(async (req, res) => {
    const rows = await Proposal.find({ kind: "doc" }).sort({ updatedAt: -1 }).limit(100).lean();
    res.json({ ok: true, next: await nextNumber(), company: await letterhead(), defaults: M.DEFAULT_TERMS,
      items: rows.map((r) => ({ id: r._id, number: r.number, type: r.type, customer: r.customer, totalCents: r.totalCents, updatedAt: r.updatedAt, doc: r.doc })) });
  }));

  router.post("/save", wrap(async (req, res) => {
    const d = await finished(req.body.doc);
    if (!d.number) d.number = await nextNumber();
    delete d.company; // the letterhead is kept once, not copied into every document
    const set = { number: d.number, type: d.type, customer: d.customer.company || d.customer.contact || "", totalCents: d.totals.totalCents, doc: d };
    let row;
    if (req.body.id && mongoose.isValidObjectId(req.body.id)) row = await Proposal.findOneAndUpdate({ _id: req.body.id, kind: "doc" }, set, { new: true });
    if (!row) row = await Proposal.create({ kind: "doc", ...set });
    res.json({ ok: true, id: row._id, number: row.number, totals: d.totals });
  }));

  router.post("/delete", wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.body.id)) return bad(res, "Not found.", 404);
    await Proposal.deleteOne({ _id: req.body.id, kind: "doc" });
    res.json({ ok: true });
  }));

  router.post("/letterhead", wrap(async (req, res) => {
    const c = req.body.company || {};
    const doc = {};
    for (const k of Object.keys(M.COMPANY)) doc[k] = String(c[k] == null ? "" : c[k]).trim().slice(0, 200) || M.COMPANY[k];
    await Proposal.findOneAndUpdate({ kind: "letterhead" }, { kind: "letterhead", doc }, { upsert: true });
    res.json({ ok: true, company: doc });
  }));

  router.post("/pdf", wrap(async (req, res) => {
    const d = await finished(req.body.doc);
    if (!d.items.length) return bad(res, "Add at least one line with a price.");
    const pdf = await renderProposalPdf(d);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${fileName(d)}"`);
    res.send(pdf);
  }));

  router.post("/email", wrap(async (req, res) => {
    const mailer = require("../services/mailer");
    const to = String(req.body.to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return bad(res, "Add the customer's email address.");
    const d = await finished(req.body.doc);
    if (!d.items.length) return bad(res, "Add at least one line with a price.");
    if (!mailer.emailReady()) return bad(res, "Email isn't set up on the server yet. Download the PDF and send it yourself for now.", 503);
    const pdf = await renderProposalPdf(d);
    const kind = M.TYPES[d.type];
    const who = d.customer.contact || d.customer.company || "there";
    const note = String(req.body.message || "").trim().slice(0, 2000);
    const t = d.totals;
    const text = [
      `Hello ${who},`, "",
      note || `Attached is our ${kind.toLowerCase()} ${d.number} for ${d.jobsite || d.title || "your project"}.`, "",
      `Total: ${M.money(t.totalCents)}${d.payments.length ? `\nBalance due: ${M.money(t.balanceCents)}` : ""}`, "",
      d.type === "invoice" ? "Thank you for your business." : "To accept, sign the attached page and reply to this email or fax it back.", "",
      d.company.name, [d.company.office && `Office ${d.company.office}`, d.company.cell && `Cell ${d.company.cell}`, d.company.fax && `Fax ${d.company.fax}`].filter(Boolean).join("  |  "),
    ].join("\n");
    const ok = await mailer.sendEmail(to, `${d.company.name} ${kind} ${d.number}`, text, {
      fromName: d.company.name,
      replyTo: req.owner.owner_email || d.company.email,
      attachments: [{ filename: fileName(d), content: pdf, contentType: "application/pdf" }],
    });
    if (!ok) return bad(res, "The email didn't go through. Download the PDF and send it yourself, or try again.", 502);
    res.json({ ok: true, sentTo: to });
  }));

  router.post("/writeup", wrap(async (req, res) => {
    const notes = String(req.body.notes || "").trim().slice(0, 1500);
    const lines = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => String((i && i.desc) || "").trim().slice(0, 300)).filter(Boolean).slice(0, 30);
    if (!notes && !lines.length) return bad(res, "Type a few words about the job first.");
    const type = M.TYPES[req.body.type] ? req.body.type : "proposal";
    const out = await aiWriteup(type, notes, lines).catch((e) => { console.error("[newark proposal] writeup:", e.message); return null; });
    res.json({ ok: true, ...(out || plainWriteup(notes, lines)), ai: !!out });
  }));

  return router;
};

// ---------- AI write-up: words only, never numbers ----------
const SYS = (type) => `You write the heading and scope paragraph for a ${M.TYPES[type].toLowerCase()} from New Ark, a New Jersey plumbing, heating, air conditioning and fire sprinkler contractor.
Use only the facts the owner gives you. Do not add work, materials, brands, code sections, warranties, schedules or promises he did not mention.
Never write any price, dollar amount, total, percentage or payment term. Money is handled elsewhere.
Plain, professional contractor wording. No sales talk.
Reply with JSON only: {"title": "<one line, under 15 words>", "scope": "<2 to 4 sentences>"}`;

function scrub(s, n) {
  return String(s || "").replace(/\$\s?[\d,]+(\.\d+)?/g, "").replace(/\b\d[\d,]*\.\d{2}\b/g, "").replace(/\s{2,}/g, " ").trim().slice(0, n);
}
async function aiWriteup(type, notes, lines) {
  const user = `Owner's notes: ${notes || "(none)"}\nLine items: ${lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join("; ") : "(none)"}`;
  const tries = [];
  if (process.env.CHAT_BASE_URL && process.env.CHAT_MODEL) {
    for (const model of String(process.env.CHAT_MODEL).split(",").map((m) => m.trim()).filter(Boolean))
      tries.push(() => axios.post(`${process.env.CHAT_BASE_URL.replace(/\/+$/, "")}/chat/completions`, { model, max_tokens: 500, temperature: 0.2, messages: [{ role: "system", content: SYS(type) }, { role: "user", content: user }] },
        { headers: process.env.CHAT_API_KEY ? { ...JSON_TYPE, Authorization: `Bearer ${process.env.CHAT_API_KEY}` } : JSON_TYPE, timeout: 25000 }).then((r) => r.data.choices[0].message.content));
  }
  if (process.env.ANTHROPIC_API_KEY)
    tries.push(() => axios.post("https://api.anthropic.com/v1/messages", { model: process.env.NEWARK_CHAT_MODEL || "claude-haiku-4-5", max_tokens: 500, system: SYS(type), messages: [{ role: "user", content: user }] },
      { headers: { ...JSON_TYPE, "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, timeout: 25000 }).then((r) => (r.data.content || []).map((b) => b.text || "").join("")));
  for (const t of tries) {
    try {
      const raw = String(await t());
      const j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
      const title = scrub(j.title, 160), scope = scrub(j.scope, 1200);
      if (title || scope) return { title, scope };
    } catch (e) { console.error("[newark proposal] ai engine failed:", e.response ? e.response.status : e.message); }
  }
  return null;
}
// No AI available: a clean write-up straight from his own words.
function plainWriteup(notes, lines) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const title = cap(scrub(notes.split(/[.\n]/)[0] || lines[0] || "", 160));
  const scope = lines.length ? `Work includes: ${lines.map((l) => l.replace(/\.$/, "")).join("; ")}.` : cap(scrub(notes, 1200));
  return { title, scope };
}
