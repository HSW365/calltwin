/**
 * New Ark: fill an NFPA sprinkler form from the job itself.
 *
 *   1. Voice (a recorded note, or a short video's sound) is transcribed.
 *   2. Photos and video frames are read by a vision model for what a sprinkler inspector looks at:
 *      gauge readings, valve positions, tamper/supervision, signage, FDC caps and swivels, heads, bulbs, corrosion,
 *      hangers, nameplates and labels (make, model, temperature, serial).
 *   3. A text model maps those facts and Joe's own words onto the form's fields, by field id.
 *
 * Rules that hold no matter what the model says:
 *   - Only fields that exist on the chosen form, only values that fit the field (Yes/No/N/A, a number, a listed option).
 *   - Signatures, sign-off dates, titles and the license number are never filled by the AI.
 *   - The answer is a suggestion with a reason: the page marks every AI answer and leaves the rest for Joe.
 *   - Fields Joe already filled are not touched (the page only fills blanks).
 */
const axios = require("axios");
const { TEMPLATES, fields, cleanValue } = require("./newarkNfpaForms");
const { transcribe } = require("./newarkJobAnalyze");

const JSON_TYPE = { "Content-Type": "application/json" };
const base = () => String(process.env.CHAT_BASE_URL || "").replace(/\/+$/, "");
const auth = () => (process.env.CHAT_API_KEY ? { Authorization: `Bearer ${process.env.CHAT_API_KEY}` } : {});
const textModels = () => String(process.env.CHAT_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
const visionModel = () => process.env.NEWARK_VISION_MODEL || "qwen/qwen3.8-27b";
const ready = () => !!(base() && textModels().length);
const err = (msg, status) => Object.assign(new Error(msg), { status });

// Never for the AI: these are Joe's (and the property owner's) to sign and date.
const NEVER = new Set(["signature", "signDate", "license", "ownerSig", "ownerTitle", "ownerDate", "contractorSig", "contractorTitle", "contractorDate"]);
const aiFields = (t) => fields(t).filter((f) => f.k !== "sig" && !NEVER.has(f.id));

const SEE = `You are looking at photos a licensed fire sprinkler contractor took while inspecting or testing a sprinkler system.
Report only what you can actually see, photo by photo, in short plain sentences. Look for:
- gauges: what each gauge is (water / air / system / city side) and the needle reading in psi, only if the dial is clearly readable
- control valves: open or closed (OS&Y stem out = open; butterfly indicator), tamper switch, chain and lock or seal, signage, leaks, damage, access blocked
- alarm / dry pipe valves and trim: damage, leaks at drains, trim valve positions
- fire department connection: caps or plugs present or missing, swivels, gaskets, ID sign, ball drip, damage, access
- sprinkler heads: paint, corrosion, loading/dust, damage, leaks, orientation (pendent/upright/sidewall), glass bulb fluid, spare head cabinet and wrench and count
- pipe, fittings, hangers, bracing: corrosion, leaks, damage, loose hangers, things hung from the pipe
- nameplates and labels you can read: hydraulic data nameplate, make, model, serial, temperature rating, year, orifice
- backflow preventer, pressure reducing valve, water motor gong, flow / supervisory switches
- freezing exposure (open windows/doors near wet pipe, unheated space)
Say "unclear" rather than guess. No advice. No prices.`;

async function seePhotos(images, said) {
  const out = [];
  for (let i = 0; i < images.length; i += 3) {
    const batch = images.slice(i, i + 3);
    const content = [{ type: "text", text: `What the contractor said: ${said || "(nothing)"}\nPhotos ${i + 1} to ${i + batch.length}:` },
      ...batch.map((b) => ({ type: "image_url", image_url: { url: `data:${b.mimetype || "image/jpeg"};base64,${b.buffer.toString("base64")}` } }))];
    try {
      const r = await axios.post(`${base()}/chat/completions`, { model: visionModel(), max_tokens: 900, temperature: 0.1, messages: [{ role: "system", content: SEE }, { role: "user", content }] },
        { headers: { ...JSON_TYPE, ...auth() }, timeout: 60000 });
      const t = String(r.data.choices[0].message.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (t) out.push(t);
    } catch (e) {
      console.error("[newark nfpa] vision batch failed:", e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message);
    }
  }
  return out.join("\n").slice(0, 8000);
}

function describe(f) {
  switch (f.k) {
    case "ynna": return `"yes" | "no" | "na"`;
    case "yn": return `"yes" | "no"`;
    case "yno": return `"yes" | "no" | "other"`;
    case "pick": return f.multi ? `list from ${JSON.stringify(f.options)}` : `one of ${JSON.stringify(f.options)}`;
    case "table": return `list of ${f.rowLabels ? f.rowLabels.length : f.rows} rows${f.rowLabels ? ` (${f.rowLabels.join(", ")})` : ""}, each {${f.cols.map((c) => `"${c.id}": ${c.label}`).join(", ")}}`;
    case "reading": return `number${f.unit ? ` (${f.unit})` : ""}`;
    default: return `text${f.unit ? ` (${f.unit})` : ""}`;
  }
}

const WRITE = (t, list) => `You fill in NFPA ${t.form}, "${t.title}", for New Ark, a New Jersey fire sprinkler contractor.
You get the contractor's own words (typed and spoken) and what was seen in his job photos.

Fill a field ONLY when those facts directly answer it. Leave everything else out; the contractor fills the rest himself.
- Answer each question as it is literally worded. "Do results differ by more than 10% from previous test?" = "yes" only if they do.
- "yes" on an inspection line means the condition on that line was seen to be true; "no" means it was seen to be false (a deficiency).
- "na" only when he says the item is not on this system or a photo clearly shows it does not exist there.
- A test line is answered only if he says the test was done (or not done). Photos alone never prove a test was performed.
- Readings (psi, seconds, gpm, counts) only when he says the number or a gauge is clearly readable in a photo. Never estimate a reading.
- Make, model, serial, temperature, year: only when he says it or a label is readable.
- Never fill signatures, sign-off dates, titles or license numbers.

For every field you fill, give a short reason in "why" saying where it came from (e.g. "said: main drain static 72" or "photo 3: OS&Y stem out, chained and locked").
Also give "check": up to 4 short things he should confirm (e.g. a gauge you could only partly read), and "comments": one or two plain sentences listing any deficiencies found, for the Comments box, or "" if none.

Fields (id: kind - section - wording):
${list.map((f) => `${f.id}: ${describe(f)} - ${f.path} - ${f.label}${f.unit && f.k !== "reading" ? ` (${f.unit})` : ""}`).join("\n")}

Reply with JSON only: {"values": {"<id>": <value>}, "why": {"<id>": "<reason>"}, "check": [], "comments": ""}`;

async function draft(t, list, notes, transcript, seen) {
  const user = `Typed notes: ${notes || "(none)"}\nWhat he said: ${transcript || "(none)"}\nWhat the photos show:\n${seen || "(no photos)"}`;
  for (const model of textModels()) {
    try {
      const r = await axios.post(`${base()}/chat/completions`, { model, max_tokens: 3000, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: WRITE(t, list) }, { role: "user", content: user }] },
        { headers: { ...JSON_TYPE, ...auth() }, timeout: 90000 });
      const raw = String(r.data.choices[0].message.content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
      const j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
      if (j && typeof j.values === "object") return j;
    } catch (e) {
      console.error(`[newark nfpa] ${model} fill failed:`, e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message);
    }
  }
  return null;
}

/** Keep only answers that fit their field; readings must hold a number. */
function keep(t, j) {
  const values = {}, why = {};
  for (const f of aiFields(t)) {
    let v = j.values ? j.values[f.id] : undefined;
    if (f.k === "reading" && v != null && !/\d/.test(String(v))) v = undefined;
    v = cleanValue(f, v);
    if (v === undefined) continue;
    values[f.id] = v;
    why[f.id] = String((j.why && j.why[f.id]) || "From the job photos and your notes").replace(/\s+/g, " ").trim().slice(0, 240);
  }
  return { values, why };
}

/**
 * template: form id; notes: typed words; images: [{ buffer, mimetype }]; audios: [{ buffer, mimetype }]
 */
async function fillForm({ template, notes = "", images = [], audios = [] }) {
  const t = TEMPLATES[template];
  if (!t) throw err("Pick a form first.", 400);
  if (!ready()) throw err("The AI isn't set up on the server yet.", 503);
  const said = [];
  for (const a of audios.slice(0, 3)) {
    try { const s = await transcribe(a); if (s) said.push(s); }
    catch (e) { console.error("[newark nfpa] transcription failed:", e.response ? e.response.status : e.message); }
  }
  const transcript = said.join("\n");
  const seen = images.length ? await seePhotos(images.slice(0, 12), [notes, transcript].filter(Boolean).join(" ")) : "";
  if (!notes && !transcript && !seen) throw err("Couldn't read the photos or the voice note. Try again, or type a few words about the job.", 422);
  const j = await draft(t, aiFields(t), notes, transcript, seen);
  if (!j) throw err("The AI is busy right now. Try again in a minute.", 503);
  const { values, why } = keep(t, j);
  return {
    template: t.id, values, why,
    check: (Array.isArray(j.check) ? j.check : []).map((c) => String(c).trim().slice(0, 200)).filter(Boolean).slice(0, 4),
    comments: String(j.comments || "").trim().slice(0, 1500),
    filled: Object.keys(values).length,
    transcript, seen,
  };
}

module.exports = { fillForm, aiFields, keep, NEVER, ready };
