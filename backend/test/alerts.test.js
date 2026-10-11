// Every job alert goes out by text AND email together; either one landing counts as delivered.
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");
const axios = require("axios");

for (const k of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SENDGRID_API_KEY", "ESTIMATE_FROM_EMAIL", "ALERT_FROM_EMAIL", "NEWARK_OWNER_EMAIL"]) delete process.env[k];
Object.assign(process.env, { SIGNALWIRE_PROJECT_ID: "pid", SIGNALWIRE_API_TOKEN: "tok", SIGNALWIRE_SPACE: "x.signalwire.com", SIGNALWIRE_PHONE_NUMBER: "+18565550100", NEWARK_HOOK_KEY: "hook" });

const sent = { sms: [], mail: [] };
let smsUp = true, mailUp = true;
axios.post = async (url, body) => {
  if (/signalwire\.com/.test(url)) {
    if (!smsUp) throw Object.assign(new Error("422"), { response: { status: 422, data: { code: "21717", message: "From must belong to an active campaign." } } });
    sent.sms.push(Object.fromEntries(new URLSearchParams(body))); return { data: { sid: "SM1" } };
  }
  if (/sendgrid\.com/.test(url)) {
    if (!mailUp) throw Object.assign(new Error("401"), { response: { status: 401, data: {} } });
    sent.mail.push(body); return { data: {} };
  }
  throw new Error("unexpected call to " + url);
};
const reset = () => { sent.sms.length = 0; sent.mail.length = 0; smsUp = true; mailUp = true; };
const mailOn = () => Object.assign(process.env, { SENDGRID_API_KEY: "SG.x", ESTIMATE_FROM_EMAIL: "alerts@calltwin.test" });
const mailOff = () => { delete process.env.SENDGRID_API_KEY; delete process.env.ESTIMATE_FROM_EMAIL; };

const mailer = require("../services/mailer");
const { router: newark } = require("../routes/newark");
const { alertOwner } = require("../routes/clients");
const app = express().use("/api/newark", newark);
const notify = (b) => request(app).post("/api/newark/notify").set("x-newark-key", "hook").send(b);
const JOB = "New Ark web request: Maria Lopez 908-555-0142\nPlumbing / Emergency\n12 Main St, Phillipsburg\nWebsite chat: water heater leaking\nCall back: tel:9085550142";
const owner = { businessName: "Jerry's HVAC", ownerCell: "+18565550111", ownerEmail: "jerry@example.com", alertSms: true };

test("a job goes out by text and email at the same time", async () => {
  reset(); mailOn();
  const r = await alertOwner(owner, JOB);
  assert.deepStrictEqual(r, { texted: true, emailed: true });
  assert.strictEqual(sent.sms[0].To, "+18565550111");
  const m = sent.mail[0];
  assert.strictEqual(m.personalizations[0].to[0].email, "jerry@example.com");
  assert.strictEqual(m.subject, "New Ark web request: Maria Lopez 908-555-0142");
  assert.match(m.content[0].value, /water heater leaking/);
  assert.match(m.content[1].value, /href="tel:9085550142"/);
});

test("text blocked by the carrier: the email still delivers the job", async () => {
  reset(); mailOn(); smsUp = false;
  assert.deepStrictEqual(await alertOwner(owner, JOB), { texted: false, emailed: true });
  assert.strictEqual(sent.mail.length, 1);
});

test("email down or not set up: the text still goes, nothing throws", async () => {
  reset(); mailOn(); mailUp = false;
  assert.deepStrictEqual(await alertOwner(owner, JOB), { texted: true, emailed: false });
  reset(); mailOff();
  assert.strictEqual(mailer.emailReady(), false);
  assert.deepStrictEqual(await alertOwner(owner, JOB), { texted: true, emailed: false });
});

test("text alerts switched off: no text, email still sent; no email on file: text only", async () => {
  reset(); mailOn();
  assert.deepStrictEqual(await alertOwner({ ...owner, alertSms: false }, JOB), { texted: false, emailed: true });
  assert.strictEqual(sent.sms.length, 0);
  reset();
  assert.deepStrictEqual(await alertOwner({ ...owner, ownerEmail: "" }, JOB), { texted: true, emailed: false });
  assert.strictEqual(sent.mail.length, 0);
});

test("New Ark notify: both channels, and success when only one lands", async () => {
  reset(); mailOn(); process.env.NEWARK_OWNER_EMAIL = "owner@newark.test";
  let r = await notify({ to: "2015550111", body: JOB });
  assert.deepStrictEqual(r.body, { ok: true, sid: "SM1", texted: true, emailed: true });
  assert.strictEqual(sent.mail[0].personalizations[0].to[0].email, "owner@newark.test");
  reset(); smsUp = false;
  r = await notify({ to: "2015550111", body: JOB });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body, { ok: true, texted: false, emailed: true });
  reset(); smsUp = false; mailUp = false;
  r = await notify({ to: "2015550111", body: JOB });
  assert.strictEqual(r.status, 502);
  assert.match(r.body.error, /active campaign/);
  delete process.env.NEWARK_OWNER_EMAIL;
});

test("New Ark notify still needs the key, and works exactly as before with no email set up", async () => {
  reset(); mailOff();
  assert.strictEqual((await request(app).post("/api/newark/notify").send({ to: "2015550111", body: "x" })).status, 401);
  const r = await notify({ to: "2015550111", body: JOB });
  assert.deepStrictEqual(r.body, { ok: true, sid: "SM1", texted: true, emailed: false });
  assert.strictEqual((await notify({ body: JOB })).status, 400);
});

test("alert email escapes what a caller typed and reports status without leaking addresses", async () => {
  const html = mailer.alertHtml("A&B <Plumbing>", "EMERGENCY New call: <script>x</script>\nCall back: tel:19085550142");
  assert.ok(!/<script>/.test(html));
  assert.match(html, /A&amp;B &lt;Plumbing&gt;/);
  assert.match(html, /Call back \(908\) 555-0142/);
  reset(); mailOn(); mailUp = false;
  await mailer.sendEmail("jerry@example.com", "s", "t");
  const st = mailer.status();
  assert.strictEqual(st.provider, "sendgrid");
  assert.ok(st.last_error && !/@/.test(JSON.stringify(st)));
  mailOff();
});

test("Gmail sender: app password with spaces is accepted and the mailbox is the From address", () => {
  Object.assign(process.env, { GMAIL_USER: "me@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" });
  assert.strictEqual(mailer.provider(), "gmail");
  assert.strictEqual(mailer.emailReady(), true);
  delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD;
});
