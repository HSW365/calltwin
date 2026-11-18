const test = require("node:test");
const assert = require("node:assert");
const P = require("../plans");
const M = require("../math");
const { renderProposalPdf } = require("../pdf");
const { noMoney, priceLines, priceBook } = require("../analyze");
const DB = require("../models");

test("plans: every price is whole cents and tiers get cheaper per conversion as they grow", () => {
  let last = Infinity;
  for (const p of Object.values(P.PLANS)) {
    assert.ok(Number.isInteger(p.monthlyCents) && Number.isInteger(p.overCents) && Number.isInteger(p.setupCents));
    const per = p.monthlyCents / p.included;
    assert.ok(per < last + 1e-9, `${p.name} effective price should not rise`);
    last = per;
    assert.ok(p.overCents >= per * 0.5, "top-ups should not be absurdly cheap next to the plan rate");
  }
  for (const k of Object.values(P.PACKS)) assert.strictEqual(k.priceCents, k.unitCents * k.qty);
  assert.strictEqual(P.topupCents("solo"), 150 * 20);
  assert.strictEqual(P.topupCents("nope"), null);
});

test("top-ups cost less than a pay-per-conversion pack of the same size, so subscribing always wins", () => {
  const cover = { solo: "small", crew: "mid", pro: "large", commercial: "major" };
  for (const [plan, size] of Object.entries(cover)) assert.ok(P.PLANS[plan].overCents < P.PACKS[size].unitCents);
});

test("pay-per-conversion packs are dearer per estimate than any subscription that covers the same job size", () => {
  const cover = { small: "solo", mid: "crew", large: "pro", major: "commercial" };
  for (const [size, plan] of Object.entries(cover)) assert.ok(P.PACKS[size].unitCents > P.PLANS[plan].monthlyCents / P.PLANS[plan].included);
});

test("math: totals in cents and brand falls back to the default for a bad colour", () => {
  const d = M.normalize({ items: [{ desc: "Replace water heater", qty: 2, priceCents: 150000 }], company: { name: "Acme Plumbing", brand: "red" } });
  assert.strictEqual(d.company.name, "Acme Plumbing");
  assert.strictEqual(d.company.brand, M.COMPANY.brand);
  assert.ok(d.totals.totalCents >= 300000);
});

test("pdf: renders a real PDF for a neutral contractor, with and without the badge", async () => {
  for (const badge of [true, false]) {
    const d = M.normalize({ type: "estimate", number: "2026-001", title: "Water heater replacement", scope: "Replace the unit.", customer: { company: "Jones", contact: "Bob" },
      items: [{ desc: "Water heater, 50 gal, installed", qty: 1, priceCents: 185000 }], company: { name: "Acme Plumbing", brand: "#145a32", office: "555-0100", badge } });
    const buf = await renderProposalPdf(d);
    assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 4).toString() === "%PDF" && buf.length > 2000);
    assert.ok(!buf.toString("latin1").includes("New Ark"));
  }
});

test("pdf: a long estimate runs onto continuation pages without throwing", async () => {
  const items = Array.from({ length: 70 }, (_, i) => ({ desc: `Line ${i} ${"work ".repeat(12)}`, qty: 1, priceCents: 10000 + i }));
  const buf = await renderProposalPdf(M.normalize({ items, scope: "x ".repeat(400), company: { name: "Big Job Co" } }));
  assert.ok((buf.toString("latin1").match(/\/Type \/Page\b/g) || []).length >= 2);
});

test("analyze: the AI can never put a price on a line; only the contractor's own price book does", () => {
  assert.strictEqual(noMoney("Install pump for $1,250.00 total"), "Install pump for total");
  const book = priceBook([{ items: [{ desc: "Replace ball valve", priceCents: 22000 }], updatedAt: new Date() }]);
  const lines = priceLines([{ desc: "Replace ball valve $50", qty: 2, book: 1 }, { desc: "Brand new thing", qty: 1, book: null }], book);
  assert.strictEqual(lines[0].priceCents, 22000);
  assert.strictEqual(lines[0].fromBook, true);
  assert.strictEqual(lines[1].priceCents, null);
});

test("models: summary shows what is left, and the badge only drops on Crew and above", () => {
  const solo = DB.summary({ _id: "1", email: "a@b.co", plan: "solo", subStatus: "active", usedPeriod: 10, topups: 5, trialLeft: 0, packs: { small: 2 } });
  assert.strictEqual(solo.planLeft, 20); assert.strictEqual(solo.left, 27); assert.strictEqual(solo.badge, true); assert.strictEqual(solo.maxSize, "small");
  const crew = DB.summary({ _id: "2", email: "a@b.co", plan: "crew", subStatus: "active", usedPeriod: 0, packs: {} });
  assert.strictEqual(crew.badge, false); assert.strictEqual(crew.maxSize, "mid");
  const lapsed = DB.summary({ _id: "3", email: "a@b.co", plan: "crew", subStatus: "canceled", trialLeft: 2, packs: {} });
  assert.strictEqual(lapsed.plan, ""); assert.strictEqual(lapsed.left, 2); assert.strictEqual(lapsed.badge, true);
});

test("models: PIN hashes are stable and PINs are 8 digits", () => {
  assert.strictEqual(DB.pinHash("12345678"), DB.pinHash("12345678"));
  assert.notStrictEqual(DB.pinHash("12345678"), DB.pinHash("12345679"));
  for (let i = 0; i < 50; i++) assert.match(DB.newPin(), /^\d{8}$/);
});

test("models: his own emails are free and unlimited", () => {
  const me = DB.summary({ _id: "9", email: "Hsw365media@gmail.com", packs: {} });
  assert.strictEqual(me.unlimited, true); assert.strictEqual(me.badge, false); assert.strictEqual(me.maxSize, "major");
});
