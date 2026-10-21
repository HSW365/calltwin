// NFPA sprinkler forms (3, 4, 5, 6) as built-in templates: owner only, AI fills only what the job shows, never signatures.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");
const axios = require("axios");

let MongoMemoryServer;
try { ({ MongoMemoryServer } = require("mongodb-memory-server-core")); } catch (e) { /* optional */ }
const skip = !MongoMemoryServer && "mongodb-memory-server-core not installed";

for (const k of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SENDGRID_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[k];
Object.assign(process.env, { CHAT_BASE_URL: "https://llm.test/v1", CHAT_API_KEY: "k", CHAT_MODEL: "text-a" });
const PIN = "482913";
const seen = { stt: 0, vision: 0, fill: [] };
let fillReply;
axios.post = async (url, body) => {
  if (/functions\/v1\/newark/.test(url)) { const b = JSON.parse(body); return b.pin === PIN ? { status: 200, data: { ok: true, settings: { owner_email: "joe@newark.test" } } } : { status: 401, data: { ok: false } }; }
  if (/audio\/transcriptions$/.test(url)) { seen.stt++; return { data: { text: "Annual on the wet system. Main drain static seventy two residual fifty eight. Gong works." } }; }
  if (/chat\/completions$/.test(url)) {
    const user = body.messages[1].content;
    if (Array.isArray(user)) { seen.vision++; return { data: { choices: [{ message: { content: "Photo 1: OS&Y valve, stem out, chained and locked. Photo 2: FDC, left cap missing. Gauge reads 72 psi." } }] } }; }
    seen.fill.push({ sys: body.messages[0].content, user });
    return { data: { choices: [{ message: { content: fillReply } }] } };
  }
  if (/sendgrid\.com/.test(url)) { mailBox.push(body); return { data: {} }; }
  throw new Error("unexpected call to " + url);
};
const mailBox = [];

const F = require("../services/newarkNfpaForms");
const { renderNfpaPdf } = require("../services/newarkNfpaPdf");
const M = require("../services/newarkProposalMath");
const { router: newark } = require("../routes/newark");
const app = express().set("trust proxy", true).use("/api/newark", newark);
const JPG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
let ipN = 0;
const post = (path, body) => request(app).post("/api/newark/proposal" + path).set("x-forwarded-for", `10.9.0.${++ipN}`).send({ pin: PIN, ...body });

test("all four forms are built in, with the paper form's lines", () => {
  assert.deepEqual(F.ORDER, ["form6", "form5", "form4", "form3"]);
  const ids = (t) => F.fields(F.TEMPLATES[t]).map((f) => f.id);
  for (const t of F.ORDER) { const a = ids(t); assert.equal(new Set(a).size, a.length, `${t} has duplicate field ids`); }
  const w = F.fields(F.TEMPLATES.form6);
  assert.ok(w.find((f) => f.label === "Retard chamber/alarm drains not leaking"));
  assert.ok(w.find((f) => f.id === "tqStatic" && f.unit === "psi"));
  assert.ok(F.fields(F.TEMPLATES.form5).find((f) => f.label === "FDC clapper is functional"));
  assert.ok(F.fields(F.TEMPLATES.form4).find((f) => f.id === "sprinklers" && f.cols.length === 6));
  assert.ok(F.fields(F.TEMPLATES.form3).find((f) => f.id === "flushOpening" && f.options.includes("Hydrant butt")));
});

test("saved values are checked against the form: only real fields, only allowed answers", () => {
  const f = F.normalizeForm({ template: "form6", values: { gauges: "Y", cvPosition: "N/A", fdcPlugs: "maybe", hacked: "x", covers: ["Annual", "Weekly"], tqStatic: "72" }, ai: { gauges: "photo 1", hacked: "x" } });
  assert.equal(f.values.gauges, "yes");
  assert.equal(f.values.cvPosition, "na");
  assert.equal(f.values.fdcPlugs, undefined);
  assert.equal(f.values.hacked, undefined);
  assert.deepEqual(f.values.covers, ["Annual"]);
  assert.deepEqual(Object.keys(f.ai), ["gauges"]);
  assert.equal(F.normalizeForm({ template: "nope" }).template, "form6");
  const p = F.progress(f);
  assert.equal(p.done, 2);
  assert.equal(p.boxes, p.done + p.open);
});

test("every form renders a PDF, filled or blank", async () => {
  for (const t of F.ORDER) {
    const buf = await renderNfpaPdf(F.normalizeForm({ template: t, values: { propertyName: "Export Street", gauges: "yes", sprinklers: [{ make: "Viking", qty: "48" }] } }), { ...M.COMPANY });
    assert.equal(buf.slice(0, 5).toString(), "%PDF-", t);
  }
});

test("every form route is owner only", async () => {
  for (const p of ["/forms/templates", "/forms/list", "/forms/save", "/forms/pdf", "/forms/email", "/forms/get", "/forms/delete"]) {
    const r = await request(app).post("/api/newark/proposal" + p).set("x-forwarded-for", `10.8.0.${++ipN}`).send({ pin: "000000", form: { template: "form6" } });
    assert.equal(r.status, 401, p);
  }
  const a = await request(app).post("/api/newark/proposal/forms/analyze").set("x-forwarded-for", "10.8.1.1").field("pin", "000000").field("template", "form6").attach("photos", JPG, "p.jpg");
  assert.equal(a.status, 401);
});

test("photos + voice fill the boxes the job shows; signatures, license and unknown answers are dropped", async () => {
  fillReply = JSON.stringify({
    values: { cvPosition: "yes", cvSealed: "yes", fdcPlugs: "no", tqGong: "yes", taMainDrain: "yes", taStatic: "72", taResidual: "about", covers: ["Annual"],
      signature: "Joe Hernandez", license: "P01631", signDate: "10/20/2026", spBulbs: "probably", notAField: "yes" },
    why: { cvPosition: "photo 1: OS&Y stem out", fdcPlugs: "photo 2: left cap missing", taStatic: "said: static seventy two" },
    check: ["Confirm the residual reading"], comments: "FDC left inlet cap missing.",
  });
  let r = request(app).post("/api/newark/proposal/forms/analyze").field("pin", PIN).field("template", "form6").field("notes", "annual");
  for (let i = 0; i < 4; i++) r = r.attach("photos", JPG, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
  r = await r.attach("audio", Buffer.from("fakeaudio"), { filename: "note.webm", contentType: "audio/webm" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(seen.stt, 1);
  assert.equal(seen.vision, 2); // 4 photos, 3 per look
  const sys = seen.fill[0].sys;
  assert.match(sys, /Never fill signatures/);
  assert.match(sys, /cvPosition: "yes" \| "no" \| "na"/);
  assert.doesNotMatch(sys, /^signature:/m); // signature fields are never offered to the AI
  assert.doesNotMatch(sys, /^license:/m);
  const v = r.body.values;
  assert.equal(v.cvPosition, "yes");
  assert.equal(v.fdcPlugs, "no");
  assert.equal(v.taStatic, "72");
  assert.equal(v.taResidual, undefined); // a reading must be a number
  assert.equal(v.spBulbs, undefined);
  for (const k of ["signature", "license", "signDate", "notAField"]) assert.equal(v[k], undefined, k);
  assert.equal(r.body.why.cvPosition, "photo 1: OS&Y stem out");
  assert.ok(r.body.why.tqGong); // every answer carries a reason
  assert.equal(r.body.comments, "FDC left inlet cap missing.");
  assert.deepEqual(r.body.check, ["Confirm the residual reading"]);

  const none = await request(app).post("/api/newark/proposal/forms/analyze").field("pin", PIN).field("template", "form6");
  assert.equal(none.status, 400);
  const badT = await request(app).post("/api/newark/proposal/forms/analyze").field("pin", PIN).field("template", "form99").field("notes", "x");
  assert.equal(badT.status, 400);
});

test("forms save, list, number, reopen, email and delete", { skip }, async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const yr = new Date().getFullYear();
  try {
    await post("/save", { doc: { customer: { company: "Export Street Warehouse", address: "118 Export St", city: "Newark, NJ", email: "fm@export.test" }, items: [{ desc: "Annual inspection", price: "450" }] } });
    let r = await post("/forms/templates", {});
    assert.equal(r.body.templates.length, 4);
    assert.equal(r.body.next, `F${yr}-001`);
    assert.equal(r.body.customers[0].name, "Export Street Warehouse");
    assert.equal(r.body.customers[0].email, "fm@export.test");
    const form = { template: "form5", values: { propertyName: "Export Street Warehouse", gauges: "yes", taTrip: [{ water: "60", tripSec: "42" }] }, ai: { gauges: "photo 1" } };
    r = await post("/forms/save", { form });
    assert.equal(r.body.number, `F${yr}-001`);
    assert.equal(r.body.done, 1);
    const id = r.body.id;
    r = await post("/forms/list", {});
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].template, "form5");
    assert.equal(r.body.items[0].property, "Export Street Warehouse");
    assert.equal(r.body.items[0].fromAi, 1);
    assert.equal(r.body.next, `F${yr}-002`);
    r = await post("/list", {}); // the proposals list is unaffected by forms
    assert.equal(r.body.items.length, 1);
    r = await post("/forms/get", { id });
    assert.equal(r.body.form.values.taTrip[0].water, "60");
    const pdf = await post("/forms/pdf", { form: r.body.form }).buffer(true).parse((res, cb) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers["content-disposition"], /Form-5-Dry-pipe-inspection-Export-Street-Warehouse/);
    r = await post("/forms/email", { form: r.body.form, to: "fm@export.test" });
    assert.equal(r.status, 503);
    Object.assign(process.env, { SENDGRID_API_KEY: "SG.x", ESTIMATE_FROM_EMAIL: "alerts@calltwin.test" });
    r = await post("/forms/email", { form: form, to: "fm@export.test" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const m = mailBox.pop();
    assert.equal(m.reply_to.email, "joe@newark.test");
    assert.match(m.subject, /Form 5 Dry pipe inspection - Export Street Warehouse/);
    assert.equal(Buffer.from(m.attachments[0].content, "base64").slice(0, 5).toString(), "%PDF-");
    await post("/forms/delete", { id });
    r = await post("/forms/list", {});
    assert.equal(r.body.items.length, 0);
  } finally {
    delete process.env.SENDGRID_API_KEY; delete process.env.ESTIMATE_FROM_EMAIL;
    await mongoose.disconnect(); await mongo.stop();
  }
});
