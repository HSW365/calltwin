/**
 * New Ark website chat: Marcus answers in writing, on the site, with no voice and no ElevenLabs.
 *
 *   POST /api/newark/chat   { messages: [{ role: "user"|"assistant", content }], section }
 *                        -> { ok, reply, saved }
 *   GET  /api/newark/chat   { ok, ready }   (does the server have an AI key for the chat)
 *
 * Stateless: the page sends the conversation so far. When the visitor wants service or a callback,
 * the model calls save_job_ticket and the job lands in the owner portal like any other web request.
 *
 * Env: ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY. NEWARK_CHAT_MODEL / NEWARK_CHAT_OPENAI_MODEL to override.
 */
const express = require("express");
const axios = require("axios");

const router = express.Router();
const NEWARK_API = process.env.NEWARK_API || "https://lsxdlmrjrcivxwgfkpop.supabase.co/functions/v1/newark";

const ALLOWED = [/^https:\/\/(www\.)?ark-hvac\.com$/, /^https:\/\/newark-ark\.onrender\.com$/, /^https:\/\/hsw365\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
router.use((req, res, next) => {
  const o = req.get("origin") || "";
  if (ALLOWED.some((re) => re.test(o))) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); }
  res.set("Access-Control-Allow-Headers", "content-type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
router.use(express.json({ limit: "64kb" }));

const SYSTEM = (section) => `# Role
You are Marcus, the front desk for New Ark Plumbing, Heating & Air Conditioning LLC, answering questions in the chat box on the company website. You are typing, not talking. You never place or take phone calls. The visitor opened the chat from this part of the site: ${section}.

# How to write
- Short, plain and friendly. One to three sentences per reply. No lists unless the visitor asks for steps.
- Plain text only. No markdown, no asterisks, no headings, no emojis.
- Answer the question first. Then, only if it helps, offer the next step.
- Say the company name as "New Ark".
- Reply in the visitor's language. You can chat in English or Spanish.
- If you don't know, say so and offer to have the owner call them back. Never guess.

# Business facts
- New Ark Plumbing, Heating & Air Conditioning LLC. Nearly 40 years serving New Jersey. Commercial and residential, public and private sector work.
- Master Plumber License #4646 and HVAC Contractor License #1783, State of New Jersey. Licensed and insured. Certified small and minority business. Open and union shop.
- Office: 412 Firth St., Phillipsburg, NJ 08865. Phone 908-454-4043, answered 24/7. Website: ark-hvac.com.
- Service area: based in Phillipsburg, serving Northern and Western New Jersey. If someone is outside New Jersey, take their details and say the office will confirm coverage.
- Hours: emergencies 24 hours a day. Scheduled work Monday to Saturday.
- Plumbing: complete plumbing systems, kitchens, bathrooms, water heaters, drain and sewer lines, leaks, clogs, emergency plumbing.
- Heating and air conditioning: design and installation of HVAC systems including duct work and equipment, furnaces, boilers, central air, maintenance. Experience in medical facilities, restaurants and high-rise buildings.
- Geothermal: installs and maintains ground-source heating and cooling systems, new construction and retrofits.
- Fire protection: designs and installs fire sprinkler systems, residential and commercial, with regular inspections.
- Past projects include Benihana in Short Hills, the Colas tenant project in Morristown, the Joint Meeting of Essex & Union Counties in Elizabeth, and Newark Access Station.
- Motto: on time, on budget and on spec. Customer satisfaction first.

# How things work on this website
- Free estimates. In the "Get a free estimate" section the visitor sends photos and details, the owner prices every line, and they get an itemized proposal to review, sign online and pay a deposit to lock in a date. It takes about 2 minutes to send.
- "Request a visit" in the Contact section books a visit. The owner calls back to confirm the time.
- "Pay a bill" takes Zelle, Cash App or card. After paying, the customer fills in the short "I've sent a payment" form so the payment is matched to their invoice. That form only notifies New Ark. It does not move money.
- You cannot take payments, see invoices or account balances, or look up the status of a job. For those, offer a callback from the owner.

# Emergencies
If the visitor describes water running or flooding, a burst pipe, no heat in freezing weather, a sewage backup or a sprinkler discharge: tell them to call 908-454-4043 right now, and to shut off the main water valve if they can do it safely. If they smell gas or smoke: tell them to leave the building, then call 911 and their gas company from outside. Give the safety step first, in one short reply.

# Taking a job or a callback request
If the visitor wants service, a callback, or has a concern that needs the owner, collect these one at a time: their name, the best phone number, the address or town, and what is going on. Then call save_job_ticket with a clear summary (include their question or concern). After it saves, tell them the owner has their details and will call them back. Do not ask for anything else. Never say a ticket was saved unless save_job_ticket returned success.

# Rules
- Never quote a price or a price range. Say pricing depends on the job and point to the free estimate.
- Never promise an arrival time or a specific technician.
- Never invent facts about licenses, warranties, financing terms or past work beyond what is listed here.
- Never promise the visitor a text message. The owner calls them back.
- If asked whether you are a person: say you are New Ark's AI front desk and that you pass everything straight to the owner.
- Stay on New Ark and its services. For anything unrelated, say politely that you can only help with New Ark questions.`;

const TICKET = {
  name: "save_job_ticket",
  description: "Save a job or callback request from the website chat so the owner can call the visitor back. Call only once you have the visitor's name and a 10-digit phone number.",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Visitor's name" },
      phone: { type: "string", description: "Best callback number, 10 digits" },
      address: { type: "string", description: "Street address or town, if given" },
      service: { type: "string", enum: ["Plumbing", "HVAC", "Geothermal", "Fire Protection", "Other"] },
      urgency: { type: "string", enum: ["Emergency", "Within 48 hours", "This week", "Flexible"] },
      summary: { type: "string", description: "What is going on and what the visitor asked, in one or two sentences" },
    },
    required: ["name", "phone", "summary"],
  },
};

async function saveTicket(a) {
  const digits = String(a.phone || "").replace(/\D/g, "");
  if (!String(a.name || "").trim() || digits.length < 10) return { ok: false, error: "A name and a 10-digit phone number are needed before this can be saved." };
  try {
    const r = await axios.post(NEWARK_API, {
      a: "lead", name: String(a.name).slice(0, 120), phone: String(a.phone).slice(0, 40), address: String(a.address || "").slice(0, 300),
      service: a.service || "Other", urgency: a.urgency || "Within 48 hours", details: ("Website chat: " + String(a.summary || "")).slice(0, 2000),
    }, { timeout: 10000 });
    return r.data && r.data.ok ? { ok: true, ticket: r.data.ticket } : { ok: false, error: (r.data && r.data.error) || "Not saved." };
  } catch (e) {
    console.error("[newark chat] ticket save failed:", e.message);
    return { ok: false, error: "The ticket did not save. Ask the visitor to call 908-454-4043." };
  }
}

async function viaAnthropic(system, messages) {
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
  let saved = null;
  for (let turn = 0; turn < 3; turn++) {
    const r = await axios.post("https://api.anthropic.com/v1/messages", {
      model: process.env.NEWARK_CHAT_MODEL || "claude-haiku-4-5", max_tokens: 400, system, messages: msgs,
      tools: [{ name: TICKET.name, description: TICKET.description, input_schema: TICKET.schema }],
    }, { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, timeout: 30000 });
    const blocks = r.data.content || [];
    const calls = blocks.filter((b) => b.type === "tool_use");
    if (!calls.length) return { reply: blocks.filter((b) => b.type === "text").map((b) => b.text).join("").trim(), saved };
    msgs.push({ role: "assistant", content: blocks });
    const results = [];
    for (const c of calls) { const out = await saveTicket(c.input || {}); if (out.ok) saved = out.ticket; results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) }); }
    msgs.push({ role: "user", content: results });
  }
  return { reply: "", saved };
}

async function viaOpenAI(system, messages) {
  const msgs = [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  let saved = null;
  for (let turn = 0; turn < 3; turn++) {
    const r = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: process.env.NEWARK_CHAT_OPENAI_MODEL || "gpt-4.1-mini", max_tokens: 400, messages: msgs,
      tools: [{ type: "function", function: { name: TICKET.name, description: TICKET.description, parameters: TICKET.schema } }],
    }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 30000 });
    const m = r.data.choices[0].message;
    if (!m.tool_calls || !m.tool_calls.length) return { reply: String(m.content || "").trim(), saved };
    msgs.push(m);
    for (const c of m.tool_calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch (e) {}
      const out = await saveTicket(args); if (out.ok) saved = out.ticket;
      msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
    }
  }
  return { reply: "", saved };
}

const providers = () => [process.env.ANTHROPIC_API_KEY && viaAnthropic, process.env.OPENAI_API_KEY && viaOpenAI].filter(Boolean);

// Small per-visitor limit so the chat can't be used to run up a bill.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > win) hits.delete(k);
  return list.length > 40;
}

router.get("/", (req, res) => res.json({ ok: true, ready: providers().length > 0 }));

router.post("/", async (req, res) => {
  const list = providers();
  if (!list.length) return res.status(503).json({ ok: false, error: "chat_not_configured" });
  const ip = String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ ok: false, error: "Too many messages. Please call 908-454-4043." });
  const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  const messages = raw.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-24).map((m) => ({ role: m.role, content: m.content.trim().slice(0, 800) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return res.status(400).json({ ok: false, error: "A question is required." });
  const section = String((req.body && req.body.section) || "the website").replace(/[\r\n]+/g, " ").slice(0, 160);
  let lastErr = null;
  for (const run of list) {
    try {
      const out = await run(SYSTEM(section), messages);
      if (out.reply) return res.json({ ok: true, reply: out.reply, saved: out.saved });
    } catch (e) {
      lastErr = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message;
      console.error("[newark chat] provider failed:", lastErr);
    }
  }
  res.status(502).json({ ok: false, error: "chat_unavailable" });
});

module.exports = router;
