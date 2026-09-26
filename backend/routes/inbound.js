/**
 * Inbound calls: SignalWire number rings -> ElevenLabs AI receptionist answers.
 *
 * SignalWire (LaML, Twilio-compatible) POSTs here when a client's CallTwin
 * number is called. We ask ElevenLabs to register the call against that
 * client's agent; ElevenLabs returns the LaML/TwiML that streams the call audio
 * to the agent. The agent's own tools save the job ticket to the client's portal.
 *
 * Number -> agent routing:
 *   INBOUND_AGENT_MAP  JSON, e.g. {"+18565943303":"agent_0801m3dq8s8hekkamghz1nx6s4tm"}
 *   INBOUND_DEFAULT_AGENT_ID  used when the dialed number isn't in the map
 */
const express = require("express");
const axios = require("axios");

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

const NEW_ARK_AGENT = "agent_0801m3dq8s8hekkamghz1nx6s4tm";

function agentFor(toNumber) {
  let map = {};
  try { map = JSON.parse(process.env.INBOUND_AGENT_MAP || "{}"); } catch (e) {
    console.error("[inbound] INBOUND_AGENT_MAP is not valid JSON:", e.message);
  }
  const digits = (n) => String(n || "").replace(/\D/g, "").slice(-10);
  for (const [num, agent] of Object.entries(map)) {
    if (digits(num) && digits(num) === digits(toNumber)) return agent;
  }
  return process.env.INBOUND_DEFAULT_AGENT_ID || NEW_ARK_AGENT;
}

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
function fallback(res, why) {
  console.error("[inbound] falling back:", why);
  res.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Joanna">Thanks for calling. We're connecting you to our team. Please leave your name, number, and what you need after the tone, and we'll call you right back.</Say>` +
    `<Record maxLength="120" playBeep="true" />` +
    `<Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/></Response>`
  );
}

async function handleInbound(req, res) {
  const p = { ...req.query, ...req.body };
  const from = p.From || "";
  const to = p.To || process.env.SIGNALWIRE_PHONE_NUMBER || "";
  const agentId = agentFor(to);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  console.log(`[inbound] call ${p.CallSid || "?"} from ${from} to ${to} -> ${agentId}`);
  if (!apiKey) return fallback(res, "ELEVENLABS_API_KEY not set");

  try {
    const r = await axios.post(
      "https://api.elevenlabs.io/v1/convai/twilio/register-call",
      { agent_id: agentId, from_number: from, to_number: to, direction: "inbound" },
      { headers: { "xi-api-key": apiKey, "Content-Type": "application/json" }, timeout: 8000, responseType: "text" }
    );
    const twiml = typeof r.data === "string" ? r.data : String(r.data);
    if (!twiml.includes("<Response")) return fallback(res, "unexpected register-call body: " + twiml.slice(0, 200));
    res.type("text/xml").send(twiml);
  } catch (e) {
    const detail = e.response ? `${e.response.status} ${String(e.response.data).slice(0, 300)}` : e.message;
    fallback(res, "register-call failed: " + detail);
  }
}

router.post("/voice", handleInbound);
router.get("/voice", handleInbound);

// Quick check in a browser: which agent a number routes to, and whether keys are present.
router.get("/status", async (req, res) => {
  if (req.query.refresh === "1") await ensureInboundRouting().catch(() => {});
  const to = req.query.to || process.env.SIGNALWIRE_PHONE_NUMBER || "";
  res.json({
    number: to,
    agent: agentFor(to),
    elevenlabs_key: !!process.env.ELEVENLABS_API_KEY,
    signalwire: !!(process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN && (process.env.SIGNALWIRE_SPACE || process.env.SIGNALWIRE_SPACE_URL)),
    voice_url: (process.env.PUBLIC_BASE_URL || "") + "/api/inbound/voice",
    routing: routingState,
  });
});

/**
 * On boot, point the CallTwin SignalWire number(s) at /api/inbound/voice so
 * inbound calls reach the AI receptionist. Idempotent; never crashes the server.
 */
let routingState = { done: false };
async function ensureInboundRouting() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const token = process.env.SIGNALWIRE_API_TOKEN;
  const space = (process.env.SIGNALWIRE_SPACE || process.env.SIGNALWIRE_SPACE_URL || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const base = (process.env.PUBLIC_BASE_URL || "https://calltwin.onrender.com").replace(/\/$/, "");
  if (!projectId || !token || !space) { routingState = { done: false, error: "SignalWire env vars missing" }; return; }

  let numbers = [];
  try { numbers = Object.keys(JSON.parse(process.env.INBOUND_AGENT_MAP || "{}")); } catch (_) {}
  if (process.env.SIGNALWIRE_PHONE_NUMBER) numbers.push(process.env.SIGNALWIRE_PHONE_NUMBER);
  if (!numbers.length) numbers.push("+18565943303");
  const want = `${base}/api/inbound/voice`;
  const api = `https://${space}/api/laml/2010-04-01/Accounts/${projectId}/IncomingPhoneNumbers`;
  const auth = { username: projectId, password: token };
  const results = [];

  for (const raw of [...new Set(numbers)]) {
    const e164 = "+1" + String(raw).replace(/\D/g, "").slice(-10);
    try {
      const list = await axios.get(`${api}.json`, { auth, params: { PhoneNumber: e164 }, timeout: 10000 });
      const rec = (list.data.incoming_phone_numbers || [])[0];
      if (!rec) { results.push({ number: e164, ok: false, error: "number not found in SignalWire project" }); continue; }
      if (rec.voice_url === want && (rec.voice_method || "POST").toUpperCase() === "POST") {
        results.push({ number: e164, ok: true, changed: false }); continue;
      }
      await axios.post(`${api}/${rec.sid}.json`, new URLSearchParams({ VoiceUrl: want, VoiceMethod: "POST" }).toString(),
        { auth, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 });
      results.push({ number: e164, ok: true, changed: true });
    } catch (e) {
      const detail = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message;
      results.push({ number: e164, ok: false, error: detail });
    }
  }
  routingState = { done: results.every((r) => r.ok), at: new Date().toISOString(), voice_url: want, results };
  console.log("[inbound] routing:", JSON.stringify(routingState));
}

module.exports = { router, ensureInboundRouting };
