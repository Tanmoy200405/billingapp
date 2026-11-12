import PDFDocument from "pdfkit";

/**
 * Generate a clean, authentic, commercial-grade POS & Restaurant receipt PDF.
 * Layout modeled after crisp thermal POS receipts (no barcode):
 * - Centered Store Logo (if configured)
 * - Centered Bold Store Name, Address, Phone, Email (@), GSTIN
 * - Clean Left-Aligned Bill Metadata (Bill No, Created On, Bill To / Payment, Customer)
 * - Crisp 4-column Item Table (Item Name, Qty, Rate, Total) with clean wrapping
 * - Clean Subtotal, Discount, Freebie, Tax, Bold Grand Total, Savings & Footer
 *
 * @param {Object} invoice
 * @param {Object} storeInfo
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdfBuffer(invoice, storeInfo = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const items = invoice.items || [];

      const storeName = (storeInfo.businessName || invoice.businessName || "My Store").trim();
      const storePhone = (storeInfo.phone || storeInfo.whatsappNumber || "").toString().trim();
      const storeAddress = (storeInfo.address || "").toString().trim();
      const storeEmail = (storeInfo.email || "").toString().trim();
      const storeGstin = (storeInfo.gstin || "").toString().trim();
      const storeLogo = (storeInfo.logo || "").toString().trim();
      const storeMapLocation = (storeInfo.googleMapLocation || invoice.googleMapLocation || "").toString().trim();
      const showMapLocation =
        storeInfo.showGoogleMapOnBill !== false &&
        invoice.showGoogleMapOnBill !== false &&
        Boolean(storeMapLocation);

      const pageWidth = 240; // ~80mm crisp POS receipt width
      const leftX = 14;
      const contentWidth = pageWidth - leftX * 2; // 212pt
      const rightX = leftX + contentWidth;

      // Load logo buffer if available
      let logoBuf = null;
      try {
        if (storeLogo) {
          if (storeLogo.startsWith("data:image")) {
            const base64Data = storeLogo.split(",")[1];
            if (base64Data) logoBuf = Buffer.from(base64Data, "base64");
          } else if (storeLogo.startsWith("http://") || storeLogo.startsWith("https://")) {
            const logoRes = await fetch(storeLogo);
            if (logoRes.ok) {
              logoBuf = Buffer.from(await logoRes.arrayBuffer());
            }
          } else {
            const fs = await import("fs");
            if (fs.existsSync(storeLogo)) {
              logoBuf = fs.readFileSync(storeLogo);
            }
          }
        }
      } catch (logoErr) {
        console.warn("Logo embed notice:", logoErr.message);
      }

      // Estimate dynamic page height cleanly so there is never clipping or excessive white space
      let estimatedHeight = 225;
      if (logoBuf) estimatedHeight += 64;
      if (storeAddress) estimatedHeight += Math.ceil(storeAddress.length / 30) * 11 + 4;
      if (storePhone) estimatedHeight += 12;
      if (storeEmail) estimatedHeight += 12;
      if (storeGstin) estimatedHeight += 12;
      if (showMapLocation) estimatedHeight += 24;

      for (const it of items) {
        const nm = (it.name || "Item").toString();
        const lines = Math.max(1, Math.ceil(nm.length / 18));
        estimatedHeight += lines * 11 + 6;
      }

      if (invoice.discountTotal > 0) estimatedHeight += 13;
      if (invoice.regularDiscountAmount > 0) estimatedHeight += 13;
      if (invoice.freebieItemGiven) estimatedHeight += 13;
      if (invoice.taxTotal > 0) estimatedHeight += 13;
      if (invoice.paymentMode === "UPI/CASH") estimatedHeight += 14;
      const totalSaved = (invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0);
      if (totalSaved > 0) estimatedHeight += 18;
      if (invoice.notes) estimatedHeight += 16;

      const doc = new PDFDocument({
        size: [pageWidth, Math.max(300, Math.ceil(estimatedHeight + 30))],
        autoFirstPage: true,
        bufferPages: true,
        margins: { top: 14, bottom: 12, left: leftX, right: leftX },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const drawDashedLine = (yPos) => {
        doc
          .moveTo(leftX, yPos)
          .lineTo(rightX, yPos)
          .dash(2.5, { space: 2 })
          .strokeColor("#94A3B8")
          .lineWidth(0.6)
          .stroke();
        doc.undash();
      };

      const drawSolidLine = (yPos, color = "#0F172A", width = 0.8) => {
        doc
          .moveTo(leftX, yPos)
          .lineTo(rightX, yPos)
          .strokeColor(color)
          .lineWidth(width)
          .stroke();
      };

      doc.y = 14;

      // ─── 1. CENTERED STORE LOGO ─────────────────────────────────────────────
      if (logoBuf) {
        try {
          const logoSize = 54;
          const logoX = leftX + (contentWidth - logoSize) / 2;
          doc.image(logoBuf, logoX, doc.y, {
            fit: [logoSize, logoSize],
            align: "center",
            valign: "center",
          });
          doc.y += logoSize + 6;
        } catch (imgErr) {
          console.warn("Logo render notice:", imgErr.message);
        }
      }

      // ─── 2. CLEAN STORE HEADER ──────────────────────────────────────────────
      doc
        .fontSize(12.5)
        .font("Helvetica-Bold")
        .fillColor("#0F172A")
        .text(storeName.toUpperCase(), leftX, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(0.15);

      if (storeAddress) {
        doc
          .fontSize(8.2)
          .font("Helvetica")
          .fillColor("#1E293B")
          .text(storeAddress, leftX, doc.y, {
            width: contentWidth,
            align: "center",
            lineGap: 1.5,
          });
      }

      if (storePhone) {
        doc
          .fontSize(8.2)
          .font("Helvetica")
          .fillColor("#1E293B")
          .text(`Phone: ${storePhone}`, leftX, doc.y + 1, {
            width: contentWidth,
            align: "center",
          });
      }

      if (storeEmail) {
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#334155")
          .text(`@: ${storeEmail}`, leftX, doc.y + 1, {
            width: contentWidth,
            align: "center",
          });
      }

      if (storeGstin) {
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor("#0F172A")
          .text(`GSTIN: ${storeGstin}`, leftX, doc.y + 1, {
            width: contentWidth,
            align: "center",
          });
      }

      if (showMapLocation) {
        const cleanMapUrl = storeMapLocation.startsWith("http")
          ? storeMapLocation
          : `https://${storeMapLocation}`;
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor("#2563EB")
          .text("📍 View on Google Maps", leftX, doc.y + 1, {
            width: contentWidth,
            align: "center",
            link: cleanMapUrl,
            underline: true,
          });
      }

      doc.y += 7;
      drawDashedLine(doc.y);
      doc.y += 7;

      // ─── 3. BILL METADATA BLOCK (Clean Left-Aligned Receipt Style) ──────────
      const rawDate = invoice.invoiceDate || invoice.createdAt || new Date();
      const formattedDate = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
        .format(new Date(rawDate))
        .replace(",", "")
        .toUpperCase();

      const billNo = (invoice.invoiceNumber || "1").toString();
      const paymentMode = (invoice.paymentMode || "CASH").toUpperCase();
      const saleLabel =
        paymentMode === "CREDIT"
          ? "Credit Sale (Due)"
          : paymentMode === "UPI"
          ? "UPI Sale"
          : paymentMode === "UPI/CASH"
          ? "Split Sale (Cash + UPI)"
          : `${paymentMode === "CASH" ? "Cash" : paymentMode} Sale`;

      const custName = (invoice.partyName || "").trim();
      const custPhone = (invoice.partyPhone || "").trim();

      doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#0F172A");
      doc.text(`Bill No: ${billNo}`, leftX, doc.y, { width: contentWidth });
      doc.font("Helvetica").fillColor("#1E293B");
      doc.text(`Created On: ${formattedDate}`, leftX, doc.y + 1.5, { width: contentWidth });
      doc.text(`Bill To: ${saleLabel}`, leftX, doc.y + 1.5, { width: contentWidth });

      if (custName && custName !== "Walk-in Customer") {
        const custLine = custPhone ? `${custName} | ${custPhone}` : custName;
        doc.text(`Customer: ${custLine}`, leftX, doc.y + 1.5, { width: contentWidth });
      } else if (custPhone) {
        doc.text(`Phone: ${custPhone}`, leftX, doc.y + 1.5, { width: contentWidth });
      }

      doc.y += 6;
      drawDashedLine(doc.y);
      doc.y += 6;

      // ─── 4. ITEMS TABLE ─────────────────────────────────────────────────────
      const colItemX = leftX;
      const colItemW = 104;
      const colQtyX = leftX + 106;
      const colQtyW = 26;
      const colRateX = leftX + 134;
      const colRateW = 36;
      const colTotalX = leftX + 172;
      const colTotalW = 40;

      const headerY = doc.y;
      doc.fontSize(8.2).font("Helvetica-Bold").fillColor("#0F172A");
      doc.text("Item Name", colItemX, headerY, { width: colItemW });
      doc.text("Qty", colQtyX, headerY, { width: colQtyW, align: "center" });
      doc.text("Rate", colRateX, headerY, { width: colRateW, align: "right" });
      doc.text("Total", colTotalX, headerY, { width: colTotalW, align: "right" });

      doc.y = headerY + 13;
      drawSolidLine(doc.y, "#334155", 0.7);
      doc.y += 5;

      for (const it of items) {
        const rowY = doc.y;
        const pQty = Number(it.parcelQuantity || 0);
        const qty = Number(it.quantity || 1);
        const parcelLabel =
          pQty > 0
            ? pQty >= qty
              ? " [PARCEL]"
              : ` [${pQty}P/${qty - pQty}D]`
            : "";
        const name = `${(it.name || "Item").toString()}${parcelLabel}`;
        const rateVal = Number(it.sellingPrice ?? it.price ?? it.rate ?? 0);
        const totalVal = Number(it.total ?? rateVal * qty);

        doc.fontSize(8.2).font("Helvetica").fillColor("#0F172A");
        const nameHeight = doc.heightOfString(name, { width: colItemW });

        doc.text(name, colItemX, rowY, { width: colItemW });
        doc.text(`${qty}`, colQtyX, rowY, { width: colQtyW, align: "center" });
        doc.text(Number.isInteger(rateVal) ? `${rateVal}` : rateVal.toFixed(2), colRateX, rowY, {
          width: colRateW,
          align: "right",
        });
        doc.font("Helvetica-Bold");
        doc.text(Number.isInteger(totalVal) ? `${totalVal}` : totalVal.toFixed(2), colTotalX, rowY, {
          width: colTotalW,
          align: "right",
        });

        doc.y = rowY + Math.max(13, nameHeight + 4);
      }

      doc.y += 2;
      drawDashedLine(doc.y);
      doc.y += 6;

      // ─── 5. TOTALS SECTION ──────────────────────────────────────────────────
      const printRow = (label, value, isBold = false, color = "#1E293B", fontSize = 8.4) => {
        const y = doc.y;
        doc.fontSize(fontSize).font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
        doc.text(label, leftX, y, { width: 125 });
        doc.text(value, leftX + 125, y, { width: contentWidth - 125, align: "right" });
        doc.y = y + (fontSize >= 10 ? 15 : 12.5);
      };

      const subtotalVal = Number(invoice.subtotal || invoice.grandTotal || 0);
      printRow("Subtotal", `Rs. ${subtotalVal.toFixed(2)}`);

      if (invoice.discountTotal > 0) {
        printRow("Discount", `-Rs. ${Number(invoice.discountTotal).toFixed(2)}`, false, "#059669");
      }

      if (invoice.regularDiscountAmount > 0) {
        const discRate = invoice.regularDiscountAppliedPercent || invoice.regularDiscountRate;
        const discLabel = discRate ? `Discount (${discRate}%)` : "VIP Discount";
        printRow(discLabel, `-Rs. ${Number(invoice.regularDiscountAmount).toFixed(2)}`, true, "#059669");
      }

      if (invoice.freebieItemGiven) {
        printRow("Complimentary", `${invoice.freebieItemGiven}`, true, "#2563EB");
      }

      if (invoice.taxTotal > 0) {
        printRow("GST / Tax", `Rs. ${Number(invoice.taxTotal).toFixed(2)}`);
      }

      doc.y += 2;
      drawSolidLine(doc.y, "#0F172A", 0.9);
      doc.y += 5;

      const grandVal = Number(invoice.grandTotal || 0);
      printRow("GRAND TOTAL", `Rs. ${grandVal.toFixed(2)}`, true, "#0F172A", 10.5);

      drawSolidLine(doc.y - 1, "#0F172A", 0.9);
      doc.y += 5;

      const payStatus = (invoice.paymentStatus || "PAID").toUpperCase();
      printRow("Payment", `${paymentMode} (${payStatus})`, true, paymentMode === "CREDIT" ? "#DC2626" : "#0F172A", 8);

      if (paymentMode === "UPI/CASH") {
        printRow(
          "Split Paid",
          `Cash Rs.${invoice.cashAmount || 0} + UPI Rs.${invoice.upiAmount || 0}`,
          false,
          "#334155",
          7.8
        );
      }

      if (totalSaved > 0) {
        doc.y += 2;
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor("#059669")
          .text(`You Saved Rs. ${totalSaved.toFixed(0)} on this bill!`, leftX, doc.y, {
            width: contentWidth,
            align: "center",
          });
      }

      // ─── 6. CLEAN FOOTER (NO BARCODE) ───────────────────────────────────────
      doc.y += 6;
      drawDashedLine(doc.y);
      doc.y += 7;

      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor("#0F172A")
        .text("Thank you! Visit again.", leftX, doc.y, {
          width: contentWidth,
          align: "center",
        });

      if (showMapLocation) {
        const cleanMapUrl = storeMapLocation.startsWith("http")
          ? storeMapLocation
          : `https://${storeMapLocation}`;
        doc.y += 4;
        doc
          .fontSize(7.5)
          .font("Helvetica-Bold")
          .fillColor("#2563EB")
          .text("📍 Locate Us on Google Maps", leftX, doc.y, {
            width: contentWidth,
            align: "center",
            link: cleanMapUrl,
            underline: true,
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
