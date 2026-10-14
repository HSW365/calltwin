/**
 * New Ark proposal maker: the document shape and the money math.
 * Every total is computed here, in whole cents, from the owner's own numbers. Nothing is estimated or guessed.
 * The page (newark/proposal.html) runs the same rules for its live preview; the server recomputes before any PDF.
 */
const TYPES = { proposal: "Proposal", estimate: "Estimate", invoice: "Invoice" };

const COMPANY = {
  name: "New Ark Plumbing",
  tagline: "Plumbing · Heating & Air Conditioning · Fire Protection",
  permit: "P01631",
  address: "412 Firth Street",
  city: "Phillipsburg, NJ 08865",
  office: "908-454-4043",
  cell: "201-349-8663",
  fax: "1-484-561-0749",
  email: "joehernandez555@msn.com",
};

const str = (v, n = 200) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

/** "$1,234.50", "1234.5", 1234.5 -> 123450 (cents). Blank or junk -> 0. Negative allowed (credits). */
function toCents(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : 0;
  const s = String(v == null ? "" : v).replace(/[$,\s]/g, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = parseFloat(s.replace(/[()\-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) * (neg ? -1 : 1);
}
function toQty(v) {
  if (v === "" || v == null) return 1;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 1;
}
function money(c) {
  const neg = c < 0, a = Math.abs(Math.round(c));
  const s = "$" + Math.floor(a / 100).toLocaleString("en-US") + "." + String(a % 100).padStart(2, "0");
  return neg ? `(${s})` : s;
}
const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : new Date().toISOString().slice(0, 10));
function prettyDate(iso) {
  const [y, m, d] = isoDay(iso).split("-").map(Number);
  return `${m}/${d}/${y}`;
}
function addDays(iso, n) {
  const [y, m, d] = isoDay(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Clean an incoming document from the page into a safe, complete shape. */
function normalize(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const c = d.customer || {}, co = d.company || {};
  const type = TYPES[d.type] ? d.type : "proposal";
  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 60)
    .map((i) => ({ desc: str(i && i.desc, 1200), qty: toQty(i && i.qty), priceCents: toCents(i && (i.priceCents != null ? i.priceCents / 100 : i.price)) }))
    .filter((i) => i.desc || i.priceCents);
  const payments = (Array.isArray(d.payments) ? d.payments : []).slice(0, 20)
    .map((p) => ({ label: str(p && p.label, 120) || "Payment received", amountCents: Math.abs(toCents(p && (p.amountCents != null ? p.amountCents / 100 : p.amount))) }))
    .filter((p) => p.amountCents);
  const taxPct = Math.min(Math.max(parseFloat(String(d.taxPct || "0").replace(/[%\s]/g, "")) || 0, 0), 25);
  const out = {
    type,
    number: str(d.number, 40),
    date: isoDay(d.date),
    validDays: type === "invoice" ? 0 : Math.min(Math.max(parseInt(d.validDays, 10) || 30, 1), 365),
    customer: { company: str(c.company, 120), contact: str(c.contact, 120), address: str(c.address, 160), city: str(c.city, 120), phone: str(c.phone, 40), fax: str(c.fax, 40), email: str(c.email, 160) },
    jobsite: str(d.jobsite, 200),
    title: str(d.title, 300),
    scope: str(d.scope, 4000),
    items, payments, taxPct,
    terms: str(d.terms, 3000),
    // Job photos for the PDF: small JPEG/PNG data URLs made by the page, at most 8.
    photos: (Array.isArray(d.photos) ? d.photos : []).slice(0, 8)
      .filter((p) => p && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(p.src || "")) && String(p.src).length <= 900000)
      .map((p) => ({ src: p.src, caption: str(p.caption, 120) })),
    showPhotos: d.showPhotos !== false,
    company: {},
  };
  for (const k of Object.keys(COMPANY)) out.company[k] = str(co[k], 200) || COMPANY[k];
  out.totals = totals(out);
  return out;
}

function totals(doc) {
  const subtotalCents = doc.items.reduce((a, i) => a + Math.round(i.qty * i.priceCents), 0);
  const taxCents = Math.round((subtotalCents * (doc.taxPct || 0)) / 100);
  const totalCents = subtotalCents + taxCents;
  const paidCents = doc.payments.reduce((a, p) => a + p.amountCents, 0);
  return { subtotalCents, taxCents, totalCents, paidCents, balanceCents: totalCents - paidCents };
}

const DEFAULT_TERMS = {
  proposal: "This proposal covers the work and materials listed above. Any work not listed is not included and will be quoted separately as extra work. Prices are good for the number of days shown above. To accept, sign below and return a copy by email or fax.",
  estimate: "This is an estimate for the work and materials listed above. Final cost may change if conditions found on site differ from what was described. Any work not listed will be quoted separately as extra work.",
  invoice: "Payment is due on receipt. Thank you for your business.",
};

module.exports = { TYPES, COMPANY, DEFAULT_TERMS, normalize, totals, toCents, money, prettyDate, addDays, isoDay };
