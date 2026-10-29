// "Get your AI call FREE": consent required, call placed, demo conversation, opt-out honored, follow-up emails.
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");
const axios = require("axios");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

for (const k of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[k];
Object.assign(process.env, {
  SIGNALWIRE_PROJECT_ID: "pid", SIGNALWIRE_API_TOKEN: "tok", SIGNALWIRE_SPACE: "x.signalwire.com",
  DEMO_FROM_NUMBER: "+18882067491", PUBLIC_BASE_URL: "https://ct.test",
  CHAT_BASE_URL: "https://api.groq.test/v1", CHAT_API_KEY: "k", CHAT_MODEL: "m1",
  SENDGRID_API_KEY: "SG.x", ALERT_FROM_EMAIL: "alerts@ct.test",
});

const calls = [], mail = [], ai = [];
let aiReply = "Thanks for calling Ark Plumbing! What's going on? ";
axios.get = async () => ({ data: "<title>Ark Plumbing</title><p>24/7 plumbing in Phillipsburg NJ</p>" });
axios.post = async (url, body) => {
  if (/groq/.test(url)) { ai.push(body); return { data: { choices: [{ message: { content: aiReply } }] } }; }
  if (/sendgrid/.test(url)) { mail.push(body); return { data: {} }; }
  throw new Error("unexpected " + url);
};

const svc = require("../services/demoCall");
svc._setClient({ calls: { create: async (o) => { calls.push(o); return { sid: "CA1" }; } } });
const DemoCall = require("../models/DemoCall");
const { router } = require("../routes/demoCall");
const app = express(); app.use("/api/demo-call", router);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let mongo;
test.before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
test.after(async () => { await mongoose.disconnect(); await mongo.stop(); });

const form = { name: "Joe", business: "Ark Plumbing", website: "ark-hvac.com", phone: "(908) 555-0142", email: "joe@ark.test", consent: true };

test("rejects without consent", async () => {
  const r = await request(app).post("/api/demo-call/request").send({ ...form, consent: false });
  assert.strictEqual(r.status, 400); assert.match(r.body.error, /box/);
  assert.strictEqual(calls.length, 0);
});

test("full demo call flow", async () => {
  const r = await request(app).post("/api/demo-call/request").send(form);
  assert.strictEqual(r.status, 200); assert.ok(r.body.id);
  await wait(250);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].to, "+19085550142"); assert.strictEqual(calls[0].from, "+18882067491");
  const id = r.body.id;
  const d = await DemoCall.findById(id); assert.match(d.siteText, /Phillipsburg/); assert.match(d.consentText, /AI-generated voice/);

  const a = await request(app).post(`/api/demo-call/answer?id=${id}`).type("form").send({ AnsweredBy: "human" });
  assert.match(a.text, /<Gather[^>]*input="speech"/); assert.match(a.text, /I'm an AI/);

  const t = await request(app).post(`/api/demo-call/turn?id=${id}`).type("form").send({ SpeechResult: "My water heater is leaking" });
  assert.match(t.text, /Ark Plumbing/); assert.match(ai[0].messages[0].content, /Phillipsburg/);

  aiReply = "Great, I'm sending the sign-up link now. Talk soon! [SIGNUP] [END]";
  const t2 = await request(app).post(`/api/demo-call/turn?id=${id}`).type("form").send({ SpeechResult: "yes set it up" });
  assert.match(t2.text, /<Hangup/); assert.doesNotMatch(t2.text, /\[/);

  await request(app).post(`/api/demo-call/status?id=${id}`).type("form").send({ CallStatus: "completed", CallDuration: "95" });
  await wait(250);
  const tos = mail.map((m) => m.personalizations[0].to[0].email);
  assert.ok(tos.includes("joe@ark.test")); assert.ok(tos.includes("hsw365media@gmail.com"));
  assert.ok(mail.some((m) => /WANTS TO SIGN UP/.test(m.subject)));
});

test("stop request opts the number out for good", async () => {
  const r = await request(app).post("/api/demo-call/request").send({ ...form, phone: "9085550199" });
  await wait(250);
  const t = await request(app).post(`/api/demo-call/turn?id=${r.body.id}`).type("form").send({ SpeechResult: "don't call me again" });
  assert.match(t.text, /won't call this number again/); assert.match(t.text, /<Hangup/);
  const again = await request(app).post("/api/demo-call/request").set("x-forwarded-for", "9.9.9.9").send({ ...form, phone: "9085550199" });
  assert.strictEqual(again.status, 400); assert.match(again.body.error, /not to be called/);
});
