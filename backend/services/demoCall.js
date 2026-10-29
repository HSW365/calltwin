/**
 * "Get your AI call FREE" — opt-in demo calls for CallTwin + QUEENEE.
 *
 * A business owner fills in the form (name, business, website, cell, consent). Within seconds the AI calls
 * that number, plays the receptionist for THEIR business (built from their website), then steps out and
 * pitches CallTwin and QUEENEE. After the call they get an email with the sign-up links and the owner gets
 * a summary + transcript.
 *
 * Only ever calls a number whose owner just asked for the call (TCPA: AI voice = artificial voice; prior
 * express written consent is required). There is no list-dialing path in here on purpose.
 *
 * Env (all optional except the SignalWire ones the rest of CallTwin already uses):
 *   DEMO_FROM_NUMBER      number the demo calls come from (default SIGNALWIRE_PHONE_NUMBER)
 *   DEMO_VOICE            SignalWire <Say> voice (default Polly.Matthew-Neural)
 *   DEMO_DAILY_CAP        max demo calls per day across everyone (default 60) — keeps the bill in check
 *   DEMO_OWNER_EMAIL      where call summaries go (default hsw365media@gmail.com)
 *   DEMO_SIGNUP_URL       CallTwin sign-up link (default https://hsw365.github.io/calltwin/signup.html)
 *   DEMO_QUEENEE_URL      QUEENEE link (default https://hsw365.github.io/queenee/)
 *   AI: CHAT_BASE_URL + CHAT_API_KEY + CHAT_MODEL (Groq etc.), else ANTHROPIC_API_KEY, else OPENAI_API_KEY.
 */
const axios = require("axios");
const dns = require("dns").promises;
const net = require("net");
const { RestClient } = require("@signalwire/compatibility-api");
const DemoCall = require("../models/DemoCall");
const { sendEmail } = require("./mailer");

const env = (k, d = "") => String(process.env[k] || d).trim();
const SPACE = () => env("SIGNALWIRE_SPACE", env("SIGNALWIRE_SPACE_URL")).replace(/^https?:\/\//, "").replace(/\/$/, "");
const BASE = () => env("PUBLIC_BASE_URL", "https://calltwin.onrender.com").replace(/\/$/, "");
const FROM = () => env("DEMO_FROM_NUMBER", env("SIGNALWIRE_PHONE_NUMBER"));
const VOICE = () => env("DEMO_VOICE", "Polly.Matthew-Neural");
const SIGNUP_URL = () => env("DEMO_SIGNUP_URL", "https://hsw365.github.io/calltwin/signup.html");
const QUEENEE_URL = () => env("DEMO_QUEENEE_URL", "https://hsw365.github.io/queenee/");
const MAX_TURNS = 14;

const CONSENT_TEXT = "By tapping Call me now, I agree that HSW365 Media (CallTwin) may call me at the number above "
  + "using an AI-generated voice, now and to follow up about CallTwin and QUEENEE. Consent is not a condition of "
  + "any purchase. I can say \"stop\" on any call or reply STOP to opt out.";

let client;
function sw() {
  if (client) return client;
  const p = env("SIGNALWIRE_PROJECT_ID"), t = env("SIGNALWIRE_API_TOKEN");
  if (!p || !t || !SPACE()) throw new Error("SignalWire is not configured.");
  client = RestClient(p, t, { signalwireSpaceUrl: SPACE() });
  return client;
}

/* ---------------- input ---------------- */

function toE164(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 && /^[2-9]\d{2}[2-9]/.test(d)) return "+1" + d;
  if (d.length === 11 && d[0] === "1" && /^[2-9]\d{2}[2-9]/.test(d.slice(1))) return "+" + d;
  return null;
}

function cleanUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.toString() : ""; } catch (e) { return ""; }
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^(::1|::|f[cd]|fe80)/i.test(ip);
}

// Read the business's own site so the demo receptionist sounds like it works there.
async function readSite(url) {
  if (!url) return "";
  try {
    const host = new URL(url).hostname;
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return "";
    const r = await axios.get(url, {
      timeout: 8000, maxContentLength: 2_000_000, maxRedirects: 3, responseType: "text",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CallTwinDemo/1.0)", Accept: "text/html" },
    });
    const html = String(r.data || "");
    const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || "";
    const body = html
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ")
      .replace(/\s+/g, " ").trim();
    return [title, desc, body].filter(Boolean).join("\n").slice(0, 5000);
  } catch (e) {
    return "";
  }
}

/* ---------------- limits ---------------- */

const ipHits = new Map();
function ipLimited(ip) {
  const now = Date.now(), win = 60 * 60 * 1000;
  const list = (ipHits.get(ip) || []).filter((t) => now - t < win);
  list.push(now); ipHits.set(ip, list);
  if (ipHits.size > 5000) for (const [k, v] of ipHits) if (!v.length || now - v[v.length - 1] > win) ipHits.delete(k);
  return list.length > 3;
}

async function overLimits(phone) {
  const day = new Date(Date.now() - 24 * 3600 * 1000);
  if (await DemoCall.exists({ phone, optedOut: true })) return "That number asked not to be called.";
  if (await DemoCall.countDocuments({ phone, createdAt: { $gt: day } }) >= 2) return "We already called that number today. Check your email for the links.";
  if (await DemoCall.countDocuments({ createdAt: { $gt: day } }) >= Number(env("DEMO_DAILY_CAP", "60"))) return "Demo calls are full for today. Leave your email and we'll call tomorrow.";
  return null;
}

/* ---------------- request → call ---------------- */

async function requestDemo(body, meta) {
  const name = String(body.name || "").trim().slice(0, 80);
  const business = String(body.business || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().slice(0, 160);
  const phone = toE164(body.phone);
  const website = cleanUrl(body.website);
  if (body.company_url_2) return { ok: true };                                // honeypot: bots get a silent "ok"
  if (!name || !business) return { ok: false, error: "Enter your name and your business name." };
  if (!phone) return { ok: false, error: "Enter a 10-digit US phone number." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
  if (body.consent !== true && body.consent !== "true" && body.consent !== "on") return { ok: false, error: "Check the box so we're allowed to call you." };
  if (ipLimited(meta.ip)) return { ok: false, error: "Too many requests. Try again in an hour." };
  const limit = await overLimits(phone);
  if (limit) return { ok: false, error: limit };

  const doc = await DemoCall.create({
    name, business, website, phone, email, consentText: CONSENT_TEXT, consentAt: new Date(),
    ip: meta.ip, userAgent: String(meta.ua || "").slice(0, 300),
  });

  // Read the site and dial in the background so the page answers right away.
  (async () => {
    try {
      doc.siteText = await readSite(website);
      const call = await sw().calls.create({
        to: phone, from: FROM(),
        url: `${BASE()}/api/demo-call/answer?id=${doc._id}`,
        statusCallback: `${BASE()}/api/demo-call/status?id=${doc._id}`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        timeout: 30,
        machineDetection: "Enable",
      });
      doc.callSid = call.sid; doc.status = "calling";
      await doc.save();
    } catch (e) {
      doc.status = "failed"; doc.error = String(e.message || e).slice(0, 300);
      await doc.save().catch(() => {});
      console.error("[demo-call] dial failed:", doc.error);
    }
  })();

  return { ok: true, id: String(doc._id) };
}

/* ---------------- the conversation ---------------- */

function systemPrompt(d) {
  const site = d.siteText ? `\n\nWHAT THEIR WEBSITE SAYS (use it as the business's own facts):\n${d.siteText}` : "\n\n(No website text was available. Keep business details general and don't invent prices, hours or addresses.)";
  return `You are the CallTwin demo agent from HSW365 Media, on a live phone call that ${d.name} just requested from our website. Every reply is spoken aloud, so:
- 1 to 3 short sentences. Plain words. No lists, no emojis, no markdown, no URLs read out.
- You are an AI. Say so if asked. Never pretend to be a person.

THE CALL HAS TWO PARTS.

PART 1 — THE DEMO (most of the call). You are the AI receptionist for "${d.business}". ${d.name} plays a customer calling the business. Answer like that business's front desk: friendly, confident, using the website facts below. When the "customer" describes a job, collect their name, callback number and the job, then confirm "I've sent that to the owner." Never invent prices, licenses or promises the website doesn't state; say the owner will confirm.

PART 2 — THE PITCH. After the demo exchange (or if ${d.name} asks what this is / how much / how it works), step out of the receptionist role: "That's exactly what your callers would hear, built from your website." Then briefly:
- CallTwin: answers the business line 24/7, never misses a call, texts and emails every job to the owner. They keep their own number and just forward it.
- QUEENEE: we also build the business a professional website, with CallTwin built in.
Don't quote prices; say the pricing and sign-up link are in the email we're sending right after this call. Ask if they want us to set it up. If yes, say "Great, I'm sending the sign-up link now" and add [SIGNUP] at the end of your reply.

RULES
- If they say stop, not interested, don't call, remove me, or are upset: apologize briefly, say we won't call again, and end with [STOP].
- When the conversation is clearly finished, say a short goodbye and end with [END].
- Never ask for card numbers, passwords or bank details.${site}`;
}

async function llm(d, userText) {
  const history = d.turns.map((t) => ({ role: t.role, content: t.content }));
  if (userText != null) history.push({ role: "user", content: userText || "(silence)" });
  const system = systemPrompt(d);
  const providers = [];
  if (env("CHAT_BASE_URL")) for (const model of env("CHAT_MODEL").split(",").map((s) => s.trim()).filter(Boolean)) providers.push({ kind: "oai", base: env("CHAT_BASE_URL"), key: env("CHAT_API_KEY"), model });
  if (env("ANTHROPIC_API_KEY")) providers.push({ kind: "anthropic" });
  if (env("OPENAI_API_KEY")) providers.push({ kind: "oai", base: "https://api.openai.com/v1", key: env("OPENAI_API_KEY"), model: env("DEMO_OPENAI_MODEL", "gpt-4.1-mini") });
  for (const p of providers) {
    try {
      if (p.kind === "anthropic") {
        const r = await axios.post("https://api.anthropic.com/v1/messages", {
          model: env("DEMO_ANTHROPIC_MODEL", "claude-haiku-4-5"), max_tokens: 220, system,
          messages: history.length ? history : [{ role: "user", content: "(call connected)" }],
        }, { headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" }, timeout: 12000 });
        const t = (r.data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
        if (t) return t;
      } else {
        const r = await axios.post(`${p.base.replace(/\/+$/, "")}/chat/completions`, {
          model: p.model, max_tokens: 220, temperature: 0.6,
          messages: [{ role: "system", content: system }, ...(history.length ? history : [{ role: "user", content: "(call connected)" }])],
        }, { headers: { "content-type": "application/json", ...(p.key ? { Authorization: `Bearer ${p.key}` } : {}) }, timeout: 12000 });
        const t = String(r.data.choices?.[0]?.message?.content || "").trim();
        if (t) return t;
      }
    } catch (e) {
      console.error("[demo-call] ai provider failed:", p.kind, p.model || "", e.response?.status || e.message);
    }
  }
  return "Sorry, I lost my train of thought for a second. CallTwin answers your business line around the clock and sends every job straight to you. I'll email you the details and the sign-up link right after this call. Thanks for trying it. [END]";
}

function speakable(t) {
  return String(t).replace(/\[(END|STOP|SIGNUP)\]/g, "").replace(/https?:\/\/\S+/g, "the link").replace(/[*_#>`]/g, "").replace(/\s+/g, " ").trim();
}

function laml(d, text, { end = false } = {}) {
  const r = new RestClient.LaML.VoiceResponse();
  const say = (node, t) => node.say({ voice: VOICE() }, t);
  if (end) { say(r, text); r.hangup(); return r.toString(); }
  const g = r.gather({ input: "speech", action: `${BASE()}/api/demo-call/turn?id=${d._id}`, method: "POST", speechTimeout: "auto", timeout: 6, language: "en-US" });
  say(g, text);
  r.redirect({ method: "POST" }, `${BASE()}/api/demo-call/turn?id=${d._id}&silent=1`);
  return r.toString();
}

async function answer(id, answeredBy) {
  const d = await DemoCall.findById(id);
  if (!d) { const r = new RestClient.LaML.VoiceResponse(); r.hangup(); return r.toString(); }
  if (/machine|fax/i.test(answeredBy || "")) {
    d.status = "voicemail"; await d.save();
    return laml(d, `Hi ${d.name}, this is the CallTwin AI demo you requested for ${d.business}. Sorry we missed you. We're emailing you the details now, and you can request another call any time from our website. Talk soon.`, { end: true });
  }
  d.status = "in-progress";
  const opener = `Hi ${d.name}! This is the CallTwin AI you just requested, and I'm an AI. I've already learned ${d.business}${d.siteText ? " from your website" : ""}. Let's try it: pretend you're a customer calling ${d.business}. Go ahead, ask me anything or tell me about a job.`;
  d.turns.push({ role: "assistant", content: opener });
  await d.save();
  return laml(d, opener);
}

async function turn(id, speech, silentFlag) {
  const d = await DemoCall.findById(id);
  if (!d) { const r = new RestClient.LaML.VoiceResponse(); r.hangup(); return r.toString(); }
  const said = String(speech || "").trim();
  if (!said) {
    d.silent += 1; await d.save();
    if (d.silent >= 2) return laml(d, "I'll let you go. I'm emailing you the details and the sign-up link now. Thanks for trying CallTwin!", { end: true });
    return laml(d, "Are you still there? Go ahead, ask me anything like a customer would.");
  }
  d.silent = 0;
  if (/\b(stop calling|do not call|don'?t call|remove me|take me off|unsubscribe)\b/i.test(said)) {
    d.turns.push({ role: "user", content: said });
    d.optedOut = true; await d.save();
    return laml(d, "Understood. I'm sorry for the trouble. We won't call this number again. Goodbye.", { end: true });
  }
  const userTurns = d.turns.filter((t) => t.role === "user").length;
  let reply = await llm(d, said);
  d.turns.push({ role: "user", content: said }, { role: "assistant", content: reply });
  if (/\[SIGNUP\]/.test(reply)) d.wantsSignup = true;
  if (/\[STOP\]/.test(reply)) d.optedOut = true;
  const end = /\[(END|STOP)\]/.test(reply) || userTurns + 1 >= MAX_TURNS;
  if (end && !/\[(END|STOP)\]/.test(reply)) reply += " I'm emailing you everything now. Thanks for trying CallTwin!";
  await d.save();
  return laml(d, speakable(reply), { end });
}

/* ---------------- after the call ---------------- */

async function status(id, body) {
  const d = await DemoCall.findById(id);
  if (!d) return;
  const s = String(body.CallStatus || "");
  if (s === "completed") { d.durationSec = Number(body.CallDuration || 0); if (d.status !== "voicemail") d.status = "completed"; }
  else if (["busy", "no-answer", "failed", "canceled"].includes(s)) d.status = s;
  else return;
  await d.save();
  await followUp(d).catch((e) => console.error("[demo-call] follow-up:", e.message));
}

function esc(s) { return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function followUp(d) {
  if (d.followUpSent) return;
  d.followUpSent = true; await d.save();
  const signup = SIGNUP_URL(), queenee = QUEENEE_URL();

  if (d.email && !d.optedOut) {
    const reached = d.status === "completed";
    const text = `${reached ? `Thanks for trying CallTwin, ${d.name}.` : `Hi ${d.name}, we tried calling but missed you.`}\n\n`
      + `What you ${reached ? "heard" : "would have heard"} is the receptionist CallTwin built for ${d.business}. It answers your line 24/7 and sends every job to your phone and email. Keep your number, just forward it.\n\n`
      + `Start CallTwin: ${signup}\nGet a website with CallTwin built in (QUEENEE): ${queenee}\n\n`
      + `Questions? Reply to this email.\n— HSW365 Media`;
    const html = `<div style="font-family:Inter,Arial,sans-serif;background:#0a0a0f;color:#e8e8ef;padding:32px"><div style="max-width:520px;margin:auto">
<div style="font-weight:900;letter-spacing:.08em;color:#22d3ee;font-size:13px">CALLTWIN · HSW365 MEDIA</div>
<h1 style="font-size:26px;margin:14px 0 10px;color:#fff">${reached ? `Thanks for trying CallTwin, ${esc(d.name)}.` : `We tried calling, ${esc(d.name)}.`}</h1>
<p style="line-height:1.6;color:#b9b9c6">${reached ? "What you heard" : "What you would have heard"} is the receptionist CallTwin built for <b style="color:#fff">${esc(d.business)}</b>. It answers your line around the clock and sends every job to your phone and email. You keep your number and just forward it.</p>
<a href="${signup}" style="display:block;text-align:center;background:#22d3ee;color:#0a0a0f;font-weight:800;padding:16px;border-radius:12px;text-decoration:none;margin:22px 0 10px">Start CallTwin</a>
<a href="${queenee}" style="display:block;text-align:center;border:1px solid #2a2a36;color:#fff;font-weight:700;padding:15px;border-radius:12px;text-decoration:none">Get a website with CallTwin built in</a>
<p style="color:#6f6f80;font-size:12px;margin-top:26px">You asked for this call at our website. Reply STOP and we won't contact you again.</p></div></div>`;
    await sendEmail(d.email, reached ? `Your CallTwin demo for ${d.business}` : `We missed you — your CallTwin demo for ${d.business}`, text, { html, fromName: "CallTwin by HSW365" });
  }

  const transcript = d.turns.map((t) => `${t.role === "assistant" ? "AI" : d.name}: ${t.content}`).join("\n");
  const flag = d.optedOut ? "OPTED OUT" : d.wantsSignup ? "🔥 WANTS TO SIGN UP" : d.status.toUpperCase();
  await sendEmail(env("DEMO_OWNER_EMAIL", "hsw365media@gmail.com"), `[Demo call] ${flag} — ${d.business} (${d.name})`,
    `${flag}\n\nName: ${d.name}\nBusiness: ${d.business}\nPhone: ${d.phone}\nEmail: ${d.email || "-"}\nWebsite: ${d.website || "-"}\nStatus: ${d.status}  Duration: ${d.durationSec}s\nConsent: ${d.consentAt.toISOString()} from ${d.ip}\n\n--- Transcript ---\n${transcript || "(no conversation)"}`,
    { fromName: "CallTwin Demo Calls" });
}

module.exports = { requestDemo, answer, turn, status, CONSENT_TEXT, toE164, cleanUrl, _setClient: (c) => { client = c; } };
