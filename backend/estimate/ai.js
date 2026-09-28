/**
 * AI job analysis — provider-agnostic.
 *
 * Providers: "openai" (OPENAI_API_KEY) and "anthropic" (ANTHROPIC_API_KEY). Pick with ESTIMATE_AI_PROVIDER,
 * otherwise the first one with a key. Add a provider by adding an entry to PROVIDERS that returns raw text.
 * With no key configured, a rule-based analysis runs so the workflow never blocks.
 *
 * Safety contract (enforced in code, not just in the prompt):
 *  - The model never sees prices and any price/cost field it returns is discarded.
 *  - SKUs / labor keys / service templates are accepted only if they exist in the owner's price book.
 *  - Quantities and hours are kept only when tagged as stated by the customer or defined by an owner template;
 *    everything else is marked "assumed" and surfaced to the owner.
 */
const axios = require("axios");

const PROVIDERS = {
  openai: {
    ready: () => !!process.env.OPENAI_API_KEY,
    model: () => process.env.ESTIMATE_OPENAI_MODEL || "gpt-4.1-mini",
    async call({ system, user, images }) {
      const content = [{ type: "text", text: user }];
      for (const img of images) content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } });
      const r = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: this.model(),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content }],
      }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 90000 });
      return r.data.choices[0].message.content;
    },
  },
  anthropic: {
    ready: () => !!process.env.ANTHROPIC_API_KEY,
    model: () => process.env.ESTIMATE_ANTHROPIC_MODEL || "claude-sonnet-4-6",
    async call({ system, user, images }) {
      const content = images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mime, data: img.base64 } }));
      content.push({ type: "text", text: user + "\n\nReturn only the JSON object." });
      const r = await axios.post("https://api.anthropic.com/v1/messages", {
        model: this.model(), max_tokens: 3000, temperature: 0, system, messages: [{ role: "user", content }],
      }, { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, timeout: 90000 });
      return (r.data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    },
  },
};

function pickProvider() {
  const want = (process.env.ESTIMATE_AI_PROVIDER || "").toLowerCase();
  if (want && PROVIDERS[want] && PROVIDERS[want].ready()) return want;
  return Object.keys(PROVIDERS).find((k) => PROVIDERS[k].ready()) || null;
}

const SYSTEM = `You are the estimating assistant for a trade/service contractor. You help the OWNER prepare an estimate. The owner, not you, decides prices and final scope.

Hard rules:
1. Never output prices, costs, rates, or dollar amounts anywhere.
2. Never invent measurements, model numbers, quantities, addresses or facts. If the customer did not state it and the owner's service template does not define it, it is unknown.
3. Every material and labor entry has "basis": "stated" (customer or owner said it), "template" (from the owner's service template) or "assumed" (your judgement of what is typically needed; the owner must confirm).
4. For qty/hours: give a number only when basis is "stated" or "template". Otherwise use null.
5. Use a "sku" only if it appears exactly in the provided price book; otherwise null. Use a "laborKey" only from the provided labor rates. Use "serviceTemplate" only if one of the provided template names clearly fits; otherwise "".
6. List what you assumed in "assumptions" and what is missing in "missingInfo". Put questions for the customer in "questions".
7. Keep items practical and short. Do not pad.

Output a single JSON object with exactly these keys:
{"summary": string, "scope": string[], "materials": [{"name": string, "qty": number|null, "unit": string, "sku": string|null, "basis": "stated"|"template"|"assumed", "note": string}], "labor": [{"task": string, "hours": number|null, "laborKey": string|null, "basis": "stated"|"template"|"assumed", "note": string}], "serviceTemplate": string, "additionalWork": string[], "questions": string[], "assumptions": string[], "missingInfo": string[], "nextSteps": string[]}`;

function buildUser(job, settings, customer) {
  const book = (settings.priceBook || []).filter((i) => i.active !== false).map((i) => `- ${i.sku}: ${i.name} (${i.kind}, per ${i.unit}${i.category ? ", " + i.category : ""})`).join("\n") || "(empty)";
  const labor = (settings.laborRates || []).map((r) => `- ${r.key}: ${r.name}`).join("\n") || "(none)";
  const templates = (settings.services || []).map((s) => `- ${s.name}: ${s.description || ""}${s.laborHours != null ? ` | standard labor ${s.laborHours}h (${s.laborKey || "default"})` : ""}${(s.items || []).length ? " | items: " + s.items.map((i) => `${i.qty} x ${i.sku}`).join(", ") : ""}`).join("\n") || "(none)";
  const f = (k, v) => (v ? `${k}: ${v}\n` : `${k}: (not provided)\n`);
  return `JOB INTAKE
${f("Source", job.source)}${f("Customer name", customer.name)}${f("Service address", customer.address ? "provided" : "")}${f("Type of job", job.service)}${f("Problem description", job.problem)}${f("Urgency", job.urgency)}${f("Measurements", job.measurements)}${f("Materials the customer mentioned", job.materialsNeeded)}${f("Labor notes", job.laborNotes)}${f("Customer notes", job.notes)}${f("Call summary", job.callSummary)}${(job.messages || []).length ? "Messages:\n" + job.messages.slice(-10).map((m) => `- ${m.from} (${m.channel}): ${m.text}`).join("\n") + "\n" : ""}
OWNER'S PRICE BOOK (sku: name) — prices hidden on purpose
${book}

OWNER'S LABOR RATES (key: name)
${labor}

OWNER'S SERVICE TEMPLATES
${templates}`;
}

function parseJson(text) {
  const s = String(text || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI returned no JSON");
  return JSON.parse(s.slice(a, b + 1));
}

const strArr = (v, n = 12, len = 300) => (Array.isArray(v) ? v : []).map((x) => String(x == null ? "" : x).trim().slice(0, len)).filter(Boolean).slice(0, n);
const MONEY_RE = /\$\s?\d|\b\d+(\.\d+)?\s?(usd|dollars?)\b/i;
const stripMoney = (s) => String(s || "").replace(/\$\s?[\d,]+(\.\d+)?/g, "[price removed]");

/** Enforce the safety contract on whatever the model returned. */
function sanitize(raw, settings) {
  const skus = new Set((settings.priceBook || []).map((i) => i.sku));
  const laborKeys = new Set((settings.laborRates || []).map((r) => r.key));
  const templateNames = new Set((settings.services || []).map((s) => s.name));
  const basisOf = (b) => (["stated", "template", "assumed"].includes(b) ? b : "assumed");
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

  const materials = (Array.isArray(raw.materials) ? raw.materials : []).slice(0, 30).map((m) => {
    const basis = basisOf(m.basis);
    return {
      name: stripMoney(m.name).slice(0, 160),
      qty: basis === "assumed" ? null : num(m.qty),
      unit: String(m.unit || "").slice(0, 20),
      sku: m.sku && skus.has(String(m.sku)) ? String(m.sku) : "",
      basis,
      note: stripMoney(m.note).slice(0, 300),
    };
  }).filter((m) => m.name);

  const labor = (Array.isArray(raw.labor) ? raw.labor : []).slice(0, 15).map((l) => {
    const basis = basisOf(l.basis);
    return {
      task: stripMoney(l.task).slice(0, 200),
      hours: basis === "assumed" ? null : num(l.hours),
      laborKey: l.laborKey && laborKeys.has(String(l.laborKey)) ? String(l.laborKey) : "",
      basis,
      note: stripMoney(l.note).slice(0, 300),
    };
  }).filter((l) => l.task);

  const out = {
    summary: stripMoney(raw.summary).slice(0, 1200),
    scope: strArr(raw.scope, 15).map(stripMoney),
    materials,
    labor,
    serviceTemplate: templateNames.has(String(raw.serviceTemplate || "")) ? String(raw.serviceTemplate) : "",
    additionalWork: strArr(raw.additionalWork, 10).map(stripMoney),
    questions: strArr(raw.questions, 12).map(stripMoney),
    assumptions: strArr(raw.assumptions, 12).map(stripMoney),
    missingInfo: strArr(raw.missingInfo, 12).map(stripMoney),
    nextSteps: strArr(raw.nextSteps, 8).map(stripMoney),
  };
  return out;
}

/** Rule-based analysis when no AI key is configured: restates facts, flags gaps, invents nothing. */
function ruleBased(job, settings, customer) {
  const missing = [];
  if (!customer.name) missing.push("Customer name");
  if (!customer.phone && !customer.email) missing.push("Customer phone or email");
  if (!customer.address) missing.push("Service address");
  if (!job.service) missing.push("Type of job");
  if (!job.problem && !job.callSummary) missing.push("Description of the problem");
  if (!job.measurements) missing.push("Measurements / sizes");
  const text = `${job.service} ${job.problem} ${job.callSummary}`.toLowerCase();
  const tpl = (settings.services || []).find((s) => s.name && text.includes(s.name.toLowerCase()));
  return {
    summary: [job.service, job.problem || job.callSummary].filter(Boolean).join(": ") || "New job request",
    scope: job.problem ? [`Inspect and address: ${job.problem}`] : [],
    materials: [],
    labor: [],
    serviceTemplate: tpl ? tpl.name : "",
    additionalWork: [],
    questions: missing.map((m) => `Can you confirm the ${m.toLowerCase()}?`),
    assumptions: tpl ? [`Matched owner service template "${tpl.name}" by keyword`] : [],
    missingInfo: missing,
    nextSteps: ["Review the job details", "Confirm missing information with the customer", "Price the estimate and send"],
  };
}

async function analyzeJob({ job, settings, customer, photos = [] }) {
  const provider = pickProvider();
  if (!provider) return { provider: "rules", model: "", result: ruleBased(job, settings, customer) };
  const p = PROVIDERS[provider];
  const images = photos.filter((ph) => /^image\/(png|jpe?g|webp|gif)$/.test(ph.mime) && ph.size <= 4.5 * 1024 * 1024).slice(0, 4)
    .map((ph) => ({ mime: ph.mime === "image/jpg" ? "image/jpeg" : ph.mime, base64: ph.data.toString("base64") }));
  const text = await p.call({ system: SYSTEM, user: buildUser(job, settings, customer), images });
  const result = sanitize(parseJson(text), settings);
  return { provider, model: p.model(), result, moneyScrubbed: MONEY_RE.test(text) };
}

module.exports = { analyzeJob, sanitize, ruleBased, pickProvider, PROVIDERS, SYSTEM };
