// Unit tests for the deterministic pricing engine and the AI safety filter.  Run: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyRules, computeTotals, autoFees } = require("../pricing");
const { sanitize, ruleBased } = require("../ai");

const settings = {
  pricing: { taxRatePct: 6.625, taxLabor: false, materialMarkupPct: 25, equipmentMarkupPct: 10, serviceCallFeeCents: 8900, minimumChargeCents: 25000, travelFeeCents: 0, emergencyFeeCents: 15000, emergencyLaborPct: 50, afterHoursFeeCents: 7500, defaultDepositPct: 30 },
  laborRates: [{ key: "standard", name: "Standard", rateCents: 12500 }],
  priceBook: [
    { sku: "WH-50G", name: "50 gal gas water heater", kind: "equipment", unit: "each", costCents: 80000, priceCents: null, taxable: true },
    { sku: "FLEX", name: "Flex connector kit", kind: "material", unit: "each", costCents: 2000, priceCents: 4500, taxable: true },
  ],
  services: [{ name: "Water heater replacement", laborKey: "standard", laborHours: 4, items: [{ sku: "WH-50G", qty: 1 }] }],
};

test("price book: fixed price wins, otherwise cost + markup by kind", () => {
  const items = applyRules(settings, [
    { id: "a", kind: "equipment", sku: "WH-50G", qty: 1, origin: "price_book" },
    { id: "b", kind: "material", sku: "FLEX", qty: 2, origin: "price_book" },
  ], {});
  assert.equal(items[0].unitCents, 88000); // 800 * 1.10
  assert.equal(items[1].unitCents, 4500); // fixed sell price
});

test("labor uses owner rate, plus emergency uplift only on emergencies", () => {
  const [normal] = applyRules(settings, [{ id: "l", kind: "labor", laborKey: "standard", qty: 4, origin: "service_template" }], { urgency: "This week" });
  const [urgent] = applyRules(settings, [{ id: "l", kind: "labor", laborKey: "standard", qty: 4, origin: "service_template" }], { urgency: "Emergency" });
  assert.equal(normal.unitCents, 12500);
  assert.equal(urgent.unitCents, 18750);
  assert.equal(normal.taxable, false);
});

test("AI suggestion not in the price book is never priced and blocks sending", () => {
  const items = applyRules(settings, [{ id: "x", kind: "material", description: "Expansion tank", qty: 1, origin: "ai_suggested", unitCents: 99999 }], {});
  assert.equal(items[0].unitCents, null);
  const t = computeTotals(settings, { lineItems: items }, {});
  assert.equal(t.sendable, false);
  assert.ok(t.issues.some((i) => i.code === "needs_price"));
});

test("owner-typed price is kept as-is", () => {
  const items = applyRules(settings, [{ id: "o", kind: "custom", description: "Haul away", qty: 1, unitCents: 6000, origin: "owner" }], {});
  assert.equal(items[0].unitCents, 6000);
});

test("totals: minimum charge, discount before tax, tax on taxable only, deposit", () => {
  const est = {
    lineItems: [
      { id: "l", kind: "labor", qty: 1, unitCents: 10000, taxable: false },
      { id: "m", kind: "material", qty: 1, unitCents: 5000, taxable: true },
    ],
    discount: { type: "pct", value: 10 },
    depositPct: 50,
  };
  const t = computeTotals(settings, est, {});
  assert.equal(t.subtotalCents, 15000);
  assert.equal(t.minimumAdjustmentCents, 10000); // lifted to 250.00
  assert.equal(t.discountCents, 2500);
  assert.equal(t.taxableCents, 4500); // 5000 * (1 - 0.1)
  assert.equal(t.taxCents, 298); // 45.00 * 6.625%
  assert.equal(t.totalCents, 25000 - 2500 + 298);
  assert.equal(t.depositCents, Math.round(t.totalCents * 0.5));
  assert.equal(t.sendable, true);
});

test("assumed quantities are warnings; missing qty is blocking", () => {
  const t = computeTotals(settings, { lineItems: [
    { id: "a", kind: "material", description: "Pipe", qty: 3, unitCents: 1000, basis: "assumed" },
    { id: "b", kind: "material", description: "Valve", qty: null, unitCents: 1000 },
  ] }, {});
  assert.ok(t.warnings.some((w) => w.id === "a"));
  assert.ok(t.issues.some((i) => i.id === "b" && i.code === "needs_qty"));
});

test("auto fees follow urgency and after-hours", () => {
  assert.deepEqual(autoFees(settings, { urgency: "Flexible" }).map((f) => f.id), ["fee_service_call"]);
  assert.deepEqual(autoFees(settings, { urgency: "Emergency", afterHours: true }).map((f) => f.id), ["fee_service_call", "fee_emergency", "fee_after_hours"]);
});

test("AI output: prices stripped, unknown SKUs/templates dropped, assumed quantities nulled", () => {
  const out = sanitize({
    summary: "Replace leaking heater, about $1,800 total",
    materials: [
      { name: "50 gal heater", qty: 1, sku: "WH-50G", basis: "stated", price: 900 },
      { name: "Expansion tank", qty: 1, sku: "TANK-2G", basis: "assumed" },
    ],
    labor: [{ task: "Swap heater", hours: 5, laborKey: "made_up", basis: "assumed", rate: 200 }],
    serviceTemplate: "Imaginary template",
    questions: ["Gas or electric?"],
  }, settings);
  assert.ok(!/\$/.test(out.summary));
  assert.equal(out.materials[0].sku, "WH-50G");
  assert.equal(out.materials[0].qty, 1);
  assert.equal(out.materials[1].sku, "");
  assert.equal(out.materials[1].qty, null);
  assert.equal(out.labor[0].hours, null);
  assert.equal(out.labor[0].laborKey, "");
  assert.equal(out.serviceTemplate, "");
  assert.ok(!("price" in out.materials[0]));
});

test("rule-based fallback invents nothing and lists what's missing", () => {
  const r = ruleBased({ service: "Water heater replacement", problem: "leaking" }, settings, { name: "John", phone: "", email: "", address: "" });
  assert.equal(r.serviceTemplate, "Water heater replacement");
  assert.equal(r.materials.length, 0);
  assert.ok(r.missingInfo.includes("Service address"));
});
