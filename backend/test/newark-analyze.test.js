// Photos / video / voice -> drafted estimate. The AI never sees prices; prices come only from the owner's own past lines.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");
const axios = require("axios");

let MongoMemoryServer;
try { ({ MongoMemoryServer } = require("mongodb-memory-server-core")); } catch (e) { /* optional */ }
const skip = !MongoMemoryServer && "mongodb-memory-server-core not installed";

Object.assign(process.env, { CHAT_BASE_URL: "https://llm.test/v1", CHAT_API_KEY: "k", CHAT_MODEL: "text-a,text-b" });
const PIN = "482913";
const seen = { stt: 0, vision: [], draft: [] };
let draftReply;
axios.post = async (url, body) => {
  if (/functions\/v1\/newark/.test(url)) { const b = JSON.parse(body); return b.pin === PIN ? { status: 200, data: { ok: true, settings: {} } } : { status: 401, data: { ok: false } }; }
  if (/audio\/transcriptions$/.test(url)) { seen.stt++; return { data: { text: "Fifty gallon gas water heater leaking from the bottom in the basement. Replace it and haul the old one away." } }; }
  if (/chat\/completions$/.test(url)) {
    const user = body.messages[1].content;
    if (Array.isArray(user)) {
      seen.vision.push(user.filter((c) => c.type === "image_url").length);
      return { data: { choices: [{ message: { content: "Photo 1: gas water heater, rust at the base, water on the floor. Label reads 50 gal. Asking $2,000." } }] } };
    }
    seen.draft.push({ model: body.model, sys: body.messages[0].content, user });
    if (body.model === "text-a") throw Object.assign(new Error("429"), { response: { status: 429, data: {} } });
    return { data: { choices: [{ message: { content: draftReply } }] } };
  }
  throw new Error("unexpected call to " + url);
};

const { priceBook, priceLines, noMoney } = require("../services/newarkJobAnalyze");
const { router: newark } = require("../routes/newark");
const app = express().set("trust proxy", true).use("/api/newark", newark);
const JPG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");

test("price book keeps the owner's latest price per line; matching never invents one", () => {
  const book = priceBook([
    { updatedAt: "2026-09-01", items: [{ desc: "Replace 50 gal gas water heater", priceCents: 170000 }, { desc: "Haul away old unit", priceCents: 0 }] },
    { updatedAt: "2026-10-01", items: [{ desc: "Replace 50 gal gas water heater", priceCents: 185000 }, { desc: "Permit fee", priceCents: 15000 }] },
  ]);
  assert.equal(book.length, 2);
  assert.equal(book.find((b) => /water heater/.test(b.desc)).priceCents, 185000);
  const lines = priceLines([{ desc: "replace 50 gal gas water heater!", qty: 1 }, { desc: "New expansion tank $300", qty: "1" }, { desc: "Item", book: 2 }], book);
  assert.equal(lines[0].priceCents, 185000);
  assert.equal(lines[1].priceCents, null);
  assert.doesNotMatch(lines[1].desc, /\$|300/);
  assert.equal(lines[2].desc, book[1].desc);
  assert.equal(noMoney("about $1,200.50 or 900 dollars"), "about or");
});

test("photos + voice -> draft: vision 3 photos at a time, prices only from his past lines", { skip }, async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    // a past job so there is a price book
    await request(app).post("/api/newark/proposal/save").send({ pin: PIN, doc: { customer: { company: "Old Customer" }, items: [{ desc: "Replace 50 gal gas water heater", price: "1850" }, { desc: "Haul away and dispose of old unit", price: "150" }] } });
    draftReply = JSON.stringify({ title: "Water heater replacement", scope: "Replace leaking unit. About $2,000.", check: ["Confirm gas line size"],
      items: [{ desc: "Replace 50 gal gas water heater", qty: 1, book: 1 }, { desc: "Haul away old unit", qty: 1, book: 2 }, { desc: "Install new expansion tank", qty: 1, book: null }] });
    let r = request(app).post("/api/newark/proposal/analyze").field("pin", PIN).field("type", "estimate").field("notes", "basement");
    for (let i = 0; i < 5; i++) r = r.attach("photos", JPG, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
    r = await r.attach("audio", Buffer.from("fakeaudio"), { filename: "note.webm", contentType: "audio/webm" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(seen.vision, [3, 2]);
    assert.equal(seen.stt, 1);
    const d = seen.draft[seen.draft.length - 1];
    assert.equal(d.model, "text-b"); // first model rate-limited, fell through
    assert.match(d.user, /haul the old one away/);
    assert.match(d.sys, /Replace 50 gal gas water heater/);
    assert.doesNotMatch(d.sys + d.user, /1850|1,850|18\.50|\$2,000/); // the AI never sees prices
    assert.equal(r.body.title, "Water heater replacement");
    assert.doesNotMatch(r.body.scope, /\$|2,000/);
    assert.deepEqual(r.body.items.map((i) => i.priceCents), [185000, 15000, null]);
    assert.equal(r.body.priced, 2); assert.equal(r.body.unpriced, 1);
    assert.deepEqual(r.body.check, ["Confirm gas line size"]);
    // owner only, and nothing to work from
    const no = await request(app).post("/api/newark/proposal/analyze").set("x-forwarded-for", "10.7.0.1").field("pin", "000000").attach("photos", JPG, "p.jpg");
    assert.equal(no.status, 401);
    const empty = await request(app).post("/api/newark/proposal/analyze").field("pin", PIN);
    assert.equal(empty.status, 400);
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});

test("saved photos come back with /get and are left out of /list", { skip }, async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    const src = "data:image/jpeg;base64," + JPG.toString("base64");
    const s = await request(app).post("/api/newark/proposal/save").send({ pin: PIN, doc: { customer: { company: "Pat" }, items: [{ desc: "Job", price: "100" }], photos: [{ src, caption: "Leak" }, { src: "javascript:alert(1)" }] } });
    const l = await request(app).post("/api/newark/proposal/list").send({ pin: PIN });
    assert.equal(l.body.items[0].photoCount, 1);
    assert.equal(l.body.items[0].doc.photos, undefined);
    const g = await request(app).post("/api/newark/proposal/get").send({ pin: PIN, id: s.body.id });
    assert.equal(g.body.doc.photos[0].caption, "Leak");
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});
