import express from "express";
import mongoose from "mongoose";
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

async function fetchSalesData(userId, query) {
  const { startDate, endDate } = getDateRange(query);
  const filter = {
    userId,
    $or: [
      { createdAt: { $gte: startDate, $lte: endDate } },
      { invoiceDate: { $gte: startDate, $lte: endDate } },
    ],
  };

  if (query.paymentMode) {
    filter.paymentMode = query.paymentMode.toUpperCase();
  }
  if (query.orderSource) {
    filter.orderSource = query.orderSource.toUpperCase();
  }

  const invoices = await Invoice.find(filter)
    .sort({ invoiceDate: -1, createdAt: -1 })
    .lean();

  let totalSales = 0;
  let totalCash = 0;
  let totalUpi = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalSwiggy = 0;
  let swiggyOrders = 0;
  let totalZomato = 0;
  let zomatoOrders = 0;
  let totalCounter = 0;
  let counterOrders = 0;

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

    const src = (inv.orderSource || inv.paymentMode || "COUNTER").toUpperCase();
    if (src === "SWIGGY") {
      totalSwiggy += total;
      swiggyOrders += 1;
    } else if (src === "ZOMATO") {
      totalZomato += total;
      zomatoOrders += 1;
    } else {
      totalCounter += total;
      counterOrders += 1;
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
      totalSwiggy,
      swiggyOrders,
      totalZomato,
      zomatoOrders,
      totalCounter,
      counterOrders,
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

router.get("/inventory/pdf", async (req, res) => {
  try {
    const items = await Item.find({ userId: req.user._id })
      .collation({ locale: "en", numericOrdering: true })
      .sort({ name: 1 })
      .lean();
    items.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
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
    const items = await Item.find({ userId: req.user._id })
      .collation({ locale: "en", numericOrdering: true })
      .sort({ name: 1 })
      .lean();
    items.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
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

// Top selling items per day (supports 7, 30, 365 days / yearly)
router.get("/top-items", async (req, res) => {
  try {
    const userId = mongoose.Types.ObjectId.isValid(req.user._id)
      ? new mongoose.Types.ObjectId(req.user._id)
      : req.user._id;
    const days = parseInt(req.query.days) || 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const matchStage = {
      userId,
      $or: [
        { createdAt: { $gte: startDate } },
        { invoiceDate: { $gte: startDate } },
      ],
    };

    const results = await Invoice.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: { $ifNull: ["$invoiceDate", "$createdAt"] },
              },
            },
            itemName: { $ifNull: ["$items.name", "$items.itemName", "Item"] },
          },
          totalQty: { $sum: { $ifNull: ["$items.quantity", "$items.qty", 1] } },
          totalRevenue: {
            $sum: {
              $ifNull: [
                "$items.total",
                "$items.amount",
                {
                  $multiply: [
                    { $ifNull: ["$items.sellingPrice", "$items.rate", 0] },
                    { $ifNull: ["$items.quantity", "$items.qty", 1] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $sort: { "_id.date": -1, totalQty: -1, totalRevenue: -1 } },
      {
        $group: {
          _id: "$_id.date",
          items: {
            $push: {
              name: "$_id.itemName",
              totalQty: "$totalQty",
              totalRevenue: "$totalRevenue",
            },
          },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: days },
      {
        $project: {
          date: "$_id",
          topItems: { $slice: ["$items", 10] },
          _id: 0,
        },
      },
    ]);

    // Also get overall yearly top items
    const overallTop = await Invoice.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $group: {
          _id: { $ifNull: ["$items.name", "$items.itemName", "Item"] },
          totalQty: { $sum: { $ifNull: ["$items.quantity", "$items.qty", 1] } },
          totalRevenue: {
            $sum: {
              $ifNull: [
                "$items.total",
                "$items.amount",
                {
                  $multiply: [
                    { $ifNull: ["$items.sellingPrice", "$items.rate", 0] },
                    { $ifNull: ["$items.quantity", "$items.qty", 1] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $sort: { totalQty: -1, totalRevenue: -1 } },
      { $limit: 20 },
      {
        $project: {
          name: "$_id",
          totalQty: 1,
          totalRevenue: 1,
          _id: 0,
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: results,
      topItems: results,
      overallTop,
    });
  } catch (err) {
    console.error("Top items error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Category-wise selling per day for the whole year
router.get("/category-sales", async (req, res) => {
  try {
    const userId = mongoose.Types.ObjectId.isValid(req.user._id)
      ? new mongoose.Types.ObjectId(req.user._id)
      : req.user._id;
    const days = parseInt(req.query.days) || 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const matchStage = {
      userId,
      $or: [
        { createdAt: { $gte: startDate } },
        { invoiceDate: { $gte: startDate } },
      ],
    };

    const dailyResults = await Invoice.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "items",
          localField: "items.itemId",
          foreignField: "_id",
          as: "itemDoc",
        },
      },
      {
        $addFields: {
          categoryName: {
            $ifNull: [
              { $arrayElemAt: ["$itemDoc.category", 0] },
              { $ifNull: ["$items.category", "General"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: { $ifNull: ["$invoiceDate", "$createdAt"] },
              },
            },
            category: "$categoryName",
          },
          totalQty: { $sum: { $ifNull: ["$items.quantity", "$items.qty", 1] } },
          totalRevenue: {
            $sum: {
              $ifNull: [
                "$items.total",
                "$items.amount",
                {
                  $multiply: [
                    { $ifNull: ["$items.sellingPrice", "$items.rate", 0] },
                    { $ifNull: ["$items.quantity", "$items.qty", 1] },
                  ],
                },
              ],
            },
          },
          items: {
            $push: {
              name: { $ifNull: ["$items.name", "$items.itemName", "Item"] },
              quantity: { $ifNull: ["$items.quantity", "$items.qty", 1] },
              qty: { $ifNull: ["$items.quantity", "$items.qty", 1] },
              price: { $ifNull: ["$items.sellingPrice", "$items.rate", 0] },
              revenue: {
                $ifNull: [
                  "$items.total",
                  "$items.amount",
                  {
                    $multiply: [
                      { $ifNull: ["$items.sellingPrice", "$items.rate", 0] },
                      { $ifNull: ["$items.quantity", "$items.qty", 1] },
                    ],
                  },
                ],
              },
              total: { $ifNull: ["$items.total", "$items.amount", 0] },
            },
          },
        },
      },
      { $sort: { "_id.date": -1, totalRevenue: -1 } },
      {
        $group: {
          _id: "$_id.date",
          categories: {
            $push: {
              category: "$_id.category",
              totalQty: "$totalQty",
              totalRevenue: "$totalRevenue",
              items: "$items",
            },
          },
          dayTotalRevenue: { $sum: "$totalRevenue" },
          dayTotalQty: { $sum: "$totalQty" },
        },
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          date: "$_id",
          categories: 1,
          dayTotalRevenue: 1,
          dayTotalQty: 1,
          _id: 0,
        },
      },
    ]);

    // Yearly summary by category
    const yearlyCategorySummary = await Invoice.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "items",
          localField: "items.itemId",
          foreignField: "_id",
          as: "itemDoc",
        },
      },
      {
        $addFields: {
          categoryName: {
            $ifNull: [
              { $arrayElemAt: ["$itemDoc.category", 0] },
              { $ifNull: ["$items.category", "General"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$categoryName",
          totalQty: { $sum: { $ifNull: ["$items.quantity", "$items.qty", 1] } },
          totalRevenue: {
            $sum: {
              $ifNull: [
                "$items.total",
                "$items.amount",
                {
                  $multiply: [
                    { $ifNull: ["$items.sellingPrice", "$items.rate", 0] },
                    { $ifNull: ["$items.quantity", "$items.qty", 1] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $sort: { totalRevenue: -1 } },
      {
        $project: {
          category: "$_id",
          totalQty: 1,
          totalRevenue: 1,
          _id: 0,
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: dailyResults,
      dailyCategorySales: dailyResults,
      daily: dailyResults,
      yearlyCategorySummary,
      yearly: yearlyCategorySummary,
    });
  } catch (err) {
    console.error("Category sales error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


