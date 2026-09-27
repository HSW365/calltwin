/**
 * Auto-provisioning for self-serve CallTwin clients:
 *   1. ElevenLabs webhook tool (posts job tickets back to this server)
 *   2. ElevenLabs agent with the business's own prompt
 *   3. SignalWire phone number (local to the owner's area code) pointed at /api/inbound/voice
 *   4. Register that number in ElevenLabs as a SIP trunk and assign the agent
 * Every step is idempotent and logged on the client so a partial run can be resumed.
 */
const axios = require("axios");

const EL = "https://api.elevenlabs.io/v1/convai";
const VOICE_ID = process.env.CALLTWIN_VOICE_ID || "nPczCjzI2devNBz1zQrb";
const base = () => (process.env.PUBLIC_BASE_URL || "https://calltwin.onrender.com").replace(/\/$/, "");
const elHeaders = () => ({ "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" });
const errText = (e) => (e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message);

function swConfig() {
  const space = (process.env.SIGNALWIRE_SPACE || process.env.SIGNALWIRE_SPACE_URL || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const project = process.env.SIGNALWIRE_PROJECT_ID;
  const token = process.env.SIGNALWIRE_API_TOKEN;
  if (!space || !project || !token) return null;
  return { api: `https://${space}/api/laml/2010-04-01/Accounts/${project}`, auth: { username: project, password: token } };
}

function buildPrompt(c) {
  return `# Role
You are the 24/7 receptionist for ${c.businessName}${c.city ? ` in ${c.city}` : ""}. You answer every call to the business, day or night. You sound like a warm, calm, competent person at a front desk: short sentences, natural pace, never robotic.

# Business facts
- Business: ${c.businessName}${c.industry ? ` (${c.industry})` : ""}
- Services: ${c.services || "Ask the caller what they need and take a detailed message."}
- Hours: ${c.hours || "The team returns calls as soon as possible; emergencies are prioritized."}
- Main line: ${c.businessPhone || "the number they called"}
${c.notes ? `- Other things to know: ${c.notes}\n` : ""}
# How to handle a call
1. Find out what the caller needs in their own words. One question at a time; one or two sentences per turn.
2. If it is an emergency or safety issue, tell them to call 911 first when appropriate, then get their details fast.
3. Collect: full name, best callback number (read it back digit by digit and confirm), address or town if relevant, what they need, how urgent, preferred time, and email only if offered.
4. Call save_job_ticket as soon as you have name, callback number and a summary. It texts the owner instantly. Then confirm: "You're all set. The owner has your details and will call you back at [number]."
5. Ask if there is anything else, then close politely and end the call.

# Rules
- Never quote firm prices; say the owner will confirm pricing.
- Never invent names, license numbers or arrival times.
- If asked whether you're a person, say you're ${c.businessName}'s AI receptionist and the owner gets every detail right away.
- Sales calls, vendors or robocalls: take a name and number in one line and end politely.
- If the caller speaks Spanish, answer in Spanish.`;
}

async function createTool(c) {
  const r = await axios.post(`${EL}/tools`, {
    tool_config: {
      type: "webhook",
      name: "save_job_ticket",
      description: `Save the caller's request for ${c.businessName}. This texts the owner immediately. Call once you have name, callback number and a short summary.`,
      response_timeout_secs: 20,
      api_schema: {
        url: `${base()}/api/clients/lead`,
        method: "POST",
        content_type: "application/json",
        request_headers: { "x-client-key": c.hookKey },
        request_body_schema: {
          type: "object",
          required: ["name", "phone", "summary"],
          properties: {
            name: { type: "string", description: "Caller's full name" },
            phone: { type: "string", description: "Best callback number, digits only" },
            email: { type: "string", description: "Caller's email if given" },
            service: { type: "string", description: "What they need" },
            urgency: { type: "string", description: "How urgent", enum: ["Emergency", "Today", "This week", "Flexible"] },
            address: { type: "string", description: "Address or town if relevant" },
            preferred_time: { type: "string", description: "When they want service or a callback" },
            details: { type: "string", description: "Details in the caller's words" },
            summary: { type: "string", description: "One or two sentence summary for the owner" },
            conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
          },
        },
      },
    },
  }, { headers: elHeaders(), timeout: 20000 });
  return r.data.id;
}

async function createAgent(c) {
  const r = await axios.post(`${EL}/agents/create`, {
    name: `${c.businessName} — CallTwin`,
    tags: ["calltwin", "client"],
    conversation_config: {
      agent: {
        first_message: `Thanks for calling ${c.businessName}. How can I help you today?`,
        language: "en",
        prompt: {
          prompt: buildPrompt(c),
          llm: "gemini-2.5-flash",
          temperature: 0,
          tool_ids: [c.toolId],
          built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
        },
      },
      tts: { voice_id: VOICE_ID, model_id: "eleven_flash_v2", agent_output_audio_format: "ulaw_8000" },
      asr: { user_input_audio_format: "ulaw_8000", quality: "high" },
      conversation: { max_duration_seconds: 600 },
    },
  }, { headers: elHeaders(), timeout: 30000 });
  return r.data.agent_id;
}

async function buyNumber(c) {
  const sw = swConfig();
  if (!sw) throw new Error("SignalWire not configured");
  const tryCodes = [c.areaCode, String(c.ownerCell || "").replace(/\D/g, "").slice(-10, -7), "856", "609", "908", ""].filter((v, i, a) => a.indexOf(v) === i);
  let pick = null;
  for (const code of tryCodes) {
    const params = { PageSize: 5, VoiceEnabled: true };
    if (code) params.AreaCode = code;
    try {
      const r = await axios.get(`${sw.api}/AvailablePhoneNumbers/US/Local.json`, { auth: sw.auth, params, timeout: 15000 });
      const list = r.data.available_phone_numbers || [];
      if (list.length) { pick = list[0].phone_number; break; }
    } catch (e) { /* try next area code */ }
  }
  if (!pick) throw new Error("no numbers available");
  await axios.post(`${sw.api}/IncomingPhoneNumbers.json`,
    new URLSearchParams({ PhoneNumber: pick, FriendlyName: `CallTwin ${c.businessName}`.slice(0, 60), VoiceUrl: `${base()}/api/inbound/voice`, VoiceMethod: "POST" }).toString(),
    { auth: sw.auth, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000 });
  return pick;
}

async function registerSip(c) {
  const space = (process.env.SIGNALWIRE_SPACE || "hsw365-media.signalwire.com").replace(/^https?:\/\//, "");
  const r = await axios.post(`${EL}/phone-numbers`, {
    provider: "sip_trunk",
    label: `CallTwin ${c.businessName}`.slice(0, 60),
    phone_number: c.aiNumber,
    inbound_trunk_config: { media_encryption: "allowed" },
    outbound_trunk_config: { address: space, transport: "tcp", media_encryption: "allowed" },
  }, { headers: elHeaders(), timeout: 20000 });
  const id = r.data.phone_number_id;
  await axios.patch(`${EL}/phone-numbers/${id}`, { agent_id: c.agentId }, { headers: elHeaders(), timeout: 20000 });
  return id;
}

/** Run every missing step. opts.buyNumber=false skips purchasing a phone number. */
async function provision(c, opts = {}) {
  const log = (m) => { c.provisionLog.push(`${new Date().toISOString()} ${m}`); console.log(`[provision ${c._id}] ${m}`); };
  try {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY missing");
    if (!c.toolId) { c.toolId = await createTool(c); log(`tool ${c.toolId}`); await c.save(); }
    if (!c.agentId) { c.agentId = await createAgent(c); log(`agent ${c.agentId}`); await c.save(); }
    if (!c.aiNumber && opts.buyNumber !== false) {
      try { c.aiNumber = await buyNumber(c); log(`number ${c.aiNumber}`); await c.save(); }
      catch (e) { log(`number pending: ${errText(e)}`); }
    }
    if (c.aiNumber && !c.elPhoneId) { c.elPhoneId = await registerSip(c); log(`sip ${c.elPhoneId}`); await c.save(); }
  } catch (e) {
    log(`error: ${errText(e)}`);
    await c.save();
  }
  return c;
}

/** Keep the agent's prompt in sync after the owner edits business info. */
async function updateAgent(c) {
  if (!c.agentId || !process.env.ELEVENLABS_API_KEY) return;
  await axios.patch(`${EL}/agents/${c.agentId}`, {
    name: `${c.businessName} — CallTwin`,
    conversation_config: { agent: { first_message: `Thanks for calling ${c.businessName}. How can I help you today?`, prompt: { prompt: buildPrompt(c), llm: "gemini-2.5-flash", tool_ids: [c.toolId] } } },
  }, { headers: elHeaders(), timeout: 20000 }).catch((e) => console.error("[provision] update agent:", errText(e)));
}

module.exports = { provision, updateAgent, buildPrompt, swConfig };
