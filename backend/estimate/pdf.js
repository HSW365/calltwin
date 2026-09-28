/**
 * PDF rendering for estimates/proposals (pdfkit, no headless browser needed on Render free tier).
 */
const PDFDocument = require("pdfkit");
const axios = require("axios");
const { money } = require("./pricing");

async function fetchLogo(url) {
  if (!/^https:\/\//.test(url || "")) return null;
  try {
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: 6000, maxContentLength: 2 * 1024 * 1024 });
    const type = String(r.headers["content-type"] || "");
    if (!/png|jpe?g/.test(type)) return null;
    return Buffer.from(r.data);
  } catch (e) { return null; }
}

/**
 * @param {object} p { settings, client, job, customer, kind: "estimate"|"proposal" }
 * @returns {Promise<Buffer>}
 */
async function renderPdf({ settings, client, job, customer, kind = "proposal" }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50, info: { Title: `${kind === "proposal" ? "Proposal" : "Estimate"} ${job.number}`, Author: settings.company.name || client.businessName } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const accent = /^#[0-9a-f]{6}$/i.test(settings.company.brandColor || "") ? settings.company.brandColor : "#0e7490";
  const ink = "#111827", muted = "#6b7280";
  const co = settings.company;
  const t = job.estimate.totals || {};
  const W = doc.page.width - 100;

  const logo = await fetchLogo(co.logoUrl);
  if (logo) { try { doc.image(logo, 50, 45, { fit: [140, 60] }); } catch (e) { /* bad image */ } }
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(18).text(co.name || client.businessName, logo ? 200 : 50, 50, { width: logo ? W - 150 : W });
  doc.font("Helvetica").fontSize(9).fillColor(muted)
    .text([co.address, co.phone, co.email, co.website, co.license ? `License ${co.license}` : ""].filter(Boolean).join("  |  "), { width: logo ? W - 150 : W });

  doc.moveDown(1.5);
  const y0 = Math.max(doc.y, 115);
  doc.rect(50, y0, W, 2).fill(accent);
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(kind === "proposal" ? "PROPOSAL" : "ESTIMATE", 50, y0 + 12);
  doc.font("Helvetica").fontSize(10).fillColor(muted)
    .text(`No. ${job.number}    Date ${new Date(job.estimate.approvedAt || job.updatedAt || Date.now()).toLocaleDateString("en-US")}${job.estimate.validUntil ? `    Valid until ${new Date(job.estimate.validUntil).toLocaleDateString("en-US")}` : ""}`);
  doc.moveDown(0.8);
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text("PREPARED FOR");
  doc.font("Helvetica").fontSize(10).fillColor(ink).text([customer.name, customer.phone, customer.email].filter(Boolean).join("  |  "));
  if (customer.address) doc.text(`Job address: ${customer.address}`);

  const section = (title, body) => {
    if (!body) return;
    doc.moveDown(0.9);
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(11).text(title.toUpperCase());
    doc.fillColor(ink).font("Helvetica").fontSize(10).text(body, { width: W });
  };

  if (kind === "proposal") section("Project overview", job.proposal.overview);
  section("Scope of work", job.estimate.scope);

  // line items table
  doc.moveDown(0.9);
  if (doc.y > doc.page.height - 160) doc.addPage();
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(11).text(kind === "proposal" ? "INVESTMENT" : "ITEMIZED ESTIMATE");
  const cols = [50, 330, 390, 470];
  const header = () => {
    const y = doc.y + 4;
    doc.rect(50, y, W, 18).fill("#f3f4f6");
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(9);
    doc.text("Description", cols[0] + 6, y + 5); doc.text("Qty", cols[1], y + 5, { width: 55, align: "right" });
    doc.text("Unit", cols[2], y + 5, { width: 70, align: "right" }); doc.text("Amount", cols[3], y + 5, { width: W + 50 - cols[3] - 6, align: "right" });
    doc.y = y + 22;
  };
  header();
  const groups = [["labor", "Labor"], ["material", "Materials"], ["equipment", "Equipment"], ["fee", "Fees"], ["custom", "Other"]];
  const lineCents = Object.fromEntries((t.lines || []).map((l) => [l.id, l.lineCents]));
  for (const [kindKey, label] of groups) {
    const rows = (job.estimate.lineItems || []).filter((l) => l.kind === kindKey);
    if (!rows.length) continue;
    if (doc.y > doc.page.height - 90) { doc.addPage(); header(); }
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8.5).text(label.toUpperCase(), cols[0] + 6, doc.y + 2);
    for (const li of rows) {
      if (doc.y > doc.page.height - 80) { doc.addPage(); header(); }
      const y = doc.y + 3;
      doc.fillColor(ink).font("Helvetica").fontSize(9.5);
      doc.text(li.description || "", cols[0] + 6, y, { width: cols[1] - cols[0] - 12 });
      const yEnd = doc.y;
      doc.text(li.qty != null ? `${li.qty} ${li.unit || ""}`.trim() : "—", cols[1], y, { width: 55, align: "right" });
      doc.text(money(li.unitCents), cols[2], y, { width: 70, align: "right" });
      doc.text(money(lineCents[li.id]), cols[3], y, { width: W + 50 - cols[3] - 6, align: "right" });
      doc.y = Math.max(yEnd, y + 12) + 2;
      doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    }
  }
  const totalRow = (label, cents, bold) => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    const y = doc.y + 4;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor(ink);
    doc.text(label, 300, y, { width: 160, align: "right" });
    doc.text(money(cents), cols[3], y, { width: W + 50 - cols[3] - 6, align: "right" });
    doc.y = y + (bold ? 18 : 14);
  };
  doc.moveDown(0.5);
  totalRow("Subtotal", t.subtotalCents);
  if (t.minimumAdjustmentCents) totalRow("Minimum job charge adjustment", t.minimumAdjustmentCents);
  if (t.discountCents) totalRow(`Discount${job.estimate.discount && job.estimate.discount.name ? ` (${job.estimate.discount.name})` : ""}`, -t.discountCents);
  if (t.taxCents || t.taxRatePct) totalRow(`Tax (${t.taxRatePct || 0}%)`, t.taxCents);
  totalRow("Total", t.totalCents, true);
  if (t.depositCents) totalRow(`Deposit due at approval (${t.depositPct}%)`, t.depositCents);

  doc.x = 50;
  section("Project timeline", job.estimate.timeline);
  section("Payment terms", job.estimate.paymentTerms);
  section("Warranty", job.estimate.warranty);
  section("Terms & conditions", job.estimate.terms);
  if (job.estimate.notes) section("Notes", job.estimate.notes);

  if (kind === "proposal") {
    doc.moveDown(1);
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(11).text("CUSTOMER APPROVAL", 50);
    const sig = job.proposal.signature || {};
    if (sig.at) {
      doc.fillColor(ink).font("Helvetica").fontSize(10).text(`Approved and signed electronically by ${sig.name} on ${new Date(sig.at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET.`);
      if (sig.imageData) { try { doc.image(Buffer.from(sig.imageData.split(",")[1], "base64"), 50, doc.y + 6, { fit: [220, 70] }); doc.y += 80; } catch (e) { /* ignore */ } }
    } else {
      doc.fillColor(ink).font("Helvetica").fontSize(10).text("Approve online at the link provided, or sign below.");
      doc.moveDown(2.2);
      const y = doc.y;
      doc.moveTo(50, y).lineTo(280, y).strokeColor(ink).lineWidth(0.8).stroke();
      doc.moveTo(320, y).lineTo(50 + W, y).stroke();
      doc.fontSize(8.5).fillColor(muted).text("Customer signature", 50, y + 4).text("Date", 320, y + 4);
    }
  }

  doc.end();
  return done;
}

module.exports = { renderPdf };
