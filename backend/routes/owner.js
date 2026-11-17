/**
 * Shared "Owner sign in" for every HSW365 app.
 *
 *   POST /api/owner/code    { email }          emails a 6-digit code, only to an owner address
 *   POST /api/owner/verify  { email, code }    returns { ok, token } (12 hours)
 *   GET  /api/owner/me      Bearer token       returns { ok, email }
 *
 * Owner addresses: OWNER_EMAILS (comma list). Default: hsw365media@gmail.com, hoodstarent365@gmail.com.
 * Tokens are signed with JWT_SECRET (falls back to CALLTWIN_ADMIN_KEY). Codes live in memory, 10 minutes,
 * 5 tries, and a new code can be requested once every 30 seconds.
 */
const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../services/mailer");

const router = express.Router();
router.use(express.json());

const owners = () => String(process.env.OWNER_EMAILS || "hsw365media@gmail.com,hoodstarent365@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const secret = () => process.env.JWT_SECRET || process.env.CALLTWIN_ADMIN_KEY || "";
const codes = new Map(); // email -> { hash, exp, tries, sent }

router.use((req, res, next) => {
  const o = req.get("origin");
  if (o) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); }
  res.set("Access-Control-Allow-Headers", "content-type, authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const norm = (e) => String(e || "").trim().toLowerCase();
const hash = (e, c) => crypto.createHash("sha256").update(`${e}:${c}:${secret()}`).digest("hex");

router.post("/code", async (req, res) => {
  const email = norm(req.body && req.body.email);
  if (!secret()) return res.status(503).json({ ok: false, error: "Owner sign in is not set up on the server yet." });
  // Same answer whether or not the address is an owner, so nobody can probe the list.
  const generic = { ok: true, message: "If that email is an owner account, a code is on its way." };
  if (!owners().includes(email)) return res.json(generic);
  const prev = codes.get(email);
  if (prev && Date.now() - prev.sent < 30000) return res.status(429).json({ ok: false, error: "Wait 30 seconds, then ask for a new code." });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  codes.set(email, { hash: hash(email, code), exp: Date.now() + 10 * 60000, tries: 0, sent: Date.now() });
  const sent = await sendEmail(email, `Your HSW365 owner code: ${code}`,
    `Your owner sign in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email.`);
  if (!sent) return res.status(502).json({ ok: false, error: "The code email didn't send. Try again in a minute." });
  res.json(generic);
});

router.post("/verify", (req, res) => {
  const email = norm(req.body && req.body.email), code = String((req.body && req.body.code) || "").replace(/\D/g, "");
  const rec = codes.get(email);
  if (!rec || rec.exp < Date.now()) return res.status(401).json({ ok: false, error: "That code expired. Ask for a new one." });
  if (++rec.tries > 5) { codes.delete(email); return res.status(429).json({ ok: false, error: "Too many tries. Ask for a new code." }); }
  const a = Buffer.from(rec.hash), b = Buffer.from(hash(email, code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, error: "That code isn't right." });
  codes.delete(email);
  res.json({ ok: true, email, token: jwt.sign({ owner: true, email }, secret(), { expiresIn: "12h" }) });
});

router.get("/me", (req, res) => {
  try {
    const t = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const d = jwt.verify(t, secret());
    if (!d.owner || !owners().includes(norm(d.email))) throw new Error("not owner");
    res.json({ ok: true, email: d.email });
  } catch (_) { res.status(401).json({ ok: false }); }
});

module.exports = { router };
