/**
 * New Ark: the filled NFPA form as a PDF (US Letter), laid out like the paper form:
 * Yes / No / N/A boxes down the left with the line's wording, readings on the line, tables with ruled cells,
 * signature lines left blank for a wet signature. Black ink on white so it prints and faxes cleanly.
 */
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { TEMPLATES } = require("./newarkNfpaForms");

const NAVY = "#0b2a4a", RED = "#c4161c", INK = "#111a24", MUT = "#5a6878", RULE = "#b8c2cd", GREY = "#7d8794";
const LOGO = path.join(__dirname, "..", "assets", "newark-logo.jpg");
const M = 44, W = 612, H = 792, CW = W - M * 2, BOT = H - 64;

function renderNfpaPdf(doc, company) {
  return new Promise((resolve, reject) => {
    const t = TEMPLATES[doc.template];
    const pdf = new PDFDocument({ size: "LETTER", margins: { top: M, bottom: 64, left: M, right: M }, bufferPages: true,
      info: { Title: `${t.form} ${t.title}`, Author: company.name, Subject: doc.values.propertyName || "" } });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    try { draw(pdf, t, doc, company); } catch (e) { return reject(e); }
    pdf.end();
  });
}

function draw(pdf, t, d, co) {
  const v = d.values;
  let y = M;
  const ensure = (need) => { if (y + need > BOT) { pdf.addPage(); y = M; } };
  const box = (x, by, on) => {
    pdf.rect(x, by, 9, 9).lineWidth(0.8).strokeColor(INK).stroke();
    if (on) pdf.moveTo(x + 1.5, by + 1.5).lineTo(x + 7.5, by + 7.5).moveTo(x + 7.5, by + 1.5).lineTo(x + 1.5, by + 7.5).lineWidth(1.4).strokeColor(INK).stroke();
  };
  const val = (s, x, vy, w) => pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(9.5).text(String(s), x, vy, { width: w, lineGap: 1 });

  // ---------- letterhead strip ----------
  const hasLogo = fs.existsSync(LOGO);
  if (hasLogo) pdf.image(LOGO, M, y, { width: 46, height: 46 });
  const lx = hasLogo ? M + 56 : M;
  pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text(co.name.toUpperCase(), lx, y + 2, { width: 300, characterSpacing: 0.3 });
  pdf.fillColor(MUT).font("Helvetica").fontSize(7.5).text([`${co.address}, ${co.city}`, [co.office && `Office ${co.office}`, co.cell && `Cell ${co.cell}`, co.fax && `Fax ${co.fax}`].filter(Boolean).join("   "),
    String(co.licenses || "").split(" · ").find((l) => /sprinkler/i.test(l)) || co.licenses].filter(Boolean).join("\n"), lx, pdf.y + 2, { width: 320, lineGap: 1 });
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(t.form, W - M - 120, y + 2, { width: 120, align: "right" });
  if (d.number) pdf.fillColor(MUT).font("Helvetica").fontSize(8).text(`No. ${d.number}`, W - M - 120, pdf.y + 2, { width: 120, align: "right" });
  y = Math.max(pdf.y, y + 46) + 8;
  pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(1.6).strokeColor(RED).stroke();
  y += 12;

  // ---------- title ----------
  pdf.fillColor(GREY).font("Helvetica-Bold").fontSize(13).text(t.kicker, M, y, { width: CW });
  pdf.fillColor(INK).font("Times-Bold").fontSize(17).text(t.title, M, pdf.y + 1, { width: CW * 0.8, lineGap: 0 });
  y = pdf.y + 10;

  if (t.procedure) {
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text("PROCEDURE", M, y);
    pdf.font("Times-Roman").fontSize(8.5).text(t.procedure, M, pdf.y + 2, { width: CW, lineGap: 0.5 });
    y = pdf.y + 10;
  }

  // ---------- header fields ----------
  const hdr = t.header.filter((f) => f.k === "text");
  const wide = new Set(["propertyName", "propertyAddress", "phone"]);
  const leftCol = hdr.filter((f) => wide.has(f.id)), rightCol = hdr.filter((f) => !wide.has(f.id));
  const lw = rightCol.length ? CW * 0.66 : CW, rw = CW - lw - 14;
  const hline = (f, x, hy, w) => {
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text(`${f.label}:`, x, hy + 3, { width: 100 });
    const lbw = Math.min(pdf.widthOfString(`${f.label}:`) + 6, 104);
    pdf.moveTo(x + lbw, hy + 13).lineTo(x + w, hy + 13).lineWidth(0.5).strokeColor(RULE).stroke();
    if (v[f.id]) val(v[f.id], x + lbw + 2, hy + 2, w - lbw - 2);
    return 18;
  };
  let ly = y, ry = y;
  for (const f of leftCol) ly += hline(f, M, ly, lw);
  for (const f of rightCol) ry += hline(f, M + lw + 14, ry, rw);
  y = Math.max(ly, ry) + 2;
  const covers = t.header.find((f) => f.id === "covers");
  if (covers) {
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text("This Report Covers:", M, y + 3);
    let cx = M + 110;
    const sel = Array.isArray(v.covers) ? v.covers : [];
    covers.options.forEach((o, i) => {
      if (i === 3) { cx = M + 110; y += 15; }
      box(cx, y + 2, sel.includes(o));
      pdf.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(o, cx + 14, y + 2.5);
      cx += 110;
    });
    y += 18;
  }
  pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(INK).stroke();
  y += 8;

  // ---------- items ----------
  const LABEL_X = M + 150;
  const ynna = (it) => {
    const opts = it.k === "ynna" ? [["yes", "Yes"], ["no", "No"], ["na", "N/A"]] : it.k === "yno" ? [["yes", "Yes"], ["no", "No"], ["other", "Other"]] : [["yes", "Yes"], ["no", "No"]];
    pdf.font("Times-Roman").fontSize(9.5);
    const lh = pdf.heightOfString(it.label, { width: CW - 150, lineGap: 0.5 });
    const hasRead = it.read && it.read.length;
    ensure(lh + (hasRead ? 22 : 6) + 4);
    const sel = v[it.id];
    opts.forEach(([k, lab], i) => {
      const bx = M + i * 48;
      box(bx, y + 0.5, sel === k);
      pdf.fillColor(INK).font("Times-Roman").fontSize(9).text(lab, bx + 13, y + 0.5, { lineBreak: false });
    });
    pdf.fillColor(INK).font("Times-Roman").fontSize(9.5).text(it.label, LABEL_X, y, { width: CW - 150, lineGap: 0.5 });
    y += Math.max(lh, 11) + 4;
    if (hasRead) {
      let rx = LABEL_X;
      for (const r of it.read) {
        pdf.fillColor(INK).font("Times-Roman").fontSize(9).text(`${r.label}${r.unit ? ` ${r.unit}` : ""}`, rx, y + 2, { lineBreak: false });
        const lx2 = rx + pdf.widthOfString(`${r.label}${r.unit ? ` ${r.unit}` : ""}`) + 6;
        pdf.moveTo(lx2, y + 11).lineTo(lx2 + 70, y + 11).lineWidth(0.5).strokeColor(INK).stroke();
        if (v[r.id]) val(v[r.id], lx2 + 3, y + 1, 66);
        rx = lx2 + 90;
      }
      y += 17;
    }
  };
  const ynRight = (it) => {
    pdf.font("Times-Roman").fontSize(9.5);
    const tw = CW - 110;
    const lh = pdf.heightOfString(it.label, { width: tw, lineGap: 0.5 });
    ensure(lh + 6);
    pdf.fillColor(INK).text(it.label, M, y, { width: tw, lineGap: 0.5 });
    const opts = it.k === "yno" ? [["yes", "Yes"], ["no", "No"], ["other", "Other"]] : [["yes", "Yes"], ["no", "No"]];
    opts.forEach(([k, lab], i) => {
      const bx = W - M - opts.length * 40 + i * 40;
      box(bx, y + 0.5, v[it.id] === k);
      pdf.fillColor(INK).font("Times-Roman").fontSize(9).text(lab, bx + 12, y + 0.5, { lineBreak: false });
    });
    y += Math.max(lh, 11) + 5;
  };
  const textLine = (it) => {
    const label = `${it.label}${it.unit ? ` (${it.unit})` : ""}`;
    pdf.font("Times-Roman").fontSize(9.5);
    const lbw = Math.min(pdf.widthOfString(label) + 8, CW * 0.62);
    const lh = pdf.heightOfString(label, { width: lbw }) ;
    ensure(lh + 8);
    pdf.fillColor(INK).text(label, M, y, { width: lbw });
    const lineY = y + Math.max(lh, 11);
    pdf.moveTo(M + lbw, lineY).lineTo(W - M, lineY).lineWidth(0.5).strokeColor(RULE).stroke();
    if (v[it.id]) val(v[it.id], M + lbw + 3, lineY - 11, W - M - (M + lbw) - 3);
    y = lineY + 6;
  };
  const longBox = (it, minH = 24) => {
    const s = v[it.id] || "";
    pdf.font("Helvetica-Bold").fontSize(9.5);
    const th = s ? pdf.heightOfString(s, { width: CW - 12, lineGap: 1 }) : 0;
    const h = Math.max(minH, th + 18);
    ensure(h + 16);
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(it.label, M, y);
    y = pdf.y + 3;
    pdf.rect(M, y, CW, h).lineWidth(0.7).strokeColor(INK).stroke();
    if (s) val(s, M + 6, y + 6, CW - 12);
    y += h + 8;
  };
  const pick = (it) => {
    ensure(18);
    const sel = Array.isArray(v[it.id]) ? v[it.id] : v[it.id] ? [v[it.id]] : [];
    pdf.fillColor(INK).font("Times-Roman").fontSize(9.5).text(`${it.label}:`, M, y + 0.5, { lineBreak: false });
    let cx = M + pdf.widthOfString(`${it.label}:`) + 12;
    for (const o of it.options) {
      const ow = pdf.widthOfString(o) + 30;
      if (cx + ow > W - M) { y += 15; cx = M + 20; ensure(15); }
      box(cx, y + 0.5, sel.includes(o));
      pdf.fillColor(INK).font("Times-Roman").fontSize(9.5).text(o, cx + 13, y + 0.5, { lineBreak: false });
      cx += ow;
    }
    y += 17;
  };
  const table = (it) => {
    const rows = it.rowLabels ? it.rowLabels.length : it.rows;
    const lead = it.rowLabels ? 78 : 0;
    const cw = (CW - lead) / it.cols.length;
    pdf.font("Helvetica-Bold").fontSize(7.5);
    const hh = Math.max(...it.cols.map((c) => pdf.heightOfString(c.label, { width: cw - 6 }))) + 8;
    ensure(hh + rows * 18 + 6);
    if (it.label) { pdf.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(it.label, M, y); y = pdf.y + 3; }
    pdf.rect(M, y, CW, hh).lineWidth(0.7).strokeColor(INK).stroke();
    it.cols.forEach((c, i) => {
      const cx = M + lead + i * cw;
      if (i || lead) pdf.moveTo(cx, y).lineTo(cx, y + hh + rows * 18).lineWidth(0.5).strokeColor(INK).stroke();
      pdf.fillColor(INK).font("Helvetica-Bold").fontSize(7.5).text(c.label, cx + 3, y + 4, { width: cw - 6, align: "center" });
    });
    y += hh;
    const data = Array.isArray(v[it.id]) ? v[it.id] : [];
    for (let r = 0; r < rows; r++) {
      pdf.rect(M, y, CW, 18).lineWidth(0.5).strokeColor(INK).stroke();
      if (lead) pdf.fillColor(INK).font("Times-Roman").fontSize(8.5).text(it.rowLabels[r], M + 3, y + 5, { width: lead - 6 });
      it.cols.forEach((c, i) => { const s = data[r] && data[r][c.id]; if (s) pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(8.5).text(s, M + lead + i * cw + 3, y + 5, { width: cw - 6, align: "center", height: 11, ellipsis: true }); });
      y += 18;
    }
    y += 8;
  };
  const note = (it) => {
    pdf.font("Times-Roman").fontSize(8.5);
    const h = pdf.heightOfString(it.text, { width: CW - 12, lineGap: 0.5 }) + 12;
    ensure(h + 6);
    pdf.rect(M, y, CW, h).lineWidth(0.5).strokeColor(RULE).stroke();
    pdf.fillColor(INK).text(it.text, M + 6, y + 6, { width: CW - 12, lineGap: 0.5 });
    y += h + 8;
  };
  const item = (it, rightBoxes) => {
    if (it.k === "ynna") return ynna(it);
    if (it.k === "yn" || it.k === "yno") return rightBoxes ? ynRight(it) : ynna(it);
    if (it.k === "text") return textLine(it);
    if (it.k === "long") return longBox(it);
    if (it.k === "pick") return pick(it);
    if (it.k === "table") return table(it);
    if (it.k === "note") return note(it);
  };

  const cert = !t.header.some((f) => f.id === "covers"); // Forms 3 and 4: boxes on the right, the way the certificate prints
  for (const s of t.sections) {
    if (s.title) { ensure(40); pdf.fillColor(INK).font("Helvetica-Bold").fontSize(12.5).text(s.title, M, y); y = pdf.y + 2; }
    for (const p of s.parts) {
      const first = p.groups[0] && p.groups[0].items[0];
      ensure(first && first.k === "table" ? 110 : first && first.k === "note" ? 90 : 62); // keep a heading with its first lines
      if (cert) {
        pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(INK).stroke(); y += 5;
        pdf.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(p.title, M, y); y = pdf.y + 4;
      } else {
        pdf.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(p.title, M, y); y = pdf.y + 4;
      }
      for (const gr of p.groups) {
        if (gr.title) { ensure(44); pdf.fillColor(INK).font("Times-Bold").fontSize(9.5).text(gr.title, cert ? M : LABEL_X, y); y = pdf.y + 3; }
        for (const it of gr.items) item(it, cert);
      }
      y += 2;
    }
  }

  // ---------- sign-off ----------
  pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(INK).stroke(); y += 8;
  const foot = t.footer;
  if (!cert) {
    longBox(foot.find((f) => f.id === "comments"), 60);
    ensure(60);
    y += 10;
    const sigLine = (label, x, w, value) => {
      pdf.fillColor(INK).font("Times-Roman").fontSize(9.5).text(label, x, y);
      const lx2 = x + pdf.widthOfString(label) + 8;
      pdf.moveTo(lx2, y + 11).lineTo(x + w, y + 11).lineWidth(0.6).strokeColor(INK).stroke();
      if (value) val(value, lx2 + 3, y, x + w - lx2 - 3);
    };
    sigLine("Signature:", M, CW * 0.64, v.signature);
    sigLine("Date:", M + CW * 0.68, CW * 0.32, v.signDate);
    y += 22;
    sigLine("License/Certification No.:", M, CW * 0.8, v.license);
    y += 22;
  } else {
    textLine(foot.find((f) => f.id === "contractorName"));
    ensure(80);
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text("Tests witnessed by", M, y, { width: CW, align: "center" }); y = pdf.y + 18;
    const row = (sig, title, date) => {
      const cols = [[sig, CW * 0.48], [title, CW * 0.26], [date, CW * 0.2]];
      let x = M;
      cols.forEach(([f, w]) => {
        pdf.moveTo(x, y).lineTo(x + w, y).lineWidth(0.7).strokeColor(INK).stroke();
        if (v[f.id]) val(v[f.id], x + 2, y - 12, w - 4);
        pdf.fillColor(MUT).font("Times-Roman").fontSize(8.5).text(f.label.replace(/^Tests witnessed by: /, ""), x, y + 3, { width: w });
        x += w + CW * 0.03;
      });
      y += 34;
    };
    row(foot.find((f) => f.id === "ownerSig"), foot.find((f) => f.id === "ownerTitle"), foot.find((f) => f.id === "ownerDate"));
    row(foot.find((f) => f.id === "contractorSig"), foot.find((f) => f.id === "contractorTitle"), foot.find((f) => f.id === "contractorDate"));
    longBox(foot.find((f) => f.id === "comments"), 50);
  }

  // ---------- job photos ----------
  const pics = d.showPhotos ? (d.photos || []) : [];
  if (pics.length) {
    pdf.addPage(); y = M;
    pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text("JOB PHOTOS", M, y, { characterSpacing: 1 });
    pdf.fillColor(MUT).font("Helvetica").fontSize(9).text(`${t.form} · ${t.short}${v.propertyName ? `  ·  ${v.propertyName}` : ""}${v.propertyAddress ? `, ${v.propertyAddress}` : ""}`, M, pdf.y + 2, { width: CW });
    y = pdf.y + 10;
    pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(1.2).strokeColor(RED).stroke();
    y += 14;
    const gap = 16, cw = (CW - gap) / 2, ch = 190;
    pics.forEach((p, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y += ch + 34;
      if (y + ch + 30 > BOT) { pdf.addPage(); y = M; }
      const x = M + col * (cw + gap);
      try { pdf.image(Buffer.from(String(p.src).split(",")[1], "base64"), x, y, { fit: [cw, ch], align: "center", valign: "center" }); }
      catch (e) { pdf.fillColor(MUT).font("Helvetica-Oblique").fontSize(9).text("Photo could not be shown.", x, y + ch / 2, { width: cw, align: "center" }); }
      pdf.rect(x, y, cw, ch).lineWidth(0.4).strokeColor(RULE).stroke();
      pdf.fillColor(INK).font("Helvetica").fontSize(9).text(p.caption || `Photo ${i + 1}`, x, y + ch + 5, { width: cw, height: 24, ellipsis: true });
    });
  }

  // ---------- footer on every page ----------
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.page.margins.bottom = 0;
    const fy = H - 40;
    pdf.moveTo(M, fy - 6).lineTo(W - M, fy - 6).lineWidth(0.4).strokeColor(RULE).stroke();
    pdf.fillColor(MUT).font("Helvetica").fontSize(7.5).text(`NFPA Water-Based Fire Protection Systems Forms  ·  ${t.form}  ·  ${co.name}`, M, fy, { width: CW - 90, lineBreak: false });
    pdf.text(`${i - range.start + 1} of ${range.count}`, W - M - 80, fy, { width: 80, align: "right", lineBreak: false });
  }
}

module.exports = { renderNfpaPdf };
