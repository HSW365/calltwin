/**
 * Mail relay for the HSW365 Sales Autopilot (repo HSW365/iRUN, engine/sales.py).
 *
 * iRun runs on GitHub Actions but has no Gmail login of its own, so it sends and reads mail through the mailbox
 * this server already uses for CallTwin alerts (GMAIL_USER + GMAIL_APP_PASSWORD).
 *
 *   POST /api/relay/send    { to, subject, html, text, inReplyTo }  -> { ok, messageId }
 *   GET  /api/relay/inbox?days=3                                     -> { messages: [{ messageId, from, subject, date, text }] }
 *   GET  /api/relay/health                                           -> { ready, user }
 *
 * Auth: header x-relay-token must equal env RELAY_TOKEN. Without RELAY_TOKEN set, every call is refused.
 */
const express = require("express");
const crypto = require("crypto");

const router = express.Router();
router.use(express.json({ limit: "512kb" }));

const env = (k) => String(process.env[k] || "").trim();
const user = () => env("GMAIL_USER") || env("SMTP_USER");
const pass = () => (env("GMAIL_APP_PASSWORD") || env("SMTP_PASS")).replace(/\s+/g, "");

router.use((req, res, next) => {
  const want = env("RELAY_TOKEN"), got = String(req.get("x-relay-token") || "");
  if (!want) return res.status(503).json({ error: "relay off" });
  const a = Buffer.from(want), b = Buffer.from(got);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "unauthorized" });
  next();
});

let transport = null, transportKey = "";
function smtp() {
  const key = user() + "|" + pass().length;
  if (!transport || transportKey !== key) {
    transport = require("nodemailer").createTransport({
      host: env("SMTP_HOST") || "smtp.gmail.com", port: Number(env("SMTP_PORT") || 465), secure: true,
      auth: { user: user(), pass: pass() }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    transportKey = key;
  }
  return transport;
}

router.get("/health", (req, res) => res.json({ ready: !!(user() && pass()), user: user() }));

router.post("/send", async (req, res) => {
  const { to, subject, html, text, inReplyTo, fromName } = req.body || {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || "")) || !subject || !(html || text)) {
    return res.status(400).json({ error: "to, subject and html or text are required" });
  }
  if (!user() || !pass()) return res.status(503).json({ error: "mailbox not configured on the server" });
  try {
    const headers = { "List-Unsubscribe": `<mailto:${user()}?subject=unsubscribe>` };
    const info = await smtp().sendMail({
      from: { name: String(fromName || "Elvin Torres Sr. | HSW365 Media").slice(0, 80), address: user() },
      to: String(to).trim(), subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 200),
      text: text ? String(text).slice(0, 50000) : undefined, html: html ? String(html).slice(0, 200000) : undefined,
      inReplyTo: inReplyTo || undefined, references: inReplyTo || undefined, headers,
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    const code = e.responseCode || 0;
    // 5xx about the recipient = bad address; anything else = mailbox/server problem the caller should stop on.
    const kind = code >= 550 && code < 560 && /recipient|user|mailbox|address/i.test(String(e.response || "")) ? "recipient" : "server";
    console.error("[relay] send failed:", code, String(e.message).slice(0, 200));
    res.status(kind === "recipient" ? 422 : 502).json({ error: String(e.response || e.message).slice(0, 300), kind });
  }
});

router.get("/inbox", async (req, res) => {
  if (!user() || !pass()) return res.status(503).json({ error: "mailbox not configured on the server" });
  const days = Math.min(Math.max(Number(req.query.days) || 3, 1), 14);
  const { ImapFlow } = require("imapflow");
  const { simpleParser } = require("mailparser");
  const client = new ImapFlow({ host: env("IMAP_HOST") || "imap.gmail.com", port: 993, secure: true,
    auth: { user: user(), pass: pass() }, logger: false });
  const out = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - days * 864e5);
      const uids = await client.search({ since }, { uid: true });
      for (const uid of (uids || []).slice(-300)) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const p = await simpleParser(msg.source);
        out.push({
          messageId: p.messageId || "", from: (p.from && p.from.value && p.from.value[0] && p.from.value[0].address) || "",
          subject: p.subject || "", date: p.date ? p.date.toISOString() : "",
          text: String(p.text || (p.html ? String(p.html).replace(/<[^>]+>/g, " ") : "")).slice(0, 8000),
        });
      }
    } finally { lock.release(); }
    await client.logout();
    res.json({ messages: out });
  } catch (e) {
    try { await client.logout(); } catch (_) {}
    console.error("[relay] inbox failed:", String(e.message).slice(0, 200));
    res.status(502).json({ error: String(e.message).slice(0, 300) });
  }
});

module.exports = { router };
