/**
 * New Ark letterhead for the continuation pages of every PDF (proposal / estimate / invoice and NFPA Forms 3-6).
 * Page 1 of each document draws its own full letterhead; every page after it (overflow pages, job-photo pages)
 * gets this compact strip -- logo, company name, address and phone, red rule -- so no sheet goes out bare.
 */
const path = require("path");
const fs = require("fs");

const NAVY = "#0b2a4a", RED = "#c4161c", MUT = "#5a6878";
const LOGO = path.join(__dirname, "..", "assets", "newark-logo.jpg");

/** Space the strip takes from the top of the page; content on continuation pages starts at this y. */
const HEAD_BOTTOM = 66;

/**
 * Draw the compact letterhead on the page pdfkit just added.
 * @param pdf    PDFDocument
 * @param co     company block (name, address, city, office, cell, fax)
 * @param opts   { M, W, right } -- left/right margin, page width, small label shown at the right ("Estimate EST-0012")
 */
function drawRunningHead(pdf, co, { M, W, right }) {
  const hasLogo = fs.existsSync(LOGO);
  const top = 22;
  if (hasLogo) { try { pdf.image(LOGO, M, top, { width: 36, height: 36 }); } catch (e) { /* bad image file: text letterhead still prints */ } }
  const lx = hasLogo ? M + 46 : M;
  const w = W - M - lx - 130;
  pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(12).text(String(co.name || "New Ark Plumbing").toUpperCase(), lx, top + 2, { width: w, lineBreak: false, characterSpacing: 0.3 });
  const line = [[co.address, co.city].filter(Boolean).join(", "), co.office && `Office ${co.office}`, co.cell && `Cell ${co.cell}`, co.fax && `Fax ${co.fax}`].filter(Boolean).join("  ·  ");
  pdf.fillColor(MUT).font("Helvetica").fontSize(7.5).text(line, lx, top + 19, { width: W - M - lx, lineBreak: false });
  if (right) pdf.fillColor(MUT).font("Helvetica-Bold").fontSize(8).text(right, W - M - 130, top + 3, { width: 130, align: "right", lineBreak: false });
  pdf.moveTo(M, HEAD_BOTTOM - 8).lineTo(W - M, HEAD_BOTTOM - 8).lineWidth(1.4).strokeColor(RED).stroke();
  pdf.x = M; pdf.y = HEAD_BOTTOM;
}

/** Draw the strip on every page added after the first one. Call right after creating the PDFDocument. */
function withRunningHead(pdf, co, opts) {
  pdf.on("pageAdded", () => drawRunningHead(pdf, co, opts));
}

module.exports = { drawRunningHead, withRunningHead, HEAD_BOTTOM };
