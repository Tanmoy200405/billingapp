import PDFDocument from "pdfkit";

/**
 * Generate a clean, professional thermal/A5 style PDF invoice Buffer.
 * @param {Object} invoice
 * @param {Object} storeInfo
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdfBuffer(invoice, storeInfo = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [280, 600], // Thermal 80mm / receipt friendly or auto-extending
        autoFirstPage: true,
        margins: { top: 18, bottom: 18, left: 14, right: 14 },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const storeName = storeInfo.businessName || invoice.businessName || "THE A POP JAKO BITES";
      const storePhone = storeInfo.phone || storeInfo.whatsappNumber || "7003317615";
      const storeAddress = storeInfo.address || "";
      const storeGstin = storeInfo.gstin || "";

      // Store Header
      doc.fontSize(14).font("Helvetica-Bold").text(storeName.toUpperCase(), { align: "center" });
      if (storeAddress) {
        doc.fontSize(8).font("Helvetica").text(storeAddress, { align: "center" });
      }
      doc.fontSize(8).font("Helvetica").text(`Contact: ${storePhone}`, { align: "center" });
      if (storeGstin) {
        doc.fontSize(8).font("Helvetica").text(`GSTIN: ${storeGstin}`, { align: "center" });
      }

      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica-Bold").text("--- RETAIL INVOICE ---", { align: "center" });
      doc.moveDown(0.3);

      // Invoice & Customer Info
      doc.fontSize(8).font("Helvetica");
      const billDate = invoice.createdAt ? new Date(invoice.createdAt).toLocaleString("en-IN") : new Date().toLocaleString("en-IN");
      doc.text(`Bill No: #${invoice.invoiceNumber || "1"}`);
      doc.text(`Date: ${billDate}`);
      doc.text(`Customer: ${invoice.partyName || "Walk-in Customer"}`);
      if (invoice.partyPhone) {
        doc.text(`Phone: ${invoice.partyPhone}`);
      }
      doc.text(`Payment: ${invoice.paymentMode || "CASH"} (${invoice.paymentStatus || "PAID"})`);

      // Separator line
      doc.moveDown(0.3);
      doc.moveTo(14, doc.y).lineTo(266, doc.y).strokeColor("#333333").lineWidth(0.5).stroke();
      doc.moveDown(0.3);

      // Table Header
      const colItem = 14;
      const colQty = 150;
      const colPrice = 190;
      const colTotal = 230;

      const headerY = doc.y;
      doc.fontSize(8).font("Helvetica-Bold");
      doc.text("Item", colItem, headerY, { width: 130 });
      doc.text("Qty", colQty, headerY, { width: 35, align: "center" });
      doc.text("Rate", colPrice, headerY, { width: 35, align: "right" });
      doc.text("Total", colTotal, headerY, { width: 36, align: "right" });

      doc.moveDown(0.3);
      doc.moveTo(14, doc.y).lineTo(266, doc.y).strokeColor("#888888").lineWidth(0.5).stroke();
      doc.moveDown(0.3);

      // Items list
      doc.fontSize(8).font("Helvetica");
      const items = invoice.items || [];
      for (const item of items) {
        const itemY = doc.y;
        const name = item.name || "Item";
        const qty = `${item.quantity || 1} ${item.unit || "pcs"}`;
        const price = (item.price || item.unitPrice || 0).toFixed(0);
        const total = (item.total || (item.quantity * item.price) || 0).toFixed(0);

        doc.text(name, colItem, itemY, { width: 130 });
        doc.text(qty, colQty, itemY, { width: 35, align: "center" });
        doc.text(`Rs.${price}`, colPrice, itemY, { width: 35, align: "right" });
        doc.text(`Rs.${total}`, colTotal, itemY, { width: 36, align: "right" });
        doc.moveDown(0.2);
      }

      // Separator line
      doc.moveDown(0.3);
      doc.moveTo(14, doc.y).lineTo(266, doc.y).strokeColor("#333333").lineWidth(0.5).stroke();
      doc.moveDown(0.3);

      // Totals
      doc.fontSize(8).font("Helvetica");
      doc.text(`Subtotal: Rs.${invoice.subtotal || invoice.grandTotal}`, { align: "right" });
      if (invoice.discountTotal > 0 || invoice.regularDiscountAmount > 0) {
        const totalDisc = (invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0);
        doc.text(`Discount: -Rs.${totalDisc}`, { align: "right" });
      }
      if (invoice.taxTotal > 0) {
        doc.text(`Tax: Rs.${invoice.taxTotal}`, { align: "right" });
      }

      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica-Bold");
      doc.text(`Grand Total: Rs.${invoice.grandTotal || 0}`, { align: "right" });

      // Footer
      doc.moveDown(0.6);
      doc.fontSize(8).font("Helvetica").text("Thank you for your visit!", { align: "center" });
      doc.text(`Helpline: ${storePhone}`, { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
