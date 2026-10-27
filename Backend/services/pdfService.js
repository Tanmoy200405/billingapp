import PDFDocument from "pdfkit";

/**
 * Generate a premium Zudio / Petpooja style PDF invoice Buffer.
 * Dynamically sizes to fit all items in a single sleek receipt without page clipping.
 * @param {Object} invoice
 * @param {Object} storeInfo
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdfBuffer(invoice, storeInfo = {}) {
  return new Promise((resolve, reject) => {
    try {
      const items = invoice.items || [];
      const itemCount = items.length;
      
      // Calculate dynamic page height to fit items cleanly without awkward pagination
      const baseHeight = 340;
      const itemRowHeight = 22;
      const extraRows = (invoice.discountTotal > 0 ? 16 : 0) + 
                        (invoice.regularDiscountAmount > 0 ? 16 : 0) + 
                        (invoice.freebieItemGiven ? 16 : 0) + 
                        (invoice.taxTotal > 0 ? 16 : 0) + 
                        (invoice.paymentMode === "UPI/CASH" ? 18 : 0);
      const calculatedHeight = Math.max(480, baseHeight + (itemCount * itemRowHeight) + extraRows);

      const doc = new PDFDocument({
        size: [288, calculatedHeight], // 76mm / 3 inch standard receipt
        autoFirstPage: true,
        margins: { top: 14, bottom: 14, left: 12, right: 12 },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const storeName = storeInfo.businessName || invoice.businessName || "THE A POP JAKO BITES";
      const storePhone = storeInfo.phone || storeInfo.whatsappNumber || "7003317615";
      const storeAddress = storeInfo.address || "";
      const storeGstin = storeInfo.gstin || "";

      const pageWidth = 288;
      const contentWidth = 264;
      const leftX = 12;
      const rightX = leftX + contentWidth;

      // 1. BRAND HEADER (Zudio / Petpooja Style)
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#111827")
        .text(storeName.toUpperCase(), leftX, doc.y, { width: contentWidth, align: "center" });

      if (storeAddress) {
        doc.fontSize(7.5).font("Helvetica").fillColor("#4B5563")
          .text(storeAddress, leftX, doc.y + 2, { width: contentWidth, align: "center" });
      }

      doc.fontSize(7.5).font("Helvetica").fillColor("#4B5563")
        .text(`Helpline: +91 ${storePhone}`, leftX, doc.y + 1, { width: contentWidth, align: "center" });

      if (storeGstin) {
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#374151")
          .text(`GSTIN: ${storeGstin}`, leftX, doc.y + 1, { width: contentWidth, align: "center" });
      }

      doc.moveDown(0.4);

      // 2. RECEIPT TITLE & BADGE
      const badgeY = doc.y;
      doc.rect(leftX, badgeY, contentWidth, 18).fill("#F3F4F6");
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#1F2937")
        .text("TAX INVOICE / E-RECEIPT", leftX, badgeY + 4, { width: contentWidth, align: "center" });

      doc.y = badgeY + 22;

      // 3. INVOICE METADATA
      const dateStr = invoice.createdAt || invoice.invoiceDate
        ? new Date(invoice.createdAt || invoice.invoiceDate).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : new Date().toLocaleString("en-IN");

      doc.fontSize(7.5).font("Helvetica").fillColor("#374151");
      
      const metaY1 = doc.y;
      doc.font("Helvetica-Bold").text("Bill No: ", leftX, metaY1, { continued: true })
        .font("Helvetica").text(`#${invoice.invoiceNumber || "1"}`);
      
      doc.font("Helvetica-Bold").text("Date: ", leftX + 130, metaY1, { continued: true })
        .font("Helvetica").text(dateStr);

      const metaY2 = doc.y + 2;
      const custName = invoice.partyName || "Cash Customer";
      const custPhone = invoice.partyPhone ? ` (${invoice.partyPhone})` : "";
      doc.font("Helvetica-Bold").text("Customer: ", leftX, metaY2, { continued: true })
        .font("Helvetica").text(`${custName}${custPhone}`, { width: contentWidth - 4 });

      const metaY3 = doc.y + 2;
      doc.font("Helvetica-Bold").text("Payment: ", leftX, metaY3, { continued: true })
        .font("Helvetica").text(`${invoice.paymentMode || "CASH"} [${invoice.paymentStatus || "PAID"}]`);

      doc.moveDown(0.5);

      // Separator Line
      doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor("#D1D5DB").lineWidth(0.8).stroke();
      doc.moveDown(0.3);

      // 4. ITEMS TABLE (Zudio / Petpooja Clean Format)
      const colItem = leftX;
      const colQty = leftX + 135;
      const colRate = leftX + 175;
      const colTotal = leftX + 220;

      const headerY = doc.y;
      doc.rect(leftX, headerY - 2, contentWidth, 14).fill("#E5E7EB");
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#111827");
      doc.text("ITEM", colItem + 2, headerY + 1, { width: 130 });
      doc.text("QTY", colQty, headerY + 1, { width: 35, align: "center" });
      doc.text("RATE", colRate, headerY + 1, { width: 40, align: "right" });
      doc.text("TOTAL", colTotal, headerY + 1, { width: 42, align: "right" });

      doc.y = headerY + 16;

      doc.font("Helvetica").fillColor("#1F2937");
      for (const it of items) {
        const itemY = doc.y;
        const name = it.name || "Item";
        const qty = `${it.quantity || 1} ${it.unit || "PCS"}`;
        const rateVal = Number(it.sellingPrice ?? it.price ?? it.rate ?? 0);
        const totalVal = Number(it.total ?? (rateVal * (it.quantity || 1)));

        doc.fontSize(7.5).text(name, colItem + 2, itemY, { width: 130 });
        doc.text(qty, colQty, itemY, { width: 35, align: "center" });
        doc.text(`Rs.${rateVal.toFixed(0)}`, colRate, itemY, { width: 40, align: "right" });
        doc.font("Helvetica-Bold").text(`Rs.${totalVal.toFixed(0)}`, colTotal, itemY, { width: 42, align: "right" });
        doc.font("Helvetica");

        doc.moveDown(0.25);
      }

      doc.moveDown(0.3);
      doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor("#D1D5DB").lineWidth(0.8).stroke();
      doc.moveDown(0.3);

      // 5. TOTALS & SUMMARY SECTION
      doc.fontSize(7.5).font("Helvetica").fillColor("#374151");

      const printSummaryLine = (label, val, isBold = false, color = "#374151") => {
        const currY = doc.y;
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
        doc.text(label, leftX + 80, currY, { width: 100, align: "right" });
        doc.text(val, colTotal - 10, currY, { width: 52, align: "right" });
        doc.moveDown(0.2);
      };

      printSummaryLine("Subtotal:", `Rs.${Number(invoice.subtotal || invoice.grandTotal || 0).toFixed(2)}`);

      if (invoice.discountTotal > 0) {
        printSummaryLine("Discount:", `-Rs.${Number(invoice.discountTotal).toFixed(2)}`, false, "#059669");
      }

      if (invoice.regularDiscountAmount > 0) {
        printSummaryLine("Regular Perk:", `-Rs.${Number(invoice.regularDiscountAmount).toFixed(2)}`, true, "#059669");
      }

      if (invoice.freebieItemGiven) {
        printSummaryLine("Free Gift:", `${invoice.freebieItemGiven}`, true, "#2563EB");
      }

      if (invoice.taxTotal > 0) {
        printSummaryLine("Taxes (GST):", `Rs.${Number(invoice.taxTotal).toFixed(2)}`);
      }

      doc.moveDown(0.2);
      doc.moveTo(leftX + 80, doc.y).lineTo(rightX, doc.y).strokeColor("#111827").lineWidth(1).stroke();
      doc.moveDown(0.3);

      // GRAND TOTAL ROW (Bold highlight)
      const totalY = doc.y;
      doc.rect(leftX, totalY - 2, contentWidth, 18).fill("#111827");
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#FFFFFF");
      doc.text("GRAND TOTAL", leftX + 8, totalY + 2);
      doc.text(`Rs. ${Number(invoice.grandTotal || 0).toFixed(2)}`, colTotal - 25, totalY + 2, {
        width: 67,
        align: "right",
      });

      doc.y = totalY + 22;

      // Split payment details
      if (invoice.paymentMode === "UPI/CASH") {
        doc.fontSize(7).font("Helvetica").fillColor("#4B5563");
        doc.text(
          `Paid via Cash: Rs.${invoice.cashAmount || 0}  |  Paid via UPI: Rs.${invoice.upiAmount || 0}`,
          leftX,
          doc.y,
          { width: contentWidth, align: "center" }
        );
        doc.moveDown(0.3);
      }

      // Savings callout banner if savings exist
      const totalSaved = (invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0);
      if (totalSaved > 0) {
        const saveY = doc.y;
        doc.rect(leftX, saveY, contentWidth, 14).fill("#DCFCE7");
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#15803D")
          .text(`YOU SAVED Rs. ${totalSaved.toFixed(0)} ON THIS BILL!`, leftX, saveY + 3, {
            width: contentWidth,
            align: "center",
          });
        doc.y = saveY + 18;
      }

      // 6. FOOTER & VERIFIED E-BILL SEAL
      doc.moveDown(0.4);
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#111827")
        .text("Thank you for your visit!", leftX, doc.y, { width: contentWidth, align: "center" });

      doc.fontSize(6.5).font("Helvetica").fillColor("#6B7280")
        .text("This is an authenticated computer-generated digital tax invoice.", leftX, doc.y + 1, {
          width: contentWidth,
          align: "center",
        });

      doc.text(`Powered by Ezo Billing  *  Helpline: ${storePhone}`, leftX, doc.y + 1, {
        width: contentWidth,
        align: "center",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
