// When the AI leg answers and drops at once (provider out of credits / down), the caller must fall
// through to the owner's cell and voicemail instead of being hung up on.
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const http = require("http");

const Client = require("../models/Client");
const fake = { _id: "abc123", businessName: "New Ark", ownerCell: "+12015550111", businessPhone: "+19085550122", forwardedLines: [] };
Client.findById = async () => fake;

const { router, aiDroppedCall, markHandoff } = require("../routes/inbound");

function post(port, path, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const req = http.request({ port, path, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve(d));
    });
    req.on("error", reject); req.end(body);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("instant AI drop rings the owner then takes a voicemail", async () => {
  const srv = express().use("/api/inbound", router).listen(0);
  const port = srv.address().port;
  try {
    markHandoff("CA-drop");
    const xml = await post(port, "/api/inbound/after-dial?c=abc123", { CallSid: "CA-drop", DialCallStatus: "completed", DialCallDuration: "0", To: "+18565550133" });
    assert.match(xml, /<Dial[^>]*>\+12015550111<\/Dial>/);
    assert.match(xml, /<Record /);
    assert.doesNotMatch(xml, /^<\?xml[^>]*><Response><Hangup\/><\/Response>$/);
  } finally { srv.close(); }
});

test("a real conversation with the AI still ends with a hang-up", async () => {
  const srv = express().use("/api/inbound", router).listen(0);
  const port = srv.address().port;
  try {
    markHandoff("CA-real");
    await sleep(3200);
    const xml = await post(port, "/api/inbound/after-dial?c=abc123", { CallSid: "CA-real", DialCallStatus: "completed", DialCallDuration: "3", To: "+18565550133" });
    assert.strictEqual(xml, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  } finally { srv.close(); }
});

test("drop detection edge cases", () => {
  assert.strictEqual(aiDroppedCall({ CallSid: "none", DialCallStatus: "completed" }), false);            // nothing known: assume handled
  assert.strictEqual(aiDroppedCall({ CallSid: "none", DialCallStatus: "completed", DialCallDuration: "0" }), true);
  assert.strictEqual(aiDroppedCall({ CallSid: "none", DialCallStatus: "completed", DialCallDuration: "45" }), false);
  assert.strictEqual(aiDroppedCall({ CallSid: "none", DialCallStatus: "busy", DialCallDuration: "0" }), false); // busy already falls back
});
