/**
 * New Ark (first CallTwin client) glue between the phone line and the client portal.
 *
 *   POST /api/newark/notify     text the owner (SignalWire SMS). Auth: x-newark-key header.
 *   POST /api/newark/voicemail  SignalWire <Record> callback -> saves a job ticket in the portal.
 *   helpers used by routes/inbound.js: ownerContact(), fallbackXml()
 *
 * Env: NEWARK_HOOK_KEY (shared with the Supabase "newark" function),
 *      NEWARK_API (defaults to the Supabase function URL),
 *      SIGNALWIRE_PROJECT_ID / SIGNALWIRE_API_TOKEN / SIGNALWIRE_SPACE / SIGNALWIRE_PHONE_NUMBER.
 */
const express = require("express");
const axios = require("axios");

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: false }));

const NEWARK_API = process.env.NEWARK_API || "https://lsxdlmrjrcivxwgfkpop.supabase.co/functions/v1/newark";
const hookKey = () => process.env.NEWARK_HOOK_KEY || "";
const space = () => (process.env.SIGNALWIRE_SPACE || process.env.SIGNALWIRE_SPACE_URL || "")
  .trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
const e164 = (n) => {
  const d = String(n || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return null;
};
const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

function smsReady() {
  return !!(process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN && space() && process.env.SIGNALWIRE_PHONE_NUMBER);
}

async function sendSms(to, body) {
  if (!smsReady()) throw new Error("SignalWire SMS not configured");
  const pid = process.env.SIGNALWIRE_PROJECT_ID;
  const url = `https://${space()}/api/laml/2010-04-01/Accounts/${pid}/Messages.json`;
  const form = new URLSearchParams({ From: e164(process.env.SIGNALWIRE_PHONE_NUMBER), To: to, Body: body });
  const r = await axios.post(url, form.toString(), {
    auth: { username: pid, password: process.env.SIGNALWIRE_API_TOKEN },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });
  return r.data && r.data.sid;
}

// Owner's cell + whether the AI is switched on, from the client portal. Cached 60s.
let cache = { at: 0, data: null };
async function ownerContact() {
  if (!hookKey()) return null;
  if (cache.data && Date.now() - cache.at < 60000) return cache.data;
  try {
    const r = await axios.post(NEWARK_API, { a: "owner_contact" }, { headers: { "x-newark-key": hookKey() }, timeout: 5000 });
    cache = { at: Date.now(), data: r.data };
    return r.data;
  } catch (e) {
    console.error("[newark] owner_contact failed:", e.message);
    return cache.data;
  }
}

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "https://calltwin.onrender.com").replace(/\/$/, "");
}

// When the AI can't take the call: ring the owner's cell, then take a voicemail that lands in the portal.
function fallbackXml(ownerCell, callerId) {
  const vm =
    `<Say voice="Polly.Matthew">Thanks for calling New Ark. Please leave your name, your number, the address, and what you need after the tone. We will call you right back.</Say>` +
    `<Record maxLength="180" playBeep="true" action="${xml(baseUrl() + "/api/newark/voicemail")}" method="POST" />` +
    `<Say voice="Polly.Matthew">Thank you. Goodbye.</Say><Hangup/>`;
  const dial = ownerCell
    ? `<Dial timeout="20" answerOnBridge="true"${callerId ? ` callerId="${xml(callerId)}"` : ""}>${xml(ownerCell)}</Dial>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${dial}${vm}</Response>`;
}

router.post("/notify", async (req, res) => {
  if (!hookKey() || req.get("x-newark-key") !== hookKey()) return res.status(401).json({ ok: false, error: "unauthorized" });
  const to = e164(req.body && req.body.to);
  const body = String((req.body && req.body.body) || "").slice(0, 1400);
  if (!to || !body) return res.status(400).json({ ok: false, error: "to and body required" });
  try {
    const sid = await sendSms(to, body);
    res.json({ ok: true, sid });
  } catch (e) {
    const detail = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message;
    console.error("[newark] sms failed:", detail);
    res.status(502).json({ ok: false, error: detail });
  }
});

router.post("/voicemail", async (req, res) => {
  const p = { ...req.query, ...req.body };
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">Got it. We will call you back shortly. Goodbye.</Say><Hangup/></Response>`);
  if (!p.RecordingUrl || !hookKey()) return;
  try {
    await axios.post(NEWARK_API, {
      name: "Voicemail caller",
      phone: p.From || "",
      service: "Other",
      urgency: "Within 48 hours",
      summary: `Voicemail (${p.RecordingDuration || "?"}s). Listen: ${p.RecordingUrl}.mp3`,
      details: `Left a voicemail from ${p.From || "unknown number"}. Recording: ${p.RecordingUrl}.mp3`,
      conversation_id: p.CallSid || null,
    }, { headers: { "x-newark-key": hookKey() }, timeout: 8000 });
  } catch (e) {
    console.error("[newark] voicemail save failed:", e.message);
  }
});

router.get("/status", async (req, res) => {
  const oc = await ownerContact();
  res.json({
    hook_key: !!hookKey(),
    sms_ready: smsReady(),
    elevenlabs_key: !!process.env.ELEVENLABS_API_KEY,
    owner_on_file: !!(oc && oc.owner_cell),
    ai_enabled: oc ? oc.ai_enabled : null,
  });
});

module.exports = { router, ownerContact, fallbackXml };
