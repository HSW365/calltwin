// New Ark proposal maker: owner only, exact money math, branded PDF, email with the PDF attached, AI writes words but never numbers.
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
Object.assign(process.env, { CHAT_BASE_URL: "https://llm.test/v1", CHAT_MODEL: "m1" });

const PIN = "482913";
const mail = [];
let aiReply = JSON.stringify({ title: "Sprinkler system installation", scope: "Install new sprinkler heads. Total $9,500.00 due." });
axios.post = async (url, body, opts) => {
  if (/functions\/v1\/newark/.test(url)) {
    const b = JSON.parse(body);
    return b.pin === PIN ? { status: 200, data: { ok: true, settings: { owner_email: "joe@newark.test" } } } : { status: 401, data: { ok: false } };
  }
  if (/llm\.test/.test(url)) {
    const sys = body.messages[0].content, usr = body.messages[1].content;
    assert.match(sys, /Never write any price/);
    assert.doesNotMatch(usr, /\$|7500|7,500/); // the AI is never shown prices
    return { data: { choices: [{ message: { content: aiReply } }] } };
  }
  if (/sendgrid\.com/.test(url)) { mail.push(body); return { data: {} }; }
  throw new Error("unexpected call to " + url);
};

const M = require("../services/newarkProposalMath");
const { router: newark } = require("../routes/newark");
const app = express().set("trust proxy", true).use("/api/newark", newark);
let ipN = 0;
const post = (path, body) => request(app).post("/api/newark/proposal" + path).set("x-forwarded-for", `10.1.0.${++ipN}`).send({ pin: PIN, ...body });

const JOB = {
  type: "invoice", number: "10112026", date: "2026-10-11",
  customer: { company: "FTF Construction", contact: "Fred Barney", address: "43 Mountain Ave.", city: "Warren, NJ", phone: "908-507-0716", email: "fred@ftf.test" },
  jobsite: "118 Export Street, Newark, NJ",
  items: [{ desc: "Installed sprinkler system as per drawings", price: "7,500" }, { desc: "Air and hydraulic testing (extra work)", price: "$2,000.00" }],
  payments: [{ label: "Amount due and paid", amount: "5000" }],
};

test("money math is exact, in cents, from the owner's numbers", () => {
  const d = M.normalize(JOB);
  assert.deepEqual(d.totals, { subtotalCents: 950000, taxCents: 0, totalCents: 950000, paidCents: 500000, balanceCents: 450000 });
  const t = M.normalize({ items: [{ desc: "Pipe", qty: "3", price: "125.50" }, { desc: "Labor", price: "0.10" }, { desc: "Labor", price: "0.20" }], taxPct: "6.625" }).totals;
  assert.equal(t.subtotalCents, 37680);
  assert.equal(t.taxCents, 2496); // 376.80 * 6.625% = 24.963 -> 24.96
  assert.equal(t.totalCents, 40176);
  assert.equal(M.money(-500000), "($5,000.00)");
  assert.equal(M.toCents("(1,250.5)"), -125050);
});

test("every proposal route is owner only", async () => {
  for (const p of ["/list", "/save", "/pdf", "/email", "/writeup"]) {
    const r = await request(app).post("/api/newark/proposal" + p).set("x-forwarded-for", `10.2.0.${++ipN}`).send({ pin: "000000", doc: JOB });
    assert.equal(r.status, 401, p);
  }
});

test("PDF comes back for the owner, branded and priced", async () => {
  const r = await post("/pdf", { doc: JOB }).buffer(true).parse((res, cb) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "application/pdf");
  assert.equal(r.body.slice(0, 5).toString(), "%PDF-");
  assert.match(r.headers["content-disposition"], /New-Ark-Plumbing-Invoice-10112026\.pdf/);
  const empty = await post("/pdf", { doc: { ...JOB, items: [] } });
  assert.equal(empty.status, 400);
});

test("AI writes the heading and scope but any dollar amount it slips in is removed", async () => {
  const r = await post("/writeup", { type: "proposal", notes: "installed sprinklers to existing system per drawings", items: JOB.items.map((i) => ({ desc: i.desc })) });
  assert.equal(r.status, 200);
  assert.equal(r.body.ai, true);
  assert.equal(r.body.title, "Sprinkler system installation");
  assert.doesNotMatch(r.body.scope, /\$|9,500|\.00/);
  aiReply = "not json";
  const fb = await post("/writeup", { notes: "replace water heater", items: [{ desc: "50 gal gas water heater" }] });
  assert.equal(fb.body.ai, false);
  assert.equal(fb.body.title, "Replace water heater");
});

test("save, list, reuse numbering, letterhead and delete", { skip }, async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    let r = await post("/list", {});
    assert.equal(r.body.next, `${new Date().getFullYear()}-001`);
    r = await post("/save", { doc: { ...JOB, number: "" } });
    assert.equal(r.body.ok, true);
    assert.equal(r.body.number, `${new Date().getFullYear()}-001`);
    assert.equal(r.body.totals.balanceCents, 450000);
    const id = r.body.id;
    r = await post("/save", { id, doc: { ...JOB, number: r.body.number, items: [...JOB.items, { desc: "Permit", price: "150" }] } });
    assert.equal(String(r.body.id), String(id));
    r = await post("/list", {});
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].totalCents, 965000);
    assert.equal(r.body.next, `${new Date().getFullYear()}-002`);
    r = await post("/letterhead", { company: { name: "Ark Fire Protection Services", fax: "" } });
    assert.equal(r.body.company.name, "Ark Fire Protection Services");
    assert.equal(r.body.company.fax, M.COMPANY.fax);
    r = await post("/list", {});
    assert.equal(r.body.company.name, "Ark Fire Protection Services");
    await post("/delete", { id });
    r = await post("/list", {});
    assert.equal(r.body.items.length, 0);
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});

test("email goes to the customer with the PDF attached and replies go to the owner", { skip }, async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    let r = await post("/email", { doc: JOB, to: "fred@ftf.test" });
    assert.equal(r.status, 503); // no mail provider configured
    Object.assign(process.env, { SENDGRID_API_KEY: "SG.x", ESTIMATE_FROM_EMAIL: "alerts@calltwin.test" });
    r = await post("/email", { doc: JOB, to: "not-an-email" });
    assert.equal(r.status, 400);
    r = await post("/email", { doc: JOB, to: "fred@ftf.test" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const m = mail.pop();
    assert.equal(m.personalizations[0].to[0].email, "fred@ftf.test");
    assert.equal(m.reply_to.email, "joe@newark.test");
    assert.equal(m.attachments[0].type, "application/pdf");
    assert.equal(Buffer.from(m.attachments[0].content, "base64").slice(0, 5).toString(), "%PDF-");
    assert.match(m.content[0].value, /Balance due: \$4,500\.00/);
  } finally {
    delete process.env.SENDGRID_API_KEY; delete process.env.ESTIMATE_FROM_EMAIL;
    await mongoose.disconnect(); await mongo.stop();
  }
});
