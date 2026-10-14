/**
 * New Ark proposal / estimate / invoice PDF (US Letter).
 * Built to read cleanly on screen, printed, and through a fax machine: dark ink on white, thin rules, no heavy fills.
 */
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { TYPES, DEFAULT_TERMS, money, prettyDate, addDays } = require("./newarkProposalMath");

const NAVY = "#0b2a4a", RED = "#c4161c", INK = "#16212e", MUT = "#5a6878", RULE = "#c9d2dc";
const LOGO = path.join(__dirname, "..", "assets", "newark-logo.jpg");
const M = 48, W = 612, H = 792, CW = W - M * 2;

function renderProposalPdf(doc) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "LETTER", margins: { top: M, bottom: 64, left: M, right: M }, bufferPages: true,
      info: { Title: `${TYPES[doc.type]} ${doc.number}`.trim(), Author: doc.company.name, Subject: doc.customer.company || doc.customer.contact || "" } });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    try { draw(pdf, doc); } catch (e) { return reject(e); }
    pdf.end();
  });
}

function draw(pdf, d) {
  const co = d.company, cu = d.customer, t = d.totals;
  const label = TYPES[d.type].toUpperCase();

  // ---------- letterhead ----------
  let y = M;
  const hasLogo = fs.existsSync(LOGO);
  if (hasLogo) pdf.image(LOGO, M, y - 4, { width: 70, height: 70 });
  const lx = hasLogo ? M + 82 : M;
  const rx = W - M - 170, lw = rx - lx - 16;
  pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(21).text(co.name.toUpperCase(), lx, y + 4, { width: lw, characterSpacing: 0.4 });
  pdf.fillColor(MUT).font("Helvetica").fontSize(8.5).text(co.tagline.toUpperCase(), lx, pdf.y + 2, { width: lw, characterSpacing: 0.4, lineGap: 1 });
  const contact = [`${co.address}, ${co.city}`, [co.office && `Office ${co.office}`, co.cell && `Cell ${co.cell}`].filter(Boolean).join("   "),
    [co.fax && `Fax ${co.fax}`, co.email].filter(Boolean).join("   "), co.permit && `Permit No. ${co.permit}`].filter(Boolean);
  pdf.fillColor(INK).fontSize(8.5).text(contact.join("\n"), lx, pdf.y + 6, { width: lw, lineGap: 1.5 });
  const headBottom = pdf.y;

  // document block, right
  pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(26).text(label, rx, y, { width: 170, align: "right", characterSpacing: 1 });
  const meta = [["No.", d.number || "—"], ["Date", prettyDate(d.date)]];
  if (d.validDays) meta.push(["Valid until", prettyDate(addDays(d.date, d.validDays))]);
  let my = y + 36;
  for (const [k, v] of meta) {
    pdf.fillColor(MUT).font("Helvetica").fontSize(8.5).text(k.toUpperCase(), rx, my, { width: 70, characterSpacing: 0.5 });
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(v, rx + 70, my - 1, { width: 100, align: "right" });
    my += 16;
  }
  y = Math.max(headBottom, my, M + 72) + 12;
  pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(2).strokeColor(RED).stroke();
  y += 16;

  // ---------- bill to / jobsite ----------
  const colW = (CW - 24) / 2;
  const block = (x, title, lines) => {
    pdf.fillColor(RED).font("Helvetica-Bold").fontSize(8).text(title, x, y, { width: colW, characterSpacing: 1 });
    let ly = y + 13;
    lines.filter((l) => l && l[1]).forEach(([k, v], i) => {
      if (k) {
        pdf.fillColor(MUT).font("Helvetica").fontSize(8.5).text(k, x, ly + 1, { width: 44 });
        pdf.fillColor(INK).font("Helvetica").fontSize(10).text(v, x + 44, ly, { width: colW - 44 });
      } else {
        pdf.fillColor(INK).font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 11 : 10).text(v, x, ly, { width: colW });
      }
      ly = pdf.y + 2;
    });
    return ly;
  };
  const b1 = block(M, "BILL TO", [["", cu.company || cu.contact], ["", cu.company ? cu.contact && `Attn: ${cu.contact}` : ""], ["", cu.address], ["", cu.city], ["Phone", cu.phone], ["Fax", cu.fax], ["Email", cu.email]]);
  const b2 = block(M + colW + 24, "JOBSITE", [["", d.jobsite || (cu.address ? `${cu.address}${cu.city ? ", " + cu.city : ""}` : "Same as billing")]]);
  y = Math.max(b1, b2) + 14;

  // ---------- title + scope ----------
  if (d.title) {
    pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(12.5).text(d.title.toUpperCase(), M, y, { width: CW, lineGap: 1 });
    y = pdf.y + 6;
  }
  if (d.scope) {
    pdf.fillColor(INK).font("Helvetica").fontSize(10).text(d.scope, M, y, { width: CW, lineGap: 2 });
    y = pdf.y + 12;
  }

  // ---------- line items ----------
  const cols = [{ k: "#", w: 26, a: "left" }, { k: "DESCRIPTION", w: CW - 26 - 44 - 86 - 92, a: "left" }, { k: "QTY", w: 44, a: "right" }, { k: "UNIT PRICE", w: 86, a: "right" }, { k: "AMOUNT", w: 92, a: "right" }];
  const header = () => {
    let x = M;
    pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(1.2).strokeColor(NAVY).stroke();
    for (const c of cols) { pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(8).text(c.k, x + (c.a === "right" ? 0 : 4), y + 6, { width: c.w - 4, align: c.a, characterSpacing: 0.6 }); x += c.w; }
    y += 20;
    pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(NAVY).stroke();
  };
  const ensure = (need, table) => { if (y + need > H - 80) { pdf.addPage(); y = M; if (table) header(); } };
  header();
  if (!d.items.length) {
    pdf.fillColor(MUT).font("Helvetica-Oblique").fontSize(10).text("No line items.", M + 4, y + 8);
    y += 28;
  }
  d.items.forEach((it, i) => {
    const dw = cols[1].w - 8;
    pdf.font("Helvetica").fontSize(10);
    const h = Math.max(pdf.heightOfString(it.desc || " ", { width: dw, lineGap: 1.5 }) - 1.5, 12) + 13;
    ensure(h, true);
    const ry = y + 7;
    let x = M;
    const cells = [String(i + 1), it.desc, Number.isInteger(it.qty) ? String(it.qty) : it.qty.toFixed(2), money(it.priceCents), money(Math.round(it.qty * it.priceCents))];
    cells.forEach((v, ci) => {
      const c = cols[ci];
      pdf.fillColor(ci === 0 ? MUT : INK).font(ci === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(10)
        .text(v, x + (c.a === "right" ? 0 : 4), ry, { width: c.a === "right" ? c.w - 4 : c.w - 8, align: c.a, lineGap: 1.5 });
      x += c.w;
    });
    y += h;
    pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(0.4).strokeColor(RULE).stroke();
  });

  // ---------- totals ----------
  const rows = [["Subtotal", money(t.subtotalCents)]];
  if (d.taxPct) rows.push([`Sales tax (${d.taxPct}%)`, money(t.taxCents)]);
  rows.push(["TOTAL", money(t.totalCents), true]);
  d.payments.forEach((p) => rows.push([p.label, money(-p.amountCents)]));
  if (d.payments.length) rows.push(["BALANCE DUE", money(t.balanceCents), true, true]);
  ensure(rows.length * 20 + 40);
  y += 14;
  const tx = W - M - 230, tw = 230;
  const sumTop = y;
  rows.forEach(([k, v, bold, final]) => {
    if (final) { pdf.moveTo(tx, y - 3).lineTo(W - M, y - 3).lineWidth(1.2).strokeColor(NAVY).stroke(); y += 4; }
    pdf.fillColor(bold ? NAVY : INK).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(final ? 13 : bold ? 11.5 : 10)
      .text(k, tx, y, { width: tw - 110 });
    pdf.text(v, tx + tw - 110, y, { width: 110, align: "right" });
    y = pdf.y + 6;
    if (k === "TOTAL" && d.payments.length) { pdf.moveTo(tx, y - 2).lineTo(W - M, y - 2).lineWidth(0.4).strokeColor(RULE).stroke(); y += 4; }
  });
  // plain-words total, left of the totals box (the way the paper form states it)
  const words = d.payments.length && d.type === "invoice"
    ? `Total cost, supply and labor: ${money(t.totalCents)}. Balance due: ${money(t.balanceCents)}.`
    : `Total cost, supply and labor: ${money(t.totalCents)}.`;
  pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(words, M, sumTop + 2, { width: tx - M - 24, lineGap: 2 });
  y += 14;

  // ---------- terms ----------
  const terms = d.terms || DEFAULT_TERMS[d.type];
  if (terms) {
    pdf.font("Helvetica").fontSize(9);
    ensure(pdf.heightOfString(terms, { width: CW, lineGap: 1.5 }) + 24);
    pdf.fillColor(RED).font("Helvetica-Bold").fontSize(8).text("TERMS", M, y, { characterSpacing: 1 });
    pdf.fillColor(INK).font("Helvetica").fontSize(9).text(terms, M, pdf.y + 4, { width: CW, lineGap: 1.5 });
    y = pdf.y + 18;
  }

  // ---------- acceptance ----------
  if (d.type !== "invoice") {
    ensure(70);
    pdf.fillColor(RED).font("Helvetica-Bold").fontSize(8).text("ACCEPTANCE", M, y, { characterSpacing: 1 });
    y = pdf.y + 26;
    const sig = [["Customer signature", 220], ["Printed name", 150], ["Date", CW - 220 - 150 - 32]];
    let x = M;
    sig.forEach(([k, w]) => {
      pdf.moveTo(x, y).lineTo(x + w, y).lineWidth(0.8).strokeColor(INK).stroke();
      pdf.fillColor(MUT).font("Helvetica").fontSize(8).text(k, x, y + 4, { width: w });
      x += w + 16;
    });
    y += 30;
    pdf.fillColor(MUT).font("Helvetica").fontSize(8.5).text(`Submitted by ${co.name}${co.permit ? `, Permit No. ${co.permit}` : ""}.`, M, y, { width: CW });
  }

  // ---------- footer on every page ----------
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.page.margins.bottom = 0; // footer sits below the content margin; don't let it spill onto a new page
    const fy = H - 44;
    pdf.moveTo(M, fy - 6).lineTo(W - M, fy - 6).lineWidth(0.4).strokeColor(RULE).stroke();
    pdf.fillColor(MUT).font("Helvetica").fontSize(7.5)
      .text(`${co.name}  ·  ${co.address}, ${co.city}  ·  Office ${co.office}${co.fax ? `  ·  Fax ${co.fax}` : ""}`, M, fy, { width: CW - 90, lineBreak: false });
    pdf.text(`${TYPES[d.type]} ${d.number}  ·  Page ${i - range.start + 1} of ${range.count}`, W - M - 160, fy, { width: 160, align: "right", lineBreak: false });
  }
}

module.exports = { renderProposalPdf };
