/**
 * CallTwin Sign-Up Line: a phone number business owners call to sign up by voice.
 *
 * An ElevenLabs agent explains CallTwin, collects the business details one question at a time,
 * then calls create_calltwin_account (POST /api/clients/phone-signup). The owner gets a text with
 * the $500 setup payment link (or Zelle / Cash App instructions). Once setup is paid the normal
 * flow builds their receptionist and texts their number.
 *
 * Everything is created on boot and stored in Mongo (AppConfig "signup_line"); every step is
 * idempotent and resumable. SIGNUP_LINE_NUMBER (optional) uses a number you already own instead of buying one.
 */
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");

const EL = "https://api.elevenlabs.io/v1/convai";
const VOICE_ID = process.env.SIGNUP_LINE_VOICE_ID || process.env.CALLTWIN_VOICE_ID || "nPczCjzI2devNBz1zQrb";
const base = () => (process.env.PUBLIC_BASE_URL || "https://calltwin.onrender.com").replace(/\/$/, "");
const elHeaders = () => ({ "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" });
const errText = (e) => (e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message);
const last10 = (n) => String(n || "").replace(/\D/g, "").slice(-10);

const AppConfig = mongoose.models.AppConfig || mongoose.model("AppConfig", new mongoose.Schema(
  { key: { type: String, required: true, unique: true }, value: { type: mongoose.Schema.Types.Mixed, default: {} } },
  { timestamps: true }
));

const KEY = "signup_line";
let cache = null;
async function getCfg() {
  const doc = await AppConfig.findOne({ key: KEY });
  cache = (doc && doc.value) || {};
  return cache;
}
async function saveCfg(cfg) {
  await AppConfig.updateOne({ key: KEY }, { $set: { value: cfg } }, { upsert: true });
  cache = cfg;
}

function pricing() {
  const setup = Number(process.env.CALLTWIN_SETUP_CENTS || 50000) / 100;
  const monthly = Number(process.env.CALLTWIN_PRICE_CENTS || 9900) / 100;
  const days = Number(process.env.CALLTWIN_TRIAL_DAYS || 14);
  const est = Number(process.env.ESTIMATE_ADDON_PRICE_CENTS || 4900) / 100;
  return { setup, monthly, days, est };
}

function prompt() {
  const p = pricing();
  return `# Role
You answer the CallTwin sign-up line for HSW365 Media. Callers are small business owners (plumbers, HVAC, electricians, cleaners, contractors, salons, and similar). Many are not comfortable with technology. Your job: explain CallTwin simply, and if they want it, sign them up right on this call. Sound like a patient, friendly person at a front desk. Short sentences. One question at a time. Never rush them.

# What CallTwin is
- An AI receptionist that answers the business's phone 24 hours a day, 7 days a week, in English or Spanish.
- It takes the caller's name, number, address and what they need, and texts the job to the owner right away.
- The owner keeps their same business number. They forward it to their CallTwin number by dialing star 7 2 and the number from their business phone. We text them a button that does it for them.
- Optional add-on: AI Estimates. Every call turns into a draft estimate priced from the owner's own prices, and customers can sign and pay a deposit from their phone. ${p.est} dollars a month, with a free trial. They can turn it on later from their dashboard.

# Price (say it plainly if asked, never change it, never discount)
- ${p.setup} dollars one-time setup, paid first.
- Then the first ${p.days} days of service are free.
- Then ${p.monthly} dollars a month. No contract. They can cancel the monthly anytime by text or email.
- They can pay by card (secure link we text them), Zelle, or Cash App.
- NEVER take card numbers, bank numbers or passwords over the phone. If they try to read a card number, stop them politely and say the text link is the safe way.

# Signing them up
When they want to go ahead, collect these, one at a time:
1. Business name.
2. Their first and last name.
3. Their cell phone number for texts. Read it back digit by digit and confirm it. If they say "this number", use the number they are calling from: {{system__caller_id}}. Confirm it out loud.
4. The business phone number customers call now, if different from the cell.
5. Type of business and the town or area they serve.
6. What services they offer, in their own words (a sentence or two is fine).
7. Business hours, and whether they take emergency calls.
8. Email, only if they have one. Spell it back letter by letter. If they don't have one or don't want to give it, that's fine; skip it.
9. How they want to pay: card, Zelle, or Cash App.
Then read back a short summary (business name, their name, cell, payment method) and ask "Is that all correct?"
When they confirm, call create_calltwin_account once. Then tell them what the tool's result says will happen next, in simple words.

# If they are not ready
- If they want to think about it, or want someone to walk them through it in person, call send_info_and_callback. It texts them the sign-up link and tells Elvin at HSW365 to call them back. Tell them Elvin will call them.
- If they want to do it themselves online, also use send_info_and_callback.

# Rules
- If asked whether you are a person: say you're CallTwin's AI assistant, the same kind of assistant their customers would talk to.
- Don't invent features, prices, promises or dates. If you don't know, say Elvin will follow up and use send_info_and_callback.
- If they speak Spanish, continue in Spanish.
- Keep each reply to one or two short sentences.
- End politely when they're done.`;
}

function tools(cfg) {
  const hdr = { "x-signup-key": cfg.hookKey };
  return [
    {
      name: "create_calltwin_account",
      description: "Create the caller's CallTwin account after they confirmed the details. Texts them how to pay the setup fee.",
      url: `${base()}/api/clients/phone-signup`,
      required: ["business_name", "owner_name", "owner_cell", "pay_method"],
      properties: {
        business_name: { type: "string", description: "Business name" },
        owner_name: { type: "string", description: "Owner's full name" },
        owner_cell: { type: "string", description: "Owner's cell for texts, digits only" },
        business_phone: { type: "string", description: "Business number customers call now, digits only, if different" },
        owner_email: { type: "string", description: "Email if given, otherwise empty" },
        industry: { type: "string", description: "Type of business" },
        city: { type: "string", description: "Town or area served" },
        services: { type: "string", description: "Services they offer, in their words" },
        hours: { type: "string", description: "Business hours and emergency availability" },
        pay_method: { type: "string", description: "How they will pay", enum: ["card", "zelle", "cashapp"] },
        caller_number: { type: "string", dynamic_variable: "system__caller_id" },
        conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
      },
    },
    {
      name: "send_info_and_callback",
      description: "Text the caller the sign-up link and ask Elvin at HSW365 to call them back.",
      url: `${base()}/api/clients/phone-signup/callback`,
      required: ["callback_number"],
      properties: {
        name: { type: "string", description: "Caller's name if given" },
        business_name: { type: "string", description: "Business name if given" },
        callback_number: { type: "string", description: "Best number to text and call back, digits only" },
        note: { type: "string", description: "What they want or asked about" },
        caller_number: { type: "string", dynamic_variable: "system__caller_id" },
      },
    },
  ].map((t) => ({
    type: "webhook", name: t.name, description: t.description, response_timeout_secs: 20,
    api_schema: { url: t.url, method: "POST", content_type: "application/json", request_headers: hdr,
      request_body_schema: { type: "object", required: t.required, properties: t.properties } },
  }));
}

async function upsertTools(cfg) {
  const want = tools(cfg);
  cfg.toolIds = cfg.toolIds || {};
  for (const t of want) {
    const id = cfg.toolIds[t.name];
    if (id) await axios.patch(`${EL}/tools/${id}`, { tool_config: t }, { headers: elHeaders(), timeout: 20000 });
    else { const r = await axios.post(`${EL}/tools`, { tool_config: t }, { headers: elHeaders(), timeout: 20000 }); cfg.toolIds[t.name] = r.data.id; }
  }
}

function agentBody(cfg) {
  return {
    name: "CallTwin Sign-Up Line",
    tags: ["calltwin", "signup"],
    conversation_config: {
      agent: {
        first_message: "Thanks for calling CallTwin. I can explain how our AI receptionist works, or get your business signed up right now on this call. What would you like to do?",
        language: "en",
        prompt: {
          prompt: prompt(), llm: "gemini-2.5-flash", temperature: 0,
          tool_ids: Object.values(cfg.toolIds || {}),
          built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
        },
      },
      tts: { voice_id: VOICE_ID, model_id: "eleven_flash_v2", agent_output_audio_format: "ulaw_8000" },
      asr: { user_input_audio_format: "ulaw_8000", quality: "high" },
      conversation: { max_duration_seconds: 1200 },
    },
  };
}

let state = { done: false };
/** Create or refresh the sign-up line. Safe to call on every boot. */
async function ensureSignupLine() {
  const log = (m) => { console.log("[signup-line]", m); state.log = (state.log || []).concat(m).slice(-10); };
  if (!process.env.ELEVENLABS_API_KEY) { state = { done: false, error: "ELEVENLABS_API_KEY missing" }; return state; }
  const cfg = { ...(await getCfg()) };
  try {
    if (!cfg.hookKey) { cfg.hookKey = crypto.randomBytes(24).toString("base64url"); await saveCfg(cfg); }
    await upsertTools(cfg); await saveCfg(cfg);
    if (cfg.agentId) await axios.patch(`${EL}/agents/${cfg.agentId}`, agentBody(cfg), { headers: elHeaders(), timeout: 30000 });
    else { const r = await axios.post(`${EL}/agents/create`, agentBody(cfg), { headers: elHeaders(), timeout: 30000 }); cfg.agentId = r.data.agent_id; log(`agent ${cfg.agentId}`); await saveCfg(cfg); }

    const { buyNumber, registerSip } = require("./provision");
    const pinned = process.env.SIGNUP_LINE_NUMBER ? "+1" + last10(process.env.SIGNUP_LINE_NUMBER) : "";
    if (pinned && last10(pinned) !== last10(cfg.number)) { cfg.number = pinned; cfg.elPhoneId = ""; await saveCfg(cfg); }
    if (!cfg.number) { cfg.number = await buyNumber({ businessName: "Sign-Up Line", areaCode: "856", ownerCell: "" }); log(`number ${cfg.number}`); await saveCfg(cfg); }
    if (!cfg.elPhoneId) { cfg.elPhoneId = await registerSip({ businessName: "Sign-Up Line", aiNumber: cfg.number, agentId: cfg.agentId }); log(`sip ${cfg.elPhoneId}`); await saveCfg(cfg); }
    state = { done: true, number: cfg.number, agentId: cfg.agentId, at: new Date().toISOString() };
  } catch (e) {
    state = { ...state, done: false, error: errText(e), at: new Date().toISOString(), number: cfg.number || "" };
    console.error("[signup-line] error:", state.error);
  }
  return state;
}

async function lineNumber() { return ((cache || (await getCfg())).number) || ""; }
async function isSignupLine(to) { const n = await lineNumber().catch(() => ""); return !!n && last10(n) === last10(to); }
async function hookKey() { return ((cache || (await getCfg())).hookKey) || ""; }

module.exports = { ensureSignupLine, lineNumber, isSignupLine, hookKey, prompt, tools, status: () => state, AppConfig };
