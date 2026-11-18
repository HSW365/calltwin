/**
 * Compact letterhead strip for the continuation pages of every PDF: company name, address and phone, brand rule.
 */
const HEAD_BOTTOM = 66;
const MUT = "#5a6878";

function drawRunningHead(pdf, co, { M, W, right }) {
  const brand = co.brand || "#0b2a4a";
  const top = 22;
  pdf.fillColor(brand).font("Helvetica-Bold").fontSize(12).text(String(co.name || "").toUpperCase(), M, top + 2, { width: W - M * 2 - 140, lineBreak: false, characterSpacing: 0.3 });
  const line = [[co.address, co.city].filter(Boolean).join(", "), co.office && `Office ${co.office}`, co.cell && `Cell ${co.cell}`, co.fax && `Fax ${co.fax}`].filter(Boolean).join("  ·  ");
  pdf.fillColor(MUT).font("Helvetica").fontSize(7.5).text(line, M, top + 19, { width: W - M * 2, lineBreak: false });
  if (right) pdf.fillColor(MUT).font("Helvetica-Bold").fontSize(8).text(right, W - M - 130, top + 3, { width: 130, align: "right", lineBreak: false });
  pdf.moveTo(M, HEAD_BOTTOM - 8).lineTo(W - M, HEAD_BOTTOM - 8).lineWidth(1.4).strokeColor(brand).stroke();
  pdf.x = M; pdf.y = HEAD_BOTTOM;
}

/** Draw the strip on every page added after the first one. Call right after creating the PDFDocument. */
function withRunningHead(pdf, co, opts) {
  pdf.on("pageAdded", () => drawRunningHead(pdf, co, opts));
}

module.exports = { drawRunningHead, withRunningHead, HEAD_BOTTOM };
