import express from "express";
import Invoice from "../models/Invoice.js";
import Item from "../models/Item.js";
import Party from "../models/Party.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  generateSalesReportPdf,
  generateInventoryReportPdf,
  generatePartyReportPdf,
} from "../services/reportPdfService.js";

const router = express.Router();
router.use(protect);

/**
 * Helper to parse date filters.
 */
function getDateRange(query) {
  let { startDate, endDate, period } = query;
  const now = new Date();

  if (period === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (period === "yesterday") {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    startDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
    endDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
  } else if (period === "week") {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    startDate = new Date(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate(), 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (period === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else {
    startDate = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = endDate ? new Date(endDate) : new Date();
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

// ==========================================
// 1. SALES REPORTS (JSON, PDF, CSV)
// ==========================================

async function fetchSalesData(userId, query) {
  const { startDate, endDate } = getDateRange(query);
  const filter = {
    userId,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  if (query.paymentMode) {
    filter.paymentMode = query.paymentMode.toUpperCase();
  }

  const invoices = await Invoice.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  let totalSales = 0;
  let totalCash = 0;
  let totalUpi = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  for (const inv of invoices) {
    const total = Number(inv.grandTotal || 0);
    totalSales += total;
    totalDiscount += Number(inv.discountTotal || 0) + Number(inv.regularDiscountAmount || 0);
    totalTax += Number(inv.taxTotal || 0);

    if (inv.paymentMode === "CASH") {
      totalCash += total;
    } else if (inv.paymentMode === "UPI") {
      totalUpi += total;
    } else if (inv.paymentMode === "UPI/CASH") {
      totalCash += Number(inv.cashAmount || 0);
      totalUpi += Number(inv.upiAmount || 0);
    }
  }

  return {
    startDate,
    endDate,
    summary: {
      totalSales,
      totalBills: invoices.length,
      totalCash,
      totalUpi,
      totalDiscount,
      totalTax,
    },
    invoices,
  };
}

router.get("/sales", async (req, res) => {
  try {
    const data = await fetchSalesData(req.user._id, req.query);
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/sales/pdf", async (req, res) => {
  try {
    const data = await fetchSalesData(req.user._id, req.query);
    const pdfBuffer = await generateSalesReportPdf(data, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="SalesReport_${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/sales/csv", async (req, res) => {
  try {
    const data = await fetchSalesData(req.user._id, req.query);
    let csv = "Invoice No,Date,Customer Name,Phone,Items Count,Subtotal,Discount,Tax,Grand Total,Payment Mode,Cash Amount,UPI Amount,Status\n";

    for (const inv of data.invoices) {
      const dateStr = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("en-IN") : "";
      const cust = `"${(inv.partyName || "Cash Customer").replace(/"/g, '""')}"`;
      const phone = inv.partyPhone || "";
      const count = (inv.items || []).length;
      csv += `${inv.invoiceNumber},${dateStr},${cust},${phone},${count},${inv.subtotal || 0},${inv.discountTotal || 0},${inv.taxTotal || 0},${inv.grandTotal || 0},${inv.paymentMode || "CASH"},${inv.cashAmount || 0},${inv.upiAmount || 0},${inv.paymentStatus || "PAID"}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="SalesReport_${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 2. INVENTORY REPORTS (PDF, CSV)
// ==========================================

router.get("/inventory/pdf", async (req, res) => {
  try {
    const items = await Item.find({ userId: req.user._id }).sort({ name: 1 }).lean();
    const pdfBuffer = await generateInventoryReportPdf(items, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="InventoryReport_${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/inventory/csv", async (req, res) => {
  try {
    const items = await Item.find({ userId: req.user._id }).sort({ name: 1 }).lean();
    let csv = "Item Name,Category,Barcode,Selling Price,Purchase Price,Stock,Unit,Low Stock Threshold,Status,Valuation\n";

    for (const it of items) {
      const name = `"${(it.name || "").replace(/"/g, '""')}"`;
      const cat = `"${(it.category || "General").replace(/"/g, '""')}"`;
      const status = (it.stock || 0) <= (it.lowStockThreshold || 5) ? "LOW STOCK" : "IN STOCK";
      const valuation = (it.stock || 0) * (it.sellingPrice || 0);
      csv += `${name},${cat},${it.barcode || ""},${it.sellingPrice || 0},${it.purchasePrice || 0},${it.stock || 0},${it.unit || "PCS"},${it.lowStockThreshold || 5},${status},${valuation}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="InventoryReport_${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 3. PARTY / CUSTOMER REPORTS (PDF, CSV)
// ==========================================

router.get("/parties/pdf", async (req, res) => {
  try {
    const parties = await Party.find({ userId: req.user._id }).sort({ balance: -1, name: 1 }).lean();
    const pdfBuffer = await generatePartyReportPdf(parties, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="CustomerLedger_${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/parties/csv", async (req, res) => {
  try {
    const parties = await Party.find({ userId: req.user._id }).sort({ balance: -1, name: 1 }).lean();
    let csv = "Customer Name,Phone,Type,Is Regular,Visits,Total Spent,Udhar Balance\n";

    for (const p of parties) {
      const name = `"${(p.name || "").replace(/"/g, '""')}"`;
      csv += `${name},${p.phone || ""},${p.type || "customer"},${p.isRegular ? "YES" : "NO"},${p.visitCount || 1},${p.totalSpent || 0},${p.balance || 0}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="CustomerLedger_${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
