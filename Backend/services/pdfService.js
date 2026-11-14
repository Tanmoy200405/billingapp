import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * Generate a clean, authentic, commercial-grade POS & Restaurant receipt PDF.
 * Layout modeled after Petpooja & crisp thermal POS receipts:
 * - Centered Store Logo (toggleable in Settings)
 * - Centered Bold Store Name, Address, Phone, Email, GSTIN & FSSAI
 * - Clean Left-Aligned Bill Metadata (Bill No, Table, Area, PAX, Created On, Customer)
 * - Crisp 4-column Item Table (Item Name, Qty, Rate, Total) with clean wrapping
 * - Bill Break-ups: Subtotal, Area Service Charge / Tax, GST, Discounts, Rounding, Grand Total
 * - Dynamic UPI Payment QR Code right on the bill (scan to pay exact amount)
 * - Customizable Footer Message & Google Maps Link
 *
 * @param {Object} invoice
 * @param {Object} storeInfo
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdfBuffer(invoice, storeInfo = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const items = invoice.items || [];

      const storeName = (storeInfo.businessName || invoice.businessName || "My Restaurant").trim();
      const storePhone = (storeInfo.phone || storeInfo.whatsappNumber || "").toString().trim();
      const storeAddress = (storeInfo.address || "").toString().trim();
      const storeEmail = (storeInfo.email || "").toString().trim();
      const storeGstin = (storeInfo.gstin || "").toString().trim();
      const storeFssai = (storeInfo.fssaiNumber || invoice.fssaiNumber || "").toString().trim();
      const storeLogo = (storeInfo.logo || "").toString().trim();
      const storeMapLocation = (storeInfo.googleMapLocation || invoice.googleMapLocation || "").toString().trim();
      const showMapLocation =
        storeInfo.showGoogleMapOnBill !== false &&
        invoice.showGoogleMapOnBill !== false &&
        Boolean(storeMapLocation);

      const printLogoEnabled =
        storeInfo.printRestaurantLogo !== false &&
        invoice.printRestaurantLogo !== false;

      const upiId = (storeInfo.upiId || invoice.upiId || "").toString().trim();
      const showDynamicUpiQr =
        storeInfo.showDynamicUpiQr !== false &&
        invoice.showDynamicUpiQr !== false &&
        Boolean(upiId);

      const pageWidth = 240; // ~80mm crisp POS receipt width
      const leftX = 14;
      const contentWidth = pageWidth - leftX * 2; // 212pt
      const rightX = leftX + contentWidth;

      // Load logo buffer if available and enabled
      let logoBuf = null;
      if (printLogoEnabled) {
        try {
          if (storeLogo && storeLogo.startsWith("data:image")) {
            const base64Data = storeLogo.split(",")[1];
            if (base64Data) logoBuf = Buffer.from(base64Data, "base64");
          } else if (storeLogo && (storeLogo.startsWith("http://") || storeLogo.startsWith("https://"))) {
            const logoRes = await fetch(storeLogo);
            if (logoRes.ok) {
              logoBuf = Buffer.from(await logoRes.arrayBuffer());
            }
          } else if (storeLogo) {
            const fs = await import("fs");
            if (fs.existsSync(storeLogo)) {
              logoBuf = fs.readFileSync(storeLogo);
            }
          }
          if (!logoBuf) {
            const path = await import("path");
            const fs = await import("fs");
            const defaultLogoPath = path.resolve(process.cwd(), "assets", "bistromate_logo.png");
            if (fs.existsSync(defaultLogoPath)) {
              logoBuf = fs.readFileSync(defaultLogoPath);
            }
          }
        } catch (logoErr) {
          console.warn("Logo embed notice:", logoErr.message);
        }
      }

      // Generate Dynamic UPI QR Code buffer
      let upiQrBuf = null;
      if (showDynamicUpiQr) {
        try {
          const grandVal = Number(invoice.grandTotal || 0);
          const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${grandVal.toFixed(2)}&cu=INR&tn=Bill%20${encodeURIComponent(invoice.invoiceNumber || "1")}`;
          upiQrBuf = await QRCode.toBuffer(upiUrl, {
            width: 140,
            margin: 1,
            color: { dark: "#0F172A", light: "#FFFFFF" },
          });
        } catch (qrErr) {
          console.warn("UPI QR generation notice:", qrErr.message);
        }
      }

      // Estimate dynamic page height cleanly
      let estimatedHeight = 250;
      if (logoBuf) estimatedHeight += 64;
      if (storeAddress) estimatedHeight += Math.ceil(storeAddress.length / 30) * 11 + 4;
      if (storePhone) estimatedHeight += 12;
      if (storeEmail) estimatedHeight += 12;
      if (storeGstin) estimatedHeight += 12;
      if (storeFssai) estimatedHeight += 12;
      if (showMapLocation) estimatedHeight += 24;
      if (invoice.tableName) estimatedHeight += 14;

      for (const it of items) {
        const nm = (it.name || "Item").toString();
        const lines = Math.max(1, Math.ceil(nm.length / 18));
        estimatedHeight += lines * 11 + 6;
      }

      if (invoice.serviceChargeAmount > 0) estimatedHeight += 13;
      if (invoice.discountTotal > 0) estimatedHeight += 13;
      if (invoice.regularDiscountAmount > 0) estimatedHeight += 13;
      if (invoice.freebieItemGiven) estimatedHeight += 13;
      if (invoice.taxTotal > 0) estimatedHeight += 13;
      if (invoice.paymentMode === "UPI/CASH") estimatedHeight += 14;
      if (upiQrBuf) estimatedHeight += 145; // Dynamic UPI QR block
      const totalSaved = (invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0);
      if (totalSaved > 0) estimatedHeight += 18;
      if (invoice.notes) estimatedHeight += 16;

      const doc = new PDFDocument({
        size: [pageWidth, Math.max(340, Math.ceil(estimatedHeight + 40))],
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

      // ─── 1. CENTERED RESTAURANT LOGO (Customizable) ─────────────────────────
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

      // ─── 2. RESTAURANT HEADER (Customizable Details) ─────────────────────────
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

      if (storeFssai) {
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#1E293B")
          .text(`FSSAI Lic. No: ${storeFssai}`, leftX, doc.y + 1, {
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

      // ─── 3. BILL & TABLE METADATA BLOCK ─────────────────────────────────────
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

      // Table & Dine-in Area info (Petpooja style)
      if (invoice.tableName) {
        const areaTag = invoice.areaName ? ` (${invoice.areaName})` : "";
        const paxTag = invoice.pax ? ` • ${invoice.pax} Guests` : "";
        doc.font("Helvetica-Bold").fillColor("#2563EB");
        doc.text(`Table: ${invoice.tableName}${areaTag}${paxTag}`, leftX, doc.y + 1.5, { width: contentWidth });
      }

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

      // ─── 5. BILL BREAK-UPS & TOTALS SECTION ─────────────────────────────────
      const printRow = (label, value, isBold = false, color = "#1E293B", fontSize = 8.4) => {
        const y = doc.y;
        doc.fontSize(fontSize).font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
        doc.text(label, leftX, y, { width: 125 });
        doc.text(value, leftX + 125, y, { width: contentWidth - 125, align: "right" });
        doc.y = y + (fontSize >= 10 ? 15 : 12.5);
      };

      const subtotalVal = Number(invoice.subtotal || invoice.grandTotal || 0);
      printRow("Subtotal", `Rs. ${subtotalVal.toFixed(2)}`);

      if (invoice.serviceChargeAmount > 0) {
        const scRate = invoice.serviceChargeRate ? ` (${invoice.serviceChargeRate}%)` : "";
        printRow(`Service Charge${scRate}`, `Rs. ${Number(invoice.serviceChargeAmount).toFixed(2)}`, false, "#2563EB");
      }

      if (invoice.discountTotal > 0) {
        printRow("Discount", `-Rs. ${Number(invoice.discountTotal).toFixed(2)}`, false, "#059669");
      }

      if (invoice.regularDiscountAmount > 0) {
        const discRate = invoice.regularDiscountAppliedPercent || invoice.regularDiscountRate;
        const discLabel = discRate ? `VIP Discount (${discRate}%)` : "VIP Discount";
        printRow(discLabel, `-Rs. ${Number(invoice.regularDiscountAmount).toFixed(2)}`, true, "#059669");
      }

      if (invoice.freebieItemGiven) {
        printRow("Complimentary", `${invoice.freebieItemGiven}`, true, "#2563EB");
      }

      if (invoice.taxTotal > 0) {
        printRow("GST / Tax", `Rs. ${Number(invoice.taxTotal).toFixed(2)}`);
      }

      if (invoice.roundOff && Math.abs(invoice.roundOff) > 0) {
        printRow("Round Off", `Rs. ${invoice.roundOff > 0 ? "+" : ""}${Number(invoice.roundOff).toFixed(2)}`);
      }

      doc.y += 2;
      drawSolidLine(doc.y, "#0F172A", 0.9);
      doc.y += 5;

      const grandVal = Number(invoice.grandTotal || 0);
      printRow("GRAND TOTAL", `Rs. ${grandVal.toFixed(2)}`, true, "#0F172A", 10.5);

      drawSolidLine(doc.y - 1, "#0F172A", 0.9);
      doc.y += 5;

      const payStatus = (invoice.paymentStatus || "PAID").toUpperCase();
      printRow("Payment Mode", `${paymentMode} (${payStatus})`, true, paymentMode === "CREDIT" ? "#DC2626" : "#0F172A", 8);

      if (paymentMode === "UPI/CASH") {
        printRow(
          "Split Breakdown",
          `Cash: Rs.${invoice.cashAmount || 0} | UPI: Rs.${invoice.upiAmount || 0}`,
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
          .text(`🎉 You Saved Rs. ${totalSaved.toFixed(0)} on this bill!`, leftX, doc.y, {
            width: contentWidth,
            align: "center",
          });
      }

      // ─── 6. DYNAMIC UPI PAYMENT QR CODE (Petpooja Style) ─────────────────────
      if (upiQrBuf) {
        doc.y += 6;
        drawDashedLine(doc.y);
        doc.y += 6;

        doc
          .fontSize(8.5)
          .font("Helvetica-Bold")
          .fillColor("#0F172A")
          .text("SCAN TO PAY VIA ANY UPI APP", leftX, doc.y, {
            width: contentWidth,
            align: "center",
          });

        doc.y += 3;
        const qrSize = 96;
        const qrX = leftX + (contentWidth - qrSize) / 2;
        doc.image(upiQrBuf, qrX, doc.y, { width: qrSize, height: qrSize });
        doc.y += qrSize + 4;

        doc
          .fontSize(7.5)
          .font("Helvetica-Bold")
          .fillColor("#2563EB")
          .text(`Amount: Rs. ${grandVal.toFixed(2)}`, leftX, doc.y, {
            width: contentWidth,
            align: "center",
          });

        doc
          .fontSize(7)
          .font("Helvetica")
          .fillColor("#64748B")
          .text(`UPI ID: ${upiId}`, leftX, doc.y + 1, {
            width: contentWidth,
            align: "center",
          });
      }

      // ─── 7. CUSTOMIZABLE FOOTER MESSAGE ─────────────────────────────────────
      doc.y += 6;
      drawDashedLine(doc.y);
      doc.y += 7;

      const footerMsg = (
        storeInfo.billFooterMessage ||
        invoice.billFooterMessage ||
        "Thank you! Visit again."
      ).trim();

      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor("#0F172A")
        .text(footerMsg, leftX, doc.y, {
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

