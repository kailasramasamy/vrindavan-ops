import PDFDocument from "pdfkit";

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(val) {
  return val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRs(val) {
  return `Rs. ${fmt(val)}`;
}

/**
 * Generate a tax invoice PDF from inward PO data.
 * @param {object} data - Invoice data with supplier, buyer, items, totals
 * @param {import('stream').Writable} stream - Output stream (res or file)
 */
export function generateInvoicePdf(data, stream) {
  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: false });
  doc.pipe(stream);
  doc.addPage();

  const pageWidth = doc.page.width - 100;
  const leftX = 50;
  const rightX = doc.page.width - 50;

  // ── Header ──────────────────────────────────────────────────────────
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#1d4ed8").text("TAX INVOICE", leftX, 50, { align: "right" });

  // Supplier (invoice issuer) info - top left
  const supplier = data.supplier || {};
  doc.fillColor("#000000").fontSize(13).font("Helvetica-Bold").text(supplier.name || "Supplier", leftX, 50);
  doc.font("Helvetica").fontSize(9).fillColor("#374151");
  if (supplier.contactName) doc.text(supplier.contactName);
  if (supplier.address) doc.text(supplier.address, { width: 250 });
  if (supplier.phone) doc.text(`Phone: ${supplier.phone}`);
  if (supplier.email) doc.text(`Email: ${supplier.email}`);
  if (supplier.gstNumber) doc.text(`GSTN: ${supplier.gstNumber}`);

  // ── Invoice Info Bar ──────────────────────────────────────────────────
  const infoY = doc.y + 12;
  doc.rect(leftX, infoY, pageWidth, 28).fill("#eff6ff");
  doc.fill("#1e40af").font("Helvetica-Bold").fontSize(9);
  doc.text(`Invoice: ${data.invoiceNumber}`, leftX + 10, infoY + 8);
  doc.font("Helvetica").fill("#1e40af");
  doc.text(`Date: ${data.invoiceDate}`, leftX + 200, infoY + 8);
  doc.text(`PO Ref: ${data.poNumber}`, leftX + 370, infoY + 8);

  // ── Bill To / Ship To ─────────────────────────────────────────────────
  const blockY = infoY + 40;

  // Bill To (buyer)
  const buyer = data.buyer || {};
  const buyerName = buyer.name || "Think Fresh";
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#6b7280").text("BILL TO", leftX, blockY);
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(11).text(buyerName, leftX, blockY + 14);
  doc.font("Helvetica").fontSize(9);
  let billY = blockY + 30;
  if (buyer.entityName && buyer.entityName !== buyerName) {
    doc.text(buyer.entityName, leftX, billY);
    billY += 14;
  }
  if (buyer.address) {
    const addrH = doc.heightOfString(buyer.address, { width: 220 });
    doc.text(buyer.address, leftX, billY, { width: 220 });
    billY += addrH + 4;
  }
  if (buyer.phone) { doc.text(`Phone: ${buyer.phone}`, leftX, billY); billY += 14; }
  if (buyer.email) { doc.text(`Email: ${buyer.email}`, leftX, billY); billY += 14; }
  if (buyer.gstn) { doc.text(`GSTN: ${buyer.gstn}`, leftX, billY); billY += 14; }

  // Ship To (warehouse)
  const warehouse = data.warehouse || {};
  const shipX = leftX + 300;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#6b7280").text("SHIP TO (WAREHOUSE)", shipX, blockY);
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(11).text(warehouse.name || "Warehouse", shipX, blockY + 14);
  doc.font("Helvetica").fontSize(9);
  let shipY = blockY + 30;
  if (warehouse.address) {
    const addrH = doc.heightOfString(warehouse.address, { width: 200 });
    doc.text(warehouse.address, shipX, shipY, { width: 200 });
    shipY += addrH + 4;
  }
  if (warehouse.code) { doc.text(`Code: ${warehouse.code}`, shipX, shipY); shipY += 14; }

  // ── Items Table ─────────────────────────────────────────────────────
  const tableTop = Math.max(billY + 20, shipY + 20, 240);

  const col = {
    num: leftX,
    product: leftX + 22,
    uom: leftX + 180,
    qty: leftX + 240,
    rate: leftX + 270,
    amount: leftX + 340,
    gstPct: leftX + 400,
    total: leftX + 445,
  };
  const totalW = rightX - col.total - 6;

  function drawTableHeaderCells(y) {
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(7);
    doc.text("#", col.num + 4, y + 7);
    doc.text("Product / Service", col.product, y + 7);
    doc.text("UOM", col.uom, y + 7);
    doc.text("Qty", col.qty, y + 7, { width: 25, align: "right" });
    doc.text("Rate (incl GST)", col.rate, y + 7, { width: 65, align: "right" });
    doc.text("Amount", col.amount, y + 7, { width: 55, align: "right" });
    doc.text("GST%", col.gstPct, y + 7, { width: 25, align: "right" });
    doc.text("Total", col.total, y + 7, { width: totalW, align: "right" });
  }

  doc.rect(leftX, tableTop, pageWidth, 22).fill("#1e40af");
  drawTableHeaderCells(tableTop);

  const pageBottom = doc.page.height - 60;
  function drawTableHeader(y) {
    doc.rect(leftX, y, pageWidth, 22).fill("#1e40af");
    drawTableHeaderCells(y);
    return y + 22;
  }

  let rowY = tableTop + 22;
  let sumAmount = 0;
  let sumGst = 0;
  const items = data.items || [];

  items.forEach((item, idx) => {
    const qty = Number(item.ordered_qty || item.orderedQty || item.accepted_qty || 0);
    const unitCostIncl = Number(item.unit_cost || item.unitCost || 0);
    const gstPct = Number(item.gst_pct || item.gstPct || 0);
    const lineAmount = qty * unitCostIncl;
    const baseRate = gstPct > 0 ? lineAmount / (1 + gstPct / 100) : lineAmount;
    const lineGst = lineAmount - baseRate;

    sumAmount += lineAmount;
    sumGst += lineGst;

    if (rowY + 20 > pageBottom) {
      doc.addPage();
      rowY = drawTableHeader(50);
    }

    if (idx % 2 === 0) {
      doc.rect(leftX, rowY, pageWidth, 20).fill("#f9fafb");
    }

    const uom = item.unit_of_measure || item.unitOfMeasure || "-";
    const productName = item.product_name || item.productName || "Item";

    doc.fill("#000000").font("Helvetica").fontSize(7);
    doc.text(String(idx + 1), col.num + 4, rowY + 6);
    doc.text(productName, col.product, rowY + 6, { width: 155 });
    doc.text(uom, col.uom, rowY + 6, { width: 58 });
    doc.text(String(qty), col.qty, rowY + 6, { width: 25, align: "right" });
    doc.text(fmt(unitCostIncl), col.rate, rowY + 6, { width: 65, align: "right" });
    doc.text(fmt(lineAmount), col.amount, rowY + 6, { width: 55, align: "right" });
    doc.text(gstPct > 0 ? `${gstPct}%` : "-", col.gstPct, rowY + 6, { width: 25, align: "right" });
    doc.text(fmt(lineAmount), col.total, rowY + 6, { width: totalW, align: "right" });

    rowY += 20;
  });

  doc.moveTo(leftX, rowY).lineTo(rightX, rowY).strokeColor("#d1d5db").lineWidth(0.5).stroke();

  if (rowY + 80 > pageBottom) {
    doc.addPage();
    rowY = 50;
  }

  // ── Totals ────────────────────────────────────────────────────────
  rowY += 8;
  const labelX = rightX - 200;
  const valX = rightX - 100;
  const valW = 95;

  doc.font("Helvetica").fontSize(9).fill("#000000");
  doc.text("Subtotal (excl GST):", labelX, rowY, { width: 95, align: "right" });
  doc.text(fmtRs(sumAmount - sumGst), valX, rowY, { width: valW, align: "right" });
  rowY += 15;

  doc.text("GST:", labelX, rowY, { width: 95, align: "right" });
  doc.text(fmtRs(sumGst), valX, rowY, { width: valW, align: "right" });
  rowY += 15;

  // Grand total box
  const boxX = labelX - 5;
  const boxW = rightX - boxX;
  doc.rect(boxX, rowY, boxW, 26).fill("#eff6ff");
  doc.fill("#1e40af").font("Helvetica-Bold").fontSize(11);
  doc.text("Total Amount:", labelX, rowY + 8, { width: 95, align: "right" });
  doc.text(fmtRs(sumAmount), valX, rowY + 8, { width: valW, align: "right" });

  // ── Notes ───────────────────────────────────────────────────────────
  rowY += 40;
  if (data.notes) {
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(9).text("Notes:", leftX, rowY);
    doc.font("Helvetica").fontSize(9).text(data.notes, leftX, rowY + 14, { width: pageWidth });
    rowY += 35;
  }

  // ── Footer ─────────────────────────────────────────────────────────
  rowY += 20;
  doc.moveTo(leftX, rowY).lineTo(rightX, rowY).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.font("Helvetica").fontSize(7).fillColor("#9ca3af");
  doc.text("This is a computer-generated tax invoice. No signature required.", leftX, rowY + 8);
  doc.text(`${data.invoiceNumber} | Generated ${formatDate(new Date())}`, leftX, rowY + 8, { align: "right", width: pageWidth });

  doc.end();
}
