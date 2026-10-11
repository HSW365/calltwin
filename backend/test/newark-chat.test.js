// Website chat: must always answer, with or without an AI engine, and save a job only with a name + phone.
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");
const axios = require("axios");

for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CHAT_BASE_URL", "CHAT_MODEL", "CHAT_API_KEY"]) delete process.env[k];
process.env.NEWARK_API = "http://portal.test/newark";

const posts = [];
let portalOk = true, llm = null;
axios.post = async (url, body) => {
  posts.push({ url, body });
  if (url === process.env.NEWARK_API) return { data: portalOk ? { ok: true, ticket: "T-1" } : { ok: false, error: "down" } };
  if (llm) return llm(url, body);
  throw new Error("unexpected call to " + url);
};

const marcus = require("../services/marcusLocal");
const app = express().use("/chat", require("../routes/newarkChat"));
let ipn = 0;
const say = (messages) => request(app).post("/chat").set("x-forwarded-for", "10.0.0." + (++ipn % 250)).send({ messages, section: "Services" });

async function talk(lines) {
  const messages = []; let res;
  for (const line of lines) {
    messages.push({ role: "user", content: line });
    res = await say(messages);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    messages.push({ role: "assistant", content: res.body.reply });
  }
  return { res, messages };
}
const leads = () => posts.filter((p) => p.url === process.env.NEWARK_API);

test("reports ready with no AI key", async () => {
  const r = await request(app).get("/chat");
  assert.deepStrictEqual(r.body, { ok: true, ready: true, engines: ["built-in"] });
});

test("every starter question on the site gets a real answer", async () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../../newark/askbox.js"), "utf8");
  const chips = [...src.matchAll(/chips: \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.ok(chips.length >= 24, "found " + chips.length);
  for (const q of chips) {
    const r = await say([{ role: "user", content: q }]);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.engine, "built-in");
    assert.ok(!/don't have that answer/.test(r.body.reply), `no answer for: ${q}`);
    assert.ok(!/\$\d/.test(r.body.reply), "never quotes a price");
  }
  assert.strictEqual(leads().length, 0, "questions alone never create a job");
});

test("payment answers are Zelle only", async () => {
  for (const q of ["How do I pay with Zelle?", "Can I pay with a credit card?", "Do you take Cash App?", "How do I pay my bill?"]) {
    const r = await say([{ role: "user", content: q }]);
    assert.match(r.body.reply, /Zelle/, q);
    assert.ok(!/Zelle, Cash App/.test(r.body.reply), q);
  }
  assert.match((await say([{ role: "user", content: "Do you take Cash App?" }])).body.reply, /does not take Cash App or cards/);
});

test("a problem becomes a saved job: need, name, phone, town", async () => {
  posts.length = 0;
  const { res, messages } = await talk(["My kitchen sink is leaking under the cabinet", "my name is Maria Lopez", "(908) 555-0142", "Washington NJ"]);
  assert.match(messages[1].content, /your name/);
  assert.match(messages[3].content, /Thanks, Maria Lopez.*best number/);
  assert.match(messages[5].content, /town or address/);
  assert.match(res.body.reply, /owner has your details/);
  assert.strictEqual(res.body.saved, "T-1");
  assert.strictEqual(leads().length, 1);
  assert.deepStrictEqual(leads()[0].body, {
    a: "lead", name: "Maria Lopez", phone: "9085550142", address: "Washington NJ", service: "Plumbing",
    urgency: "Within 48 hours", details: "Website chat: My kitchen sink is leaking under the cabinet",
  });
});

test("a bad phone number is asked for again and nothing is saved", async () => {
  posts.length = 0;
  const { res } = await talk(["my furnace stopped working", "Dan", "call me at 555-0142"]);
  assert.match(res.body.reply, /10-digit/);
  assert.strictEqual(leads().length, 0);
});

test("name and number given together skip the phone question", async () => {
  posts.length = 0;
  const { res, messages } = await talk(["I need a new water heater installed", "Sam Reed 908 555 0199", "Phillipsburg"]);
  assert.match(messages[3].content, /town or address/);
  assert.strictEqual(res.body.saved, "T-1");
  assert.strictEqual(leads()[0].body.name, "Sam Reed");
  assert.strictEqual(leads()[0].body.phone, "9085550199");
  assert.strictEqual(leads()[0].body.service, "Plumbing", "a water heater is plumbing, not heating");
});

test("yes to a callback offer starts the request", async () => {
  posts.length = 0;
  const { res, messages } = await talk(["Do you work on water heaters?", "yes please", "Mine is 15 years old and rusty", "Ann", "9085550111", "Clinton"]);
  assert.match(messages[1].content, /call you back\?/);
  assert.match(messages[3].content, /what do you need help with/);
  assert.strictEqual(res.body.saved, "T-1");
  assert.strictEqual(leads()[0].body.details, "Website chat: Mine is 15 years old and rusty");
});

test("an unknown question is handed to the owner, with the question as the job note", async () => {
  posts.length = 0;
  const { res, messages } = await talk(["Do you offer financing over 24 months?", "yes", "Lee", "9085550123", "Easton"]);
  assert.match(messages[1].content, /don't have that answer/);
  assert.strictEqual(res.body.saved, "T-1");
  assert.strictEqual(leads()[0].body.details, "Website chat: Do you offer financing over 24 months?");
});

test("emergencies get the safety step first", async () => {
  posts.length = 0;
  assert.match((await say([{ role: "user", content: "a pipe burst and my basement is flooding" }])).body.reply, /908-454-4043 right now.*main water valve/);
  assert.match((await say([{ role: "user", content: "I smell gas in my kitchen" }])).body.reply, /Leave the building.*911/);
  assert.strictEqual(leads().length, 0);
});

test("Spanish visitors are served in Spanish", async () => {
  posts.length = 0;
  const { res, messages } = await talk(["Hola, necesito un plomero, tengo una fuga en el baño", "Me llamo Rosa Díaz", "908-555-0177", "Phillipsburg"]);
  assert.match(messages[1].content, /su nombre/);
  assert.match(res.body.reply, /El dueño tiene sus datos/);
  assert.strictEqual(leads()[0].body.name, "Rosa Díaz");
  assert.strictEqual(leads()[0].body.service, "Plumbing");
});

test("if the job does not save, Marcus says so and gives the phone number", async () => {
  posts.length = 0; portalOk = false;
  const { res } = await talk(["my toilet is clogged", "Pat", "9085550100", "Alpha"]);
  portalOk = true;
  assert.match(res.body.reply, /couldn't save.*908-454-4043/);
  assert.ok(!res.body.saved);
});

test("a second request in the same chat does not reuse the first one's details", async () => {
  posts.length = 0;
  const first = await talk(["my sink is leaking", "Maria", "9085550142", "Washington"]);
  const messages = first.messages;
  for (const line of ["also my boiler is not working", "Carlos", "9085550188", "Hackettstown"]) {
    messages.push({ role: "user", content: line });
    const r = await say(messages); messages.push({ role: "assistant", content: r.body.reply });
  }
  assert.strictEqual(leads().length, 2);
  assert.strictEqual(leads()[1].body.name, "Carlos");
  assert.strictEqual(leads()[1].body.service, "HVAC");
  assert.strictEqual(leads()[1].body.details, "Website chat: also my boiler is not working");
});

test("your own model server is used first when set, and the built-in answers cover it when it is down", async () => {
  process.env.CHAT_BASE_URL = "http://llm.test/v1/"; process.env.CHAT_MODEL = "llama3.1:8b";
  posts.length = 0;
  llm = async () => ({ data: { choices: [{ message: { content: "Yes, we do." } }] } });
  let r = await say([{ role: "user", content: "Do you install geothermal systems?" }]);
  assert.strictEqual(r.body.engine, "own");
  assert.strictEqual(r.body.reply, "Yes, we do.");
  assert.strictEqual(posts[0].url, "http://llm.test/v1/chat/completions");
  assert.strictEqual(posts[0].body.model, "llama3.1:8b");
  llm = async () => { throw new Error("ECONNREFUSED"); };
  r = await say([{ role: "user", content: "Do you install geothermal systems?" }]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.engine, "built-in");
  assert.match(r.body.reply, /ground-source/);
  delete process.env.CHAT_BASE_URL; delete process.env.CHAT_MODEL; llm = null;
});

test("stage is read from Marcus's own wording in both languages", () => {
  for (const l of ["en", "es"]) {
    const t = marcus.T[l];
    assert.strictEqual(marcus.stageOf(t.what), "what");
    assert.strictEqual(marcus.stageOf(t.name), "name");
    assert.strictEqual(marcus.stageOf(t.nameAgain), "name");
    assert.strictEqual(marcus.stageOf(t.phone("A")), "phone");
    assert.strictEqual(marcus.stageOf(t.phoneAgain), "phone");
    assert.strictEqual(marcus.stageOf(t.town), "town");
    assert.strictEqual(marcus.stageOf(t.done("A")), "done");
    assert.strictEqual(marcus.stageOf(t.offer), "offer");
    assert.strictEqual(marcus.stageOf(t.unknown), "offer");
  }
});
