// End-to-end: CallTwin call -> AI intake -> analysis -> estimate -> approval -> proposal -> e-sign -> deposit -> schedule.
// Runs against an in-memory MongoDB. Outbound SMS/email/AI calls are not made (no credentials in the test env).
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");

let MongoMemoryServer;
try { ({ MongoMemoryServer } = require("mongodb-memory-server-core")); } catch (e) { /* optional */ }

for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "SIGNALWIRE_PROJECT_ID", "SIGNALWIRE_API_TOKEN", "SENDGRID_API_KEY", "STRIPE_SECRET_KEY", "ELEVENLABS_API_KEY"]) delete process.env[k];
process.env.JWT_SECRET = "test-secret";
process.env.CALLTWIN_SITE = "https://example.test/calltwin";

const Client = require("../../models/Client");
const { EstimateJob, EstimateAudit } = require("../models");
const { router: estimateRoutes } = require("../routes");
const { router: clientRoutes } = require("../../routes/clients");
const { PROVIDERS } = require("../ai");

let mongo, app, owner, other;
const dollars = (d) => Math.round(d * 100);

test.before(async () => {
  if (!MongoMemoryServer) return;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = express();
  app.use("/api/clients", clientRoutes);
  app.use("/api/estimates", estimateRoutes);
  owner = await Client.create({ businessName: "New Ark Plumbing", ownerName: "Joe", ownerEmail: "joe@example.com", ownerCell: "+15555550100", portalKey: "portal-owner-key-123456", hookKey: "hook-key-123456", status: "active", aiNumber: "+15555550199" });
  other = await Client.create({ businessName: "Other Co", ownerName: "Ann", ownerEmail: "ann@example.com", ownerCell: "+15555550111", portalKey: "portal-other-key-123456", hookKey: "hook-other-123456", status: "active" });
});
test.after(async () => { if (mongo) { await mongoose.disconnect(); await mongo.stop(); } });

const O = { "x-portal-key": "portal-owner-key-123456" };
const X = { "x-portal-key": "portal-other-key-123456" };

test("full contractor workflow", { skip: !MongoMemoryServer && "mongodb-memory-server-core not installed" }, async (t) => {
  let r = await request(app).get("/api/estimates/me").set(O);
  assert.equal(r.status, 200);
  assert.equal(r.body.addon.active, false);

  // Add-on off: calls don't create estimates, and features are gated.
  r = await request(app).post("/api/estimates/jobs").set(O).send({ name: "Test" });
  assert.equal(r.status, 402);

  r = await request(app).post("/api/estimates/addon/start").set(O).send({});
  assert.equal(r.body.addon.status, "trial");

  r = await request(app).put("/api/estimates/settings").set(O).send({
    company: { name: "New Ark Plumbing LLC", phone: "555-555-0100", license: "NJ-12345", brandColor: "#22d3ee" },
    pricing: { taxRatePct: 6.625, materialMarkupPct: 25, equipmentMarkupPct: 10, serviceCallFeeCents: dollars(89), emergencyFeeCents: dollars(150), emergencyLaborPct: 50, defaultDepositPct: 30 },
    laborRates: [{ key: "standard", name: "Standard plumber", rateCents: dollars(125) }],
    priceBook: [
      { sku: "wh-50g", name: "50 gal gas water heater", kind: "equipment", unit: "each", costCents: dollars(800) },
      { sku: "FLEX", name: "Flex connector kit", kind: "material", unit: "each", costCents: dollars(20), priceCents: dollars(45) },
    ],
    services: [{ name: "Water heater replacement", laborKey: "standard", laborHours: 4, items: [{ sku: "WH-50G", qty: 1 }, { sku: "FLEX", qty: 1 }], timeline: "Same day, about 4 hours" }],
    terms: "Standard terms.", warranty: "1 year labor.",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.settings.priceBook[0].sku, "WH-50G");

  // CallTwin's AI receptionist saves a job ticket -> draft estimate is created automatically.
  r = await request(app).post("/api/clients/lead").set("x-client-key", "hook-key-123456").send({
    name: "John Smith", phone: "(555) 555-0123", service: "Water heater replacement", urgency: "Emergency",
    address: "12 Main St, Newark NJ", details: "Water leaking from the valve on the water heater", summary: "Customer reports water leaking from valve",
    measurements: "", equipment: "Rheem, about 12 years old",
  });
  assert.equal(r.body.ok, true);
  let job = null;
  for (let i = 0; i < 50 && !(job && job.status === "ready"); i++) { await new Promise((ok) => setTimeout(ok, 50)); job = await EstimateJob.findOne({ client: owner._id }); }
  assert.ok(job, "estimate job created from the call");
  assert.equal(job.source, "calltwin_call");
  assert.equal(job.status, "ready");
  assert.equal(job.analysis.provider, "rules");
  assert.equal(job.analysis.serviceTemplate, "Water heater replacement");
  assert.match(job.notes, /Rheem/);
  assert.notEqual(job.customer.phone, "+15555550123", "phone is encrypted at rest");

  const id = String(job._id);
  r = await request(app).get(`/api/estimates/jobs/${id}`).set(O);
  const est = r.body.job.estimate;
  assert.equal(r.body.job.customer.phone, "+15555550123");
  const byDesc = Object.fromEntries(est.lineItems.map((l) => [l.description, l]));
  assert.equal(byDesc["Labor — Water heater replacement"].unitCents, dollars(187.5), "emergency labor uplift from owner rules");
  assert.equal(byDesc["50 gal gas water heater"].unitCents, dollars(880));
  assert.equal(byDesc["Emergency response"].unitCents, dollars(150));
  assert.equal(est.totals.sendable, true, JSON.stringify({ issues: est.totals.issues, items: est.lineItems }));
  const expectedSub = 4 * 18750 + 88000 + 4500 + 8900 + 15000;
  assert.equal(est.totals.subtotalCents, expectedSub);

  // Tenant isolation.
  r = await request(app).get(`/api/estimates/jobs/${id}`).set(X);
  assert.equal(r.status, 404);
  r = await request(app).get(`/api/estimates/jobs/${id}`).set({ "x-portal-key": "nope" });
  assert.equal(r.status, 401);

  // Can't send before a human approves.
  r = await request(app).post(`/api/estimates/jobs/${id}/send`).set(O).send({});
  assert.equal(r.status, 400);

  // Owner edits: add a custom line with no price -> blocks approval, then prices it.
  const items = est.lineItems.map((l) => ({ ...l }));
  items.push({ id: "haul01", kind: "custom", description: "Haul away old heater", qty: 1, unit: "each", unitCents: null, taxable: false });
  r = await request(app).put(`/api/estimates/jobs/${id}/estimate`).set(O).send({ lineItems: items, discount: { type: "flat", value: dollars(25), name: "Repeat customer" } });
  assert.equal(r.body.job.estimate.totals.sendable, false);
  r = await request(app).post(`/api/estimates/jobs/${id}/approve`).set(O).send({});
  assert.equal(r.status, 400);
  items[items.length - 1].unitCents = dollars(60);
  r = await request(app).put(`/api/estimates/jobs/${id}/estimate`).set(O).send({ lineItems: items, scope: "Replace leaking water heater", overview: "Emergency replacement" });
  const totals = r.body.job.estimate.totals;
  assert.equal(totals.sendable, true);
  assert.equal(totals.discountCents, dollars(25));

  // Team roles.
  r = await request(app).post("/api/estimates/team").set(O).send({ name: "Tech Tom", role: "tech" });
  const techKey = new URL(r.body.link).searchParams.get("t");
  r = await request(app).put(`/api/estimates/jobs/${id}/estimate`).set("x-team-key", techKey).send({ lineItems: [] });
  assert.equal(r.status, 403);
  r = await request(app).get(`/api/estimates/jobs/${id}`).set("x-team-key", techKey);
  assert.equal(r.body.job.estimate.lineItems, undefined, "techs don't see pricing");

  // Approve + send.
  r = await request(app).post(`/api/estimates/jobs/${id}/approve`).set(O).send({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await request(app).post(`/api/estimates/jobs/${id}/send`).set(O).send({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.channels, []); // no SMS/email creds in test -> link only
  const token = new URL(r.body.link).searchParams.get("t");
  assert.ok(token.length > 20);

  // Customer opens the proposal.
  r = await request(app).get(`/api/estimates/public/proposal/${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.proposal.estimate.totals.totalCents, totals.totalCents);
  assert.equal(r.body.proposal.company.name, "New Ark Plumbing LLC");
  assert.equal(r.body.proposal.customer.phone, undefined, "no customer contact data leaks on the public page");
  assert.equal((await EstimateJob.findById(id)).status, "viewed");
  r = await request(app).get(`/api/estimates/public/proposal/not-a-real-token-xxxxxxxxxxxx`);
  assert.equal(r.status, 404);

  // Customer asks a question, owner replies.
  r = await request(app).post(`/api/estimates/public/proposal/${token}/action`).send({ type: "question", text: "Does this include the permit?" });
  assert.equal(r.body.ok, true);
  r = await request(app).post(`/api/estimates/jobs/${id}/reply`).set(O).send({ text: "Yes, permit is included." });
  assert.equal(r.body.ok, true);

  // Owner edits after sending: customer still sees the approved version.
  r = await request(app).put(`/api/estimates/jobs/${id}/estimate`).set(O).send({ notes: "internal tweak" });
  assert.equal(r.body.job.status, "ready");
  r = await request(app).get(`/api/estimates/public/proposal/${token}?preview=1`);
  assert.equal(r.body.proposal.estimate.totals.totalCents, totals.totalCents);
  assert.equal(r.body.proposal.revised, true);
  await request(app).post(`/api/estimates/jobs/${id}/approve`).set(O).send({});
  await request(app).post(`/api/estimates/jobs/${id}/send`).set(O).send({});

  // Approve with e-signature.
  const sig = "data:image/png;base64," + Buffer.alloc(600, 7).toString("base64");
  r = await request(app).post(`/api/estimates/public/proposal/${token}/action`).send({ type: "approve", name: "John Smith", agree: true, signature: "nope" });
  assert.equal(r.status, 400);
  r = await request(app).post(`/api/estimates/public/proposal/${token}/action`).set("User-Agent", "TestPhone").send({ type: "approve", name: "John Smith", agree: true, signature: sig });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(r.body.proposal.response, "approved");
  job = await EstimateJob.findById(id);
  assert.equal(job.status, "approved");
  assert.ok(job.proposal.signature.at);
  assert.equal(job.proposal.signature.ua, "TestPhone");
  assert.equal(job.payment.depositCents, Math.round(totals.totalCents * 0.3));
  r = await request(app).post(`/api/estimates/public/proposal/${token}/action`).send({ type: "decline" });
  assert.equal(r.status, 400, "can't decline after approving");

  // Deposit: no Stripe configured -> clear message, owner records it manually.
  r = await request(app).post(`/api/estimates/public/proposal/${token}/pay`).send({});
  assert.equal(r.status, 400);
  r = await request(app).post(`/api/estimates/jobs/${id}/payment`).set(O).send({ amountCents: job.payment.depositCents, method: "zelle" });
  assert.equal(r.body.job.status, "deposit_paid");
  r = await request(app).post(`/api/estimates/jobs/${id}/schedule`).set(O).send({ date: "2026-10-02", window: "8-10am" });
  assert.equal(r.body.job.status, "scheduled");

  // PDFs.
  r = await request(app).get(`/api/estimates/public/proposal/${token}/pdf`).buffer(true).parse((res, cb) => { const b = []; res.on("data", (c) => b.push(c)); res.on("end", () => cb(null, Buffer.concat(b))); });
  assert.equal(r.status, 200);
  assert.equal(r.body.subarray(0, 4).toString(), "%PDF");
  r = await request(app).get(`/api/estimates/jobs/${id}/pdf?kind=estimate`).set(O).buffer(true).parse((res, cb) => { const b = []; res.on("data", (c) => b.push(c)); res.on("end", () => cb(null, Buffer.concat(b))); });
  assert.equal(r.body.subarray(0, 4).toString(), "%PDF");

  // Dashboard stats + search.
  r = await request(app).get("/api/estimates/jobs?q=john").set(O);
  assert.equal(r.body.jobs.length, 1);
  assert.equal(r.body.stats.scheduled, 1);
  assert.equal(r.body.stats.collectedCents, job.payment.depositCents);
  r = await request(app).get("/api/estimates/jobs").set(X);
  assert.equal(r.body.jobs.length, 0);

  // Audit trail covers AI output, human edits and customer actions.
  const actions = (await EstimateAudit.find({ job: id })).map((a) => a.action);
  for (const a of ["job.created", "analysis.completed", "estimate.edited", "estimate.approved", "proposal.sent", "proposal.viewed", "proposal.question", "proposal.approved", "payment.recorded", "job.scheduled"]) assert.ok(actions.includes(a), `audit has ${a}`);
});

test("web form intake + AI provider output is sanitized", { skip: !MongoMemoryServer && "mongodb-memory-server-core not installed" }, async () => {
  // Fake an AI provider that tries to invent prices and SKUs.
  process.env.OPENAI_API_KEY = "test";
  const orig = PROVIDERS.openai.call;
  PROVIDERS.openai.call = async () => JSON.stringify({
    summary: "Kitchen faucet replacement for about $350",
    scope: ["Remove old faucet", "Install new faucet"],
    materials: [{ name: "Kitchen faucet", qty: 1, sku: null, basis: "stated", note: "Customer is buying their own? unknown", price: 250 },
      { name: "Flex connector kit", qty: 2, sku: "FLEX", basis: "assumed" }],
    labor: [{ task: "Install faucet", hours: 1.5, laborKey: "standard", basis: "assumed" }],
    serviceTemplate: "", questions: ["Who supplies the faucet?"], assumptions: ["Standard single-hole sink"], missingInfo: ["Faucet model"], nextSteps: ["Confirm faucet"],
  });
  try {
    const me = await request(app).get("/api/estimates/me").set(O);
    const key = new URL(me.body.links.intake).searchParams.get("c");
    let r = await request(app).post(`/api/estimates/public/intake/${key}`).field("name", "Maria Lopez").field("phone", "5555550177").field("service", "Faucet").field("problem", "Kitchen faucet is dripping, want it replaced")
      .attach("photos", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), { filename: "sink.png", contentType: "image/png" });
    assert.equal(r.body.ok, true, JSON.stringify(r.body));
    let job;
    for (let i = 0; i < 50; i++) { await new Promise((ok) => setTimeout(ok, 50)); job = await EstimateJob.findOne({ client: owner._id, source: "web_form" }); if (job && job.analysis.status === "done") break; }
    assert.equal(job.analysis.provider, "openai");
    assert.ok(!/\$/.test(job.analysis.summary));
    const lines = job.estimate.lineItems;
    const faucet = lines.find((l) => l.description === "Kitchen faucet");
    assert.equal(faucet.unitCents, null, "no invented price");
    const flex = lines.find((l) => l.sku === "FLEX");
    assert.equal(flex.qty, null, "assumed quantity not accepted");
    assert.equal(flex.unitCents, dollars(45), "price from owner's price book");
    const labor = lines.find((l) => l.kind === "labor");
    assert.equal(labor.qty, null);
    assert.equal(job.estimate.totals.sendable, false);
    const r2 = await request(app).get(`/api/estimates/jobs/${job._id}`).set(O);
    assert.equal(r2.body.photos.length, 1);
    r = await request(app).get(`/api/estimates/public/intake/short`);
    assert.equal(r.status, 404);
  } finally { PROVIDERS.openai.call = orig; delete process.env.OPENAI_API_KEY; }
});

test("HSW365 owner email always has free full access", { skip: !MongoMemoryServer && "mongodb-memory-server-core not installed" }, async () => {
  const c = await Client.create({ businessName: "HSW365 Media", ownerName: "Elvin", ownerEmail: "HSW365Media@gmail.com", ownerCell: "+15555550122", portalKey: "portal-hsw-key-12345678", hookKey: "hook-hsw-12345678", status: "canceled" });
  assert.equal(c.status, "comp");
  c.status = "past_due"; await c.save();
  assert.equal(c.status, "comp");
  assert.equal(c.inService(), true);
  const r = await request(app).get("/api/estimates/me").set({ "x-portal-key": "portal-hsw-key-12345678" });
  assert.equal(r.body.addon.status, "comp");
  assert.equal(r.body.addon.active, true);
});
