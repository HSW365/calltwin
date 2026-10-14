// A voicemail becomes a job ticket: name, number, address, service needed.
const test = require("node:test");
const assert = require("node:assert");

Object.assign(process.env, { CHAT_BASE_URL: "https://llm.test/v1", CHAT_API_KEY: "k", CHAT_MODEL: "m1,m2" });
const calls = [];
global.fetch = async (url, opts = {}) => {
  calls.push(url);
  if (/recording/.test(url)) return { ok: true, arrayBuffer: async () => new Uint8Array(5000).buffer };
  if (/audio\/transcriptions/.test(url)) return { ok: true, json: async () => ({ text: "Hi this is Maria Lopez, my number is 908 555 0142, I'm at 12 Main Street Phillipsburg, my water heater is leaking all over the basement, please call ASAP." }) };
  if (/chat\/completions/.test(url)) {
    const model = JSON.parse(opts.body).model;
    if (model === "m1") return { ok: false, status: 429, text: async () => "rate" };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ name: "Maria Lopez", phone: "908-555-0142", address: "12 Main Street, Phillipsburg", service: "Water heater leaking", urgent: true }) } }] }) };
  }
  throw new Error("unexpected " + url);
};

const vm = require("../services/voicemailNotes");

test("voicemail is written out and turned into a job ticket", async () => {
  const n = await vm.notesFor("https://x.signalwire.com/recording/RE1");
  assert.strictEqual(n.name, "Maria Lopez");
  assert.strictEqual(n.phone, "9085550142");
  assert.strictEqual(n.address, "12 Main Street, Phillipsburg");
  assert.strictEqual(n.service, "Water heater leaking");
  assert.ok(calls.some((u) => /\.mp3$/.test(u)));
  const t = vm.alertText("New Ark", "+19085559999", "https://x.signalwire.com/recording/RE1", n);
  const lines = t.split("\n");
  assert.strictEqual(lines[0], "EMERGENCY: New job for New Ark: Water heater leaking");
  assert.ok(lines.includes("Name: Maria Lopez"));
  assert.ok(lines.includes("Phone: 908-555-0142"));
  assert.ok(lines.includes("Address: 12 Main Street, Phillipsburg"));
  assert.ok(lines.includes("Service needed: Water heater leaking"));
  assert.ok(lines.includes("Called from: 908-555-9999"));
  assert.ok(lines.includes("Call back: tel:9085550142"));
});

test("if the AI can't help, the alert still has the caller's number and the recording", async () => {
  const t = vm.alertText("New Ark", "+19085559999", "https://x/recording/RE2", {});
  assert.match(t, /^New job for New Ark: voicemail/);
  assert.match(t, /Phone: 908-555-9999/);
  assert.match(t, /Name: not given/);
  assert.match(t, /Listen: https:\/\/x\/recording\/RE2\.mp3/);
});
