import PDFDocument from "pdfkit";

/**
 * Generate a clean, executive A4 PDF Sales Report.
 */
export function generateSalesReportPdf(reportData, storeInfo = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        autoFirstPage: true,
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const storeName = storeInfo.businessName || "THE A POP JAKO BITES";
      const storePhone = storeInfo.phone || storeInfo.whatsappNumber || "7003317615";
      const { startDate, endDate, summary = {}, invoices = [] } = reportData;

      const pageWidth = 535;
      const leftX = 30;

      // Header Banner
      doc.rect(leftX, 30, pageWidth, 55).fill("#1E3A8A");
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text(storeName.toUpperCase(), leftX + 15, 42);
      doc.fontSize(9).font("Helvetica").fillColor("#93C5FD")
        .text(`Sales & Revenue Report  |  Contact: +91 ${storePhone}`, leftX + 15, 62);

      const dateRangeStr = `${new Date(startDate).toLocaleDateString("en-IN")} to ${new Date(endDate).toLocaleDateString("en-IN")}`;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text(`Period: ${dateRangeStr}`, leftX + 320, 52, { width: 200, align: "right" });

      doc.y = 95;

      // KPI Cards
      const cardW = 125;
      const cardH = 42;
      const cardGap = 11;

      const drawKpiCard = (x, title, value, color) => {
        doc.rect(x, doc.y, cardW, cardH).fillAndStroke("#F8FAFC", "#E2E8F0");
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#64748B")
          .text(title.toUpperCase(), x + 8, doc.y + 6, { width: cardW - 16 });
        doc.fontSize(12).font("Helvetica-Bold").fillColor(color)
          .text(value, x + 8, doc.y + 19, { width: cardW - 16 });
      };

      const startKpiY = doc.y;
      drawKpiCard(leftX, "Total Sales", `Rs. ${Number(summary.totalSales || 0).toLocaleString("en-IN")}`, "#0F172A");
      drawKpiCard(leftX + cardW + cardGap, "Total Bills", `${summary.totalBills || 0}`, "#2563EB");
      drawKpiCard(leftX + (cardW + cardGap) * 2, "Cash Collected", `Rs. ${Number(summary.totalCash || 0).toLocaleString("en-IN")}`, "#059669");
      drawKpiCard(leftX + (cardW + cardGap) * 3, "UPI Received", `Rs. ${Number(summary.totalUpi || 0).toLocaleString("en-IN")}`, "#7C3AED");

      doc.y = startKpiY + cardH + 12;

      // Table Header
      const colNo = leftX;
      const colDate = leftX + 35;
      const colCust = leftX + 115;
      const colItems = leftX + 240;
      const colMode = leftX + 310;
      const colDisc = leftX + 380;
      const colTotal = leftX + 450;

      const tableHeadY = doc.y;
      doc.rect(leftX, tableHeadY, pageWidth, 20).fill("#1E293B");
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF");
      doc.text("BILL #", colNo + 4, tableHeadY + 6);
      doc.text("DATE", colDate, tableHeadY + 6);
      doc.text("CUSTOMER", colCust, tableHeadY + 6);
      doc.text("ITEMS", colItems, tableHeadY + 6);
      doc.text("PAYMENT", colMode, tableHeadY + 6);
      doc.text("DISCOUNT", colDisc, tableHeadY + 6);
      doc.text("TOTAL", colTotal, tableHeadY + 6, { width: 75, align: "right" });

      doc.y = tableHeadY + 22;

      // Table Rows
      let rowBg = false;
      doc.font("Helvetica").fontSize(7.5);

      for (const inv of invoices) {
        if (doc.y > 780) {
          doc.addPage();
          doc.y = 30;
        }

        const rowY = doc.y;
        if (rowBg) {
          doc.rect(leftX, rowY - 2, pageWidth, 16).fill("#F8FAFC");
        }
        rowBg = !rowBg;

        const invDate = inv.createdAt || inv.invoiceDate
          ? new Date(inv.createdAt || inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
          : "--";

        doc.fillColor("#0F172A");
        doc.font("Helvetica-Bold").text(`#${inv.invoiceNumber}`, colNo + 4, rowY);
        doc.font("Helvetica").text(invDate, colDate, rowY);
        doc.text((inv.partyName || "Cash Customer").slice(0, 20), colCust, rowY, { width: 120 });
        doc.text(`${(inv.items || []).length} items`, colItems, rowY);
        doc.text(inv.paymentMode || "CASH", colMode, rowY);
        doc.text(`Rs.${inv.discountTotal || 0}`, colDisc, rowY);
        doc.font("Helvetica-Bold").text(`Rs. ${Number(inv.grandTotal || 0).toLocaleString("en-IN")}`, colTotal, rowY, { width: 75, align: "right" });

        doc.font("Helvetica");
        doc.y = rowY + 16;
      }

      // Footer
      doc.moveDown(1);
      doc.fontSize(8).font("Helvetica").fillColor("#64748B")
        .text(`Report Generated On: ${new Date().toLocaleString("en-IN")}  *  Ezo Billing System`, leftX, doc.y, { align: "center", width: pageWidth });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Generate a clean A4 PDF Inventory / Stock Report.
 */
export function generateInventoryReportPdf(items = [], storeInfo = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        autoFirstPage: true,
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const storeName = storeInfo.businessName || "THE A POP JAKO BITES";
      const pageWidth = 535;
      const leftX = 30;

      // Header Banner
      doc.rect(leftX, 30, pageWidth, 50).fill("#065F46");
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text(storeName.toUpperCase(), leftX + 15, 40);
      doc.fontSize(9).font("Helvetica").fillColor("#A7F3D0")
        .text(`Inventory Stock Valuation & Status Report`, leftX + 15, 60);

      doc.fontSize(9).font("Helvetica").fillColor("#FFFFFF")
        .text(`Date: ${new Date().toLocaleDateString("en-IN")}`, leftX + 320, 50, { width: 200, align: "right" });

      doc.y = 90;

      let totalValuation = 0;
      let lowStockCount = 0;
      for (const it of items) {
        const stock = Number(it.stock || 0);
        const price = Number(it.sellingPrice || 0);
        totalValuation += stock * price;
        if (stock <= (it.lowStockThreshold || 5)) lowStockCount++;
      }

      // KPI Bar
      doc.rect(leftX, doc.y, pageWidth, 34).fillAndStroke("#F0FDF4", "#BBF7D0");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#166534");
      doc.text(`Total Items: ${items.length}   |   Low Stock Items: ${lowStockCount}   |   Total Valuation: Rs. ${totalValuation.toLocaleString("en-IN")}`, leftX + 12, doc.y + 11);

      doc.y = 135;

      // Table Header
      const colName = leftX;
      const colCat = leftX + 180;
      const colPrice = leftX + 270;
      const colStock = leftX + 360;
      const colStatus = leftX + 440;

      const tHeadY = doc.y;
      doc.rect(leftX, tHeadY, pageWidth, 20).fill("#1E293B");
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF");
      doc.text("ITEM NAME", colName + 6, tHeadY + 6);
      doc.text("CATEGORY", colCat, tHeadY + 6);
      doc.text("SELLING PRICE", colPrice, tHeadY + 6);
      doc.text("STOCK QTY", colStock, tHeadY + 6);
      doc.text("STATUS", colStatus, tHeadY + 6);

      doc.y = tHeadY + 22;

      let rowBg = false;
      for (const it of items) {
        if (doc.y > 780) {
          doc.addPage();
          doc.y = 30;
        }

        const rowY = doc.y;
        if (rowBg) doc.rect(leftX, rowY - 2, pageWidth, 16).fill("#F8FAFC");
        rowBg = !rowBg;

        const isLow = (it.stock || 0) <= (it.lowStockThreshold || 5);
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0F172A")
          .text((it.name || "Item").slice(0, 28), colName + 6, rowY);

        doc.font("Helvetica").fillColor("#475569")
          .text(it.category || "General", colCat, rowY);
        doc.text(`Rs. ${Number(it.sellingPrice || 0).toFixed(0)}`, colPrice, rowY);
        doc.text(`${it.stock || 0} ${it.unit || "PCS"}`, colStock, rowY);

        doc.font("Helvetica-Bold").fillColor(isLow ? "#DC2626" : "#16A34A")
          .text(isLow ? "LOW STOCK" : "IN STOCK", colStatus, rowY);

        doc.y = rowY + 16;
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Generate a clean A4 PDF Customer Udhar / Receivables Ledger Report.
 */
export function generatePartyReportPdf(parties = [], storeInfo = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        autoFirstPage: true,
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const storeName = storeInfo.businessName || "THE A POP JAKO BITES";
      const pageWidth = 535;
      const leftX = 30;

      // Header Banner
      doc.rect(leftX, 30, pageWidth, 50).fill("#7C2D12");
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text(storeName.toUpperCase(), leftX + 15, 40);
      doc.fontSize(9).font("Helvetica").fillColor("#FED7AA")
        .text("Customer Ledger & Udhar (Receivables) Report", leftX + 15, 60);

      doc.fontSize(9).font("Helvetica").fillColor("#FFFFFF")
        .text(`Date: ${new Date().toLocaleDateString("en-IN")}`, leftX + 320, 50, { width: 200, align: "right" });

      doc.y = 90;

      let totalReceivable = 0;
      let totalSpentAll = 0;
      for (const p of parties) {
        totalReceivable += Number(p.balance || 0);
        totalSpentAll += Number(p.totalSpent || 0);
      }

      // KPI Bar
      doc.rect(leftX, doc.y, pageWidth, 34).fillAndStroke("#FFF7ED", "#FED7AA");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#9A3412");
      doc.text(`Total Customers: ${parties.length}   |   Total Receivables (Udhar): Rs. ${totalReceivable.toLocaleString("en-IN")}   |   Total Spent: Rs. ${totalSpentAll.toLocaleString("en-IN")}`, leftX + 12, doc.y + 11);

      doc.y = 135;

      // Table Header
      const colName = leftX;
      const colPhone = leftX + 160;
      const colVisits = leftX + 270;
      const colSpent = leftX + 350;
      const colBalance = leftX + 440;

      const tHeadY = doc.y;
      doc.rect(leftX, tHeadY, pageWidth, 20).fill("#1E293B");
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF");
      doc.text("CUSTOMER NAME", colName + 6, tHeadY + 6);
      doc.text("PHONE / WHATSAPP", colPhone, tHeadY + 6);
      doc.text("VISITS", colVisits, tHeadY + 6);
      doc.text("TOTAL SPENT", colSpent, tHeadY + 6);
      doc.text("UDHAR BALANCE", colBalance, tHeadY + 6);

      doc.y = tHeadY + 22;

      let rowBg = false;
      for (const p of parties) {
        if (doc.y > 780) {
          doc.addPage();
          doc.y = 30;
        }

        const rowY = doc.y;
        if (rowBg) doc.rect(leftX, rowY - 2, pageWidth, 16).fill("#F8FAFC");
        rowBg = !rowBg;

        const bal = Number(p.balance || 0);
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0F172A")
          .text((p.name || "Customer").slice(0, 24), colName + 6, rowY);

        doc.font("Helvetica").fillColor("#475569")
          .text(p.phone || p.whatsappNumber || "--", colPhone, rowY);
        doc.text(`${p.visitCount || 1} visits`, colVisits, rowY);
        doc.text(`Rs. ${Number(p.totalSpent || 0).toLocaleString("en-IN")}`, colSpent, rowY);

        doc.font("Helvetica-Bold").fillColor(bal > 0 ? "#DC2626" : "#16A34A")
          .text(`Rs. ${bal.toLocaleString("en-IN")}`, colBalance, rowY);

        doc.y = rowY + 16;
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
