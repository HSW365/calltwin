/**
 * Deterministic pricing engine. The ONLY place money is calculated.
 *
 * Rules (from the owner's settings, never from the AI):
 *  - Price-book item: fixed priceCents if the owner set one, else costCents + material/equipment markup.
 *  - Labor: owner's labor rate per hour, plus emergency labor % when the job is flagged Emergency.
 *  - Fees (service call, travel, emergency, after-hours) are added as removable "auto_fee" lines at draft time.
 *  - Minimum job charge lifts the subtotal to the owner's floor.
 *  - Discount: pct or flat, applied before tax; tax applies to taxable lines (labor only if taxLabor).
 *  - A line with no unit price or no quantity is NOT priced and blocks sending.
 */

const round = (n) => Math.round(Number(n) || 0);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function priceBookUnitCents(settings, item) {
  if (!item) return null;
  if (isNum(item.priceCents)) return round(item.priceCents);
  if (!isNum(item.costCents)) return null;
  const p = settings.pricing || {};
  const pct = item.kind === "equipment" ? p.equipmentMarkupPct : item.kind === "material" ? p.materialMarkupPct : 0;
  return round(item.costCents * (1 + (Number(pct) || 0) / 100));
}

function laborUnitCents(settings, laborKey, job) {
  const rates = settings.laborRates || [];
  const rate = rates.find((r) => r.key === laborKey) || (!laborKey ? rates[0] : null);
  if (!rate) return null;
  const emergency = isEmergency(job);
  const extra = emergency ? Number((settings.pricing || {}).emergencyLaborPct) || 0 : 0;
  return round(rate.rateCents * (1 + extra / 100));
}

function isEmergency(job) {
  return /emergenc/i.test(String((job && job.urgency) || ""));
}

/** Fill unit prices on price-book / labor lines from the owner's current rules (owner overrides are kept). */
function applyRules(settings, lineItems, job) {
  const book = new Map((settings.priceBook || []).map((i) => [i.sku, i]));
  return lineItems.map((li) => {
    const out = { ...(li && typeof li.toObject === "function" ? li.toObject() : li) };
    if (out.origin === "owner" || out.origin === "auto_fee") return out; // owner-typed or fee: keep as set
    if (out.kind === "labor") {
      const u = laborUnitCents(settings, out.laborKey, job);
      out.unitCents = u;
      if (!out.unit) out.unit = "hour";
      out.taxable = !!(settings.pricing || {}).taxLabor;
    } else if (out.sku && book.has(out.sku)) {
      const item = book.get(out.sku);
      out.unitCents = priceBookUnitCents(settings, item);
      out.taxable = item.taxable !== false;
      if (!out.unit) out.unit = item.unit || "each";
      if (!out.description) out.description = item.name;
    } else if (out.origin !== "owner") {
      out.unitCents = null; // AI suggestion with no price-book match: owner must price it
    }
    return out;
  });
}

/** Compute totals + blocking issues. Never mutates input. */
function computeTotals(settings, estimate, job) {
  const p = (settings && settings.pricing) || {};
  const plain = (x) => (x && typeof x.toObject === "function" ? x.toObject() : x);
  const items = (estimate.lineItems || []).map((li) => ({ ...plain(li) }));
  const issues = [];
  const warnings = [];
  let subtotal = 0;
  let taxableBase = 0;
  const lines = items.map((li) => {
    const priced = isNum(li.unitCents) && isNum(li.qty);
    if (!isNum(li.unitCents)) issues.push({ id: li.id, code: "needs_price", message: `Set a price for "${li.description || "line item"}"` });
    if (!isNum(li.qty) || li.qty <= 0) issues.push({ id: li.id, code: "needs_qty", message: `Set a quantity/hours for "${li.description || "line item"}"` });
    if (li.basis === "assumed") warnings.push({ id: li.id, code: "assumed", message: `"${li.description}" is an AI assumption — confirm it` });
    const lineCents = priced ? round(li.unitCents * li.qty) : 0;
    subtotal += lineCents;
    if (li.taxable && lineCents > 0) taxableBase += lineCents;
    return { id: li.id, lineCents };
  });

  let minimumAdjustmentCents = 0;
  if (isNum(p.minimumChargeCents) && p.minimumChargeCents > 0 && subtotal > 0 && subtotal < p.minimumChargeCents) {
    minimumAdjustmentCents = p.minimumChargeCents - subtotal;
  }
  const preDiscount = subtotal + minimumAdjustmentCents;

  let discountCents = 0;
  const d = plain(estimate.discount) || {};
  if (d.type === "pct" && isNum(d.value) && d.value > 0) discountCents = round(preDiscount * Math.min(d.value, 100) / 100);
  if (d.type === "flat" && isNum(d.value) && d.value > 0) discountCents = Math.min(round(d.value), preDiscount);

  // Discount reduces the taxable base proportionally.
  const discountRatio = preDiscount > 0 ? discountCents / preDiscount : 0;
  const taxableAfter = round(taxableBase * (1 - discountRatio));
  const taxRate = Number(p.taxRatePct) || 0;
  const taxCents = round(taxableAfter * taxRate / 100);
  const totalCents = preDiscount - discountCents + taxCents;

  const depositPct = isNum(estimate.depositPct) ? estimate.depositPct : Number(p.defaultDepositPct) || 0;
  const depositCents = round(totalCents * Math.max(0, Math.min(depositPct, 100)) / 100);

  if (!items.length) issues.push({ id: null, code: "empty", message: "Add at least one line item" });
  else if (totalCents <= 0) issues.push({ id: null, code: "zero_total", message: "Total is $0" });

  return {
    lines,
    subtotalCents: subtotal,
    minimumAdjustmentCents,
    discountCents,
    taxRatePct: taxRate,
    taxableCents: taxableAfter,
    taxCents,
    totalCents,
    depositPct,
    depositCents,
    issues,
    warnings,
    sendable: issues.length === 0,
  };
}

/** Auto-fee lines from the owner's rules for a new draft. */
function autoFees(settings, job) {
  const p = settings.pricing || {};
  const fees = [];
  const add = (id, description, cents) => { if (isNum(cents) && cents > 0) fees.push({ id, kind: "fee", description, qty: 1, unit: "each", unitCents: round(cents), taxable: false, origin: "auto_fee", basis: "owner" }); };
  add("fee_service_call", "Service call", p.serviceCallFeeCents);
  add("fee_travel", "Travel", p.travelFeeCents);
  if (isEmergency(job)) add("fee_emergency", "Emergency response", p.emergencyFeeCents);
  if (job && job.afterHours) add("fee_after_hours", "After-hours service", p.afterHoursFeeCents);
  return fees;
}

const money = (cents) => (isNum(cents) ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—");

module.exports = { applyRules, computeTotals, autoFees, priceBookUnitCents, laborUnitCents, isEmergency, money };
