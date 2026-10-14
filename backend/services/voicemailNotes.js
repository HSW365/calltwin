/**
 * Voicemail -> job ticket.
 *
 * Downloads the recording, writes it out as text (Whisper on the same OpenAI-compatible server the website
 * chat uses, e.g. Groq's free plan), then pulls out the caller's name, callback number, address and the
 * service they need, so the owner's alert reads like a job ticket instead of "listen to this link".
 *
 * Config (all optional, falls back to the chat settings):
 *   STT_BASE_URL / STT_API_KEY / STT_MODEL   speech-to-text server (default: CHAT_BASE_URL / CHAT_API_KEY / whisper-large-v3-turbo)
 *   CHAT_BASE_URL / CHAT_API_KEY / CHAT_MODEL  model used to pull the fields out of the transcript
 *
 * Uses fetch (not axios) on purpose: the SignalWire library rewrites axios's default POST encoding.
 * Never throws: on any failure it returns what it has (possibly nothing) and the caller sends the plain alert.
 */
const STT_BASE = () => (process.env.STT_BASE_URL || process.env.CHAT_BASE_URL || "").replace(/\/+$/, "");
const STT_KEY = () => process.env.STT_API_KEY || process.env.CHAT_API_KEY || "";
const STT_MODEL = () => process.env.STT_MODEL || "whisper-large-v3-turbo";
const LLM_BASE = () => (process.env.CHAT_BASE_URL || "").replace(/\/+$/, "");
const LLM_MODELS = () => String(process.env.CHAT_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (v, n) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, n));

function ready() { return !!(STT_BASE() && STT_KEY()); }

/** Fetch the recording. SignalWire can take a moment to finish it, and some spaces require the project login. */
async function download(url) {
  const auth = process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN
    ? "Basic " + Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString("base64")
    : null;
  for (let i = 0; i < 4; i++) {
    for (const headers of [{}, auth ? { Authorization: auth } : null].filter(Boolean)) {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 1000) return buf;
        }
      } catch (_) { /* try again */ }
    }
    await sleep(2000 * (i + 1));
  }
  return null;
}

async function transcribe(buf) {
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/mpeg" }), "voicemail.mp3");
  form.append("model", STT_MODEL());
  form.append("language", "en");
  form.append("response_format", "json");
  const r = await fetch(`${STT_BASE()}/audio/transcriptions`, {
    method: "POST", headers: { Authorization: `Bearer ${STT_KEY()}` }, body: form, signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`transcribe ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return clip(j.text, 4000);
}

const EXTRACT = `You turn a voicemail left for a home-service business (plumbing, heating, air conditioning) into a job ticket.
Return ONLY a JSON object with these keys:
"name": caller's name as they said it, or "".
"phone": callback number they said, digits only, or "".
"address": service address or town they said, or "".
"service": what they need in a few plain words (e.g. "Water heater leaking"), or "".
"urgent": true only if they say it's an emergency, flooding, no heat, or ASAP.
Use only what is in the voicemail. Never guess or make anything up; leave a key "" if it wasn't said.`;

async function extract(transcript) {
  if (!LLM_BASE() || !LLM_MODELS().length) return {};
  for (const model of LLM_MODELS()) {
    try {
      const r = await fetch(`${LLM_BASE()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.CHAT_API_KEY ? { Authorization: `Bearer ${process.env.CHAT_API_KEY}` } : {}) },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: 300, response_format: { type: "json_object" },
          messages: [{ role: "system", content: EXTRACT }, { role: "user", content: `Voicemail:\n${transcript}` }],
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const raw = String(j.choices?.[0]?.message?.content || "");
      const o = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      return {
        name: clip(o.name, 80),
        phone: clip(o.phone, 20).replace(/\D/g, "").slice(-10),
        address: clip(o.address, 200),
        service: clip(o.service, 160),
        urgent: o.urgent === true,
      };
    } catch (_) { /* next model */ }
  }
  return {};
}

/** Returns { transcript, name, phone, address, service, urgent } — any field may be empty. */
async function notesFor(recordingUrl) {
  if (!ready() || !recordingUrl) return {};
  try {
    const buf = await download(/\.(mp3|wav)$/i.test(recordingUrl) ? recordingUrl : recordingUrl + ".mp3");
    if (!buf) { console.error("[voicemail] recording download failed"); return {}; }
    const transcript = await transcribe(buf);
    if (!transcript) return {};
    return { transcript, ...(await extract(transcript)) };
  } catch (e) {
    console.error("[voicemail] notes failed:", e.message);
    return {};
  }
}

const fmtPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(p || "");
};

/** The owner alert: job ticket first, recording link last. First line is the email subject. */
function alertText(business, from, recordingUrl, n = {}) {
  const phone = fmtPhone(n.phone || from) || "unknown";
  const lines = [
    `${n.urgent ? "EMERGENCY: " : ""}New job for ${business}: ${n.service || "voicemail"}`,
    `Name: ${n.name || "not given"}`,
    `Phone: ${phone}`,
    `Address: ${n.address || "not given"}`,
    `Service needed: ${n.service || "not given"}`,
  ];
  if (n.phone && from && fmtPhone(n.phone) !== fmtPhone(from)) lines.push(`Called from: ${fmtPhone(from)}`);
  if (n.transcript) lines.push(`They said: "${clip(n.transcript, 600)}"`);
  lines.push(`Listen: ${recordingUrl}.mp3`);
  const tel = String(n.phone || from || "").replace(/\D/g, "").slice(-10);
  if (tel.length === 10) lines.push(`Call back: tel:${tel}`);
  return lines.join("\n");
}

module.exports = { notesFor, alertText, ready, fmtPhone };
