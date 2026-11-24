/**
 * HSW365 owner PIN session, checked on the server.
 *
 * The owner signs in on any HSW365 page with the PIN-only "Owner login" tab (owner-login.js v3). The page then sends the
 * signed session token it got back in the "x-hsw-owner" header (or body.ownerToken). This server never trusts a client
 * flag: every token is re-checked with the HSW365 owner-pin service ({a:"verify",token}). A positive answer is cached for
 * 5 minutes; a "no" is never cached. The owner session maps to the owner's own email (OWNER_EMAILS, first entry).
 */
const OWNER_PIN_URL = () => process.env.OWNER_PIN_URL || "https://lsxdlmrjrcivxwgfkpop.supabase.co/functions/v1/owner-pin";
const OWNER_EMAILS = () => String(process.env.OWNER_EMAILS || "hsw365media@gmail.com,hoodstarent365@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const ownerEmail = () => OWNER_EMAILS()[0] || "hsw365media@gmail.com";

const TTL = 5 * 60e3;
const cache = new Map(); // token -> expiry of the positive answer

/** Token from the request: x-hsw-owner header, or body.ownerToken. Shape "exp.sig". */
function tokenFrom(req) {
  const h = req && typeof req.get === "function" ? req.get("x-hsw-owner") : req && req.headers && req.headers["x-hsw-owner"];
  const t = String(h || (req && req.body && req.body.ownerToken) || "").trim();
  return /^[\x21-\x7e]{3,1024}$/.test(t) ? t : ""; // printable, no spaces (the service decides if it is real)
}

/** true only when the owner-pin service confirms the token right now (or did within the last 5 minutes). */
async function verifyToken(token) {
  token = String(token || "").trim();
  if (!token) return false;
  const exp = cache.get(token);
  if (exp && exp > Date.now()) return true;
  try {
    const r = await fetch(OWNER_PIN_URL(), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: "verify", token }), signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j && j.ok === true) {
      cache.set(token, Date.now() + TTL);
      if (cache.size > 500) for (const [k, v] of cache) if (v <= Date.now()) cache.delete(k);
      return true;
    }
  } catch (e) { console.error("[owner-pin] verify failed:", e.message); }
  cache.delete(token);
  return false;
}

/** Is this request signed in as the HSW365 owner? Sets req.hswOwner. */
async function isOwner(req) {
  if (req && req.hswOwner !== undefined) return req.hswOwner;
  const ok = await verifyToken(tokenFrom(req));
  if (req) req.hswOwner = ok;
  return ok;
}

/** Express middleware: 401 unless the request carries a verified owner token. */
async function requireOwner(req, res, next) {
  if (await isOwner(req)) return next();
  res.status(401).json({ ok: false, error: "Owner sign in needed. Use the Owner login tab." });
}

module.exports = { tokenFrom, verifyToken, isOwner, requireOwner, ownerEmail, OWNER_EMAILS, _cache: cache };
