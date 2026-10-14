// Estimates & Proposals on the New Ark site is owner only: the portal PIN must check out before the workspace link is handed back.
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");
const axios = require("axios");

delete process.env.CALLTWIN_SITE;
const GOOD_PIN = "482913";
let supabaseUp = true;
axios.post = async (url, body) => {
  if (/functions\/v1\/newark/.test(url)) {
    if (!supabaseUp) throw new Error("ECONNRESET");
    const b = JSON.parse(body);
    if (b.a !== "login") throw new Error("unexpected action " + b.a);
    return { status: b.pin === GOOD_PIN ? 200 : 401, data: b.pin === GOOD_PIN ? { ok: true, settings: {} } : { ok: false, error: "Wrong PIN" } };
  }
  throw new Error("unexpected call to " + url);
};

const estimate = require("../estimate/routes");
let siteHit = { client: { portalKey: "pk_newark_abc" }, s: {} };
estimate.settingsBySite = async (id) => (id === "newark" ? siteHit : null);

const { router: newark } = require("../routes/newark");
const app = express().set("trust proxy", true).use("/api/newark", newark);
let n = 0;
const ask = (pin) => request(app).post("/api/newark/estimates-access").set("x-forwarded-for", `10.0.0.${++n}`).set("Origin", "https://ark-hvac.com").send({ pin });

test("the right PIN gets the owner's private estimates link", async () => {
  const r = await ask(GOOD_PIN);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.url, "https://hsw365.github.io/calltwin/estimate.html?k=pk_newark_abc");
  assert.strictEqual(r.headers["access-control-allow-origin"], "https://ark-hvac.com");
  assert.strictEqual(r.headers["cache-control"], "no-store");
});

test("a wrong or missing PIN gets nothing", async () => {
  for (const pin of ["000000", "", "abc123", undefined]) {
    const r = await ask(pin);
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.body.url, undefined);
  }
});

test("repeated wrong PINs from one address are locked out, even the right PIN after", async () => {
  const call = (pin) => request(app).post("/api/newark/estimates-access").set("x-forwarded-for", "10.9.9.9").send({ pin });
  for (let i = 0; i < 6; i++) assert.strictEqual((await call("111111")).status, 401);
  const r = await call(GOOD_PIN);
  assert.strictEqual(r.status, 429);
  assert.strictEqual(r.body.url, undefined);
});

test("other websites can't read the response", async () => {
  const r = await request(app).post("/api/newark/estimates-access").set("Origin", "https://evil.example").send({ pin: GOOD_PIN });
  assert.strictEqual(r.headers["access-control-allow-origin"], undefined);
});

test("portal down or estimates off: clear message, no link", async () => {
  supabaseUp = false;
  let r = await ask(GOOD_PIN);
  assert.strictEqual(r.status, 502);
  supabaseUp = true;
  siteHit = null;
  r = await ask(GOOD_PIN);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.url, undefined);
});
