// "Talk to type": a short voice clip becomes text for the owner's writing boxes. Owner PIN required.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const axios = require("axios");

Object.assign(process.env, { CHAT_BASE_URL: "https://llm.test/v1", CHAT_API_KEY: "k", CHAT_MODEL: "text-a" });
const PIN = "482913";
let stt = 0, sttText = "Replace the leaking fifty gallon water heater in the basement.";
axios.post = async (url, body) => {
  if (/functions\/v1\/newark/.test(url)) { const b = JSON.parse(body); return b.pin === PIN ? { status: 200, data: { ok: true, settings: {} } } : { status: 401, data: { ok: false } }; }
  if (/audio\/transcriptions$/.test(url)) { stt++; if (sttText === null) throw new Error("stt down"); return { data: { text: sttText } }; }
  throw new Error("unexpected call to " + url);
};

const { router: newark } = require("../routes/newark");
const app = express().set("trust proxy", true).use("/api/newark", newark);
let ipN = 0;
const send = (pin, buf, type = "audio/webm") => {
  let r = request(app).post("/api/newark/proposal/transcribe").set("x-forwarded-for", `10.9.0.${++ipN}`).field("pin", pin);
  if (buf) r = r.attach("audio", buf, { filename: "talk.webm", contentType: type });
  return r;
};
const CLIP = Buffer.alloc(4000, 1);

test("voice clip comes back as typed text", async () => {
  const r = await send(PIN, CLIP);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.match(r.body.text, /leaking fifty gallon water heater/);
  assert.equal(stt, 1);
});

test("needs the owner PIN", async () => {
  const before = stt;
  const r = await send("000000", CLIP);
  assert.equal(r.status, 401);
  assert.equal(stt, before);
});

test("empty or non-audio upload is refused politely", async () => {
  assert.equal((await send(PIN, null)).status, 400);
  assert.equal((await send(PIN, Buffer.alloc(100, 1))).status, 400);
  assert.equal((await send(PIN, CLIP, "image/png")).status, 400);
});

test("transcriber down -> friendly error, not a crash", async () => {
  sttText = null;
  const r = await send(PIN, CLIP);
  assert.equal(r.status, 502);
  assert.match(r.body.error, /Type it instead/);
});
