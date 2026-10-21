/**
 * New Ark: job photos / video frames / the owner's voice note -> a drafted estimate.
 *
 *   1. Voice (a recorded note, or a short video's sound) is transcribed (Whisper on the same OpenAI-compatible server).
 *   2. Photos and video frames are read by a vision model, 3 per request, into plain observations.
 *   3. A text model turns notes + transcript + observations into a heading, a scope paragraph and line items.
 *
 * Prices: the AI never sees or writes a price. Each line it writes is matched to the owner's own past lines
 * (his price book, built from the proposals he has saved). A match carries his last price for that line;
 * anything new comes back with no price and is flagged for him to fill in.
 *
 * Env: CHAT_BASE_URL, CHAT_API_KEY, CHAT_MODEL (text model first in the list),
 *      NEWARK_VISION_MODEL (default qwen/qwen3.8-27b), NEWARK_STT_MODEL (default whisper-large-v3-turbo)
 */
const axios = require("axios");
const FormData = require("form-data");

const JSON_TYPE = { "Content-Type": "application/json" };
const base = () => String(process.env.CHAT_BASE_URL || "").replace(/\/+$/, "");
const auth = () => (process.env.CHAT_API_KEY ? { Authorization: `Bearer ${process.env.CHAT_API_KEY}` } : {});
const textModels = () => String(process.env.CHAT_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
const visionModel = () => process.env.NEWARK_VISION_MODEL || "qwen/qwen3.8-27b";
const sttModel = () => process.env.NEWARK_STT_MODEL || "whisper-large-v3-turbo";
const ready = () => !!(base() && textModels().length);

// Strip anything that looks like money: prices only ever come from the owner.
const noMoney = (s) => String(s || "").replace(/\$\s?[\d,]+(\.\d+)?/g, "").replace(/\b\d[\d,]*\.\d{2}\b/g, "")
  .replace(/\b\d[\d,]*\s?(dollars|bucks|usd)\b/gi, "").replace(/\s{2,}/g, " ").trim();
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** The owner's price book: one entry per distinct line description, with the price he used last. */
function priceBook(docs) {
  const book = new Map();
  for (const d of docs) for (const it of (d && d.items) || []) {
    const k = norm(it.desc);
    if (!k || !it.priceCents) continue;
    const at = new Date(d.updatedAt || d.date || 0).getTime();
    const prev = book.get(k);
    if (!prev || at >= prev.at) book.set(k, { desc: String(it.desc).trim(), priceCents: it.priceCents, at });
  }
  return [...book.values()].sort((a, b) => b.at - a.at).slice(0, 150);
}

async function transcribe(file) {
  if (!base() || !file || !file.buffer || !file.buffer.length) return "";
  const form = new FormData();
  const name = /video|mp4|quicktime|mov/i.test(file.mimetype || "") ? "clip.mp4" : /webm/i.test(file.mimetype || "") ? "note.webm" : /ogg/i.test(file.mimetype || "") ? "note.ogg" : "note.m4a";
  form.append("file", file.buffer, { filename: name, contentType: file.mimetype || "application/octet-stream" });
  form.append("model", sttModel());
  form.append("language", "en");
  form.append("response_format", "json");
  const r = await axios.post(`${base()}/audio/transcriptions`, form, { headers: { ...form.getHeaders(), ...auth() }, timeout: 90000, maxBodyLength: Infinity });
  return String((r.data && r.data.text) || "").trim().slice(0, 4000);
}

const SEE = `You are looking at photos a plumbing, heating, air conditioning and fire sprinkler contractor took at a job.
Describe only what you can actually see that matters for pricing the work: the equipment and fixtures, their type, size and condition,
brand and model if a label is readable, damage, leaks, corrosion, pipe material and size if clear, counts you can actually count, and access problems.
Say "unclear" rather than guess. Do not suggest prices. Short plain sentences, one photo after another.`;

async function seePhotos(images, notes) {
  const out = [];
  for (let i = 0; i < images.length; i += 3) {
    const batch = images.slice(i, i + 3);
    const content = [{ type: "text", text: `Owner's notes so far: ${notes || "(none)"}\nPhotos ${i + 1} to ${i + batch.length}:` },
      ...batch.map((b) => ({ type: "image_url", image_url: { url: `data:${b.mimetype || "image/jpeg"};base64,${b.buffer.toString("base64")}` } }))];
    try {
      const r = await axios.post(`${base()}/chat/completions`, { model: visionModel(), max_tokens: 700, temperature: 0.1, messages: [{ role: "system", content: SEE }, { role: "user", content }] },
        { headers: { ...JSON_TYPE, ...auth() }, timeout: 60000 });
      const t = noMoney(r.data.choices[0].message.content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (t) out.push(t);
    } catch (e) {
      console.error("[newark analyze] vision batch failed:", e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message);
    }
  }
  return out.join("\n").slice(0, 6000);
}

const WRITE = (type, book) => `You draft a ${type} for New Ark, a New Jersey plumbing, heating, air conditioning and fire sprinkler contractor.
You get the owner's own words (typed notes and what he said out loud) and what was seen in his job photos.
Use only those facts. Do not add work he did not mention or that the photos do not clearly show. No brands or code sections unless given.
Never write any price, dollar amount, total or payment term. The owner prices every line himself.

Write:
- "title": one line naming the job, under 12 words.
- "scope": 2 to 4 plain sentences describing the work, for the customer.
- "items": the line items for the work. Each has "desc" (short, the way a contractor writes a line), "qty" (a number; 1 unless a count was stated or clearly visible),
  and "book" (the number of the matching line from the owner's price list below when it is the same kind of work, otherwise null).
  When you use a price-list line, copy its wording into "desc". Keep labor and materials together on one line unless the owner split them.
- "check": up to 3 short things the owner should confirm before sending (for example a size you could not read). Empty list if none.

Owner's price list (descriptions only):
${book.length ? book.map((b, i) => `${i + 1}. ${b.desc}`).join("\n") : "(empty: he has not saved any priced lines yet)"}

Reply with JSON only: {"title": "...", "scope": "...", "items": [{"desc": "...", "qty": 1, "book": null}], "check": []}`;

async function draft(type, notes, transcript, seen, book) {
  const user = `Typed notes: ${notes || "(none)"}\nWhat the owner said: ${transcript || "(none)"}\nWhat the photos show: ${seen || "(no photos)"}`;
  for (const model of textModels()) {
    try {
      const r = await axios.post(`${base()}/chat/completions`, { model, max_tokens: 1400, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: WRITE(type, book) }, { role: "user", content: user }] },
        { headers: { ...JSON_TYPE, ...auth() }, timeout: 60000 });
      const raw = String(r.data.choices[0].message.content || "");
      const j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
      if (Array.isArray(j.items) && j.items.length) return j;
    } catch (e) {
      console.error(`[newark analyze] ${model} draft failed:`, e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message);
    }
  }
  return null;
}

/** Fill prices from the owner's own price book. Lines the AI tied to a book entry, or whose wording matches one, get his price. */
function priceLines(items, book) {
  const byKey = new Map(book.map((b) => [norm(b.desc), b]));
  return items.slice(0, 30).map((it) => {
    let desc = noMoney(it && it.desc).slice(0, 400);
    const qty = Math.max(0, Math.min(9999, Math.round((parseFloat(it && it.qty) || 1) * 100) / 100)) || 1;
    let hit = null;
    const n = parseInt(it && it.book, 10);
    if (Number.isInteger(n) && n >= 1 && n <= book.length) hit = book[n - 1];
    if (!hit) hit = byKey.get(norm(desc)) || null;
    if (hit) desc = hit.desc;
    return { desc, qty, priceCents: hit ? hit.priceCents : null, fromBook: !!hit };
  }).filter((i) => i.desc);
}

/**
 * images: [{ buffer, mimetype }] (photos and video frames, already resized by the page)
 * audios: [{ buffer, mimetype }] (voice note, short video)
 * docs:   the owner's saved documents (for the price book)
 */
async function analyzeJob({ type = "estimate", notes = "", images = [], audios = [], docs = [] }) {
  if (!ready()) { const e = new Error("The AI isn't set up on the server yet."); e.status = 503; throw e; }
  const said = [];
  for (const a of audios.slice(0, 3)) {
    try { const t = await transcribe(a); if (t) said.push(t); }
    catch (e) { console.error("[newark analyze] transcription failed:", e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message); }
  }
  const transcript = said.join("\n");
  const seen = images.length ? await seePhotos(images.slice(0, 12), [notes, transcript].filter(Boolean).join(" ")) : "";
  if (!notes && !transcript && !seen) { const e = new Error("Couldn't read the photos or the voice note. Try again, or type a few words about the job."); e.status = 422; throw e; }
  const book = priceBook(docs);
  const j = await draft(type, notes, transcript, seen, book);
  if (!j) { const e = new Error("The AI is busy right now. Try again in a minute."); e.status = 503; throw e; }
  const items = priceLines(j.items, book);
  return {
    title: noMoney(j.title).slice(0, 160),
    scope: noMoney(j.scope).slice(0, 1500),
    items,
    check: (Array.isArray(j.check) ? j.check : []).map((c) => noMoney(c).slice(0, 200)).filter(Boolean).slice(0, 3),
    transcript, seen,
    priced: items.filter((i) => i.fromBook).length,
    unpriced: items.filter((i) => !i.fromBook).length,
  };
}

module.exports = { analyzeJob, priceBook, priceLines, noMoney, ready, transcribe };
