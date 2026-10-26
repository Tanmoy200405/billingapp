import express from "express";
import Invoice from "../models/Invoice.js";
import Party from "../models/Party.js";
import Item from "../models/Item.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/stats", async (req, res) => {
  try {
    const userId = req.user._id;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [
      todayInvoices,
      recentTransactions,
      partyStats,
      lowStockCount,
      allTimeInvoicesCount,
    ] = await Promise.all([
      Invoice.find({
        userId,
        invoiceDate: { $gte: startOfToday, $lte: endOfToday },
      })
        .select("grandTotal paymentMode")
        .lean(),

      Invoice.find({ userId })
        .sort({ invoiceDate: -1, createdAt: -1 })
        .limit(10)
        .select(
          "invoiceNumber partyName partyPhone paymentMode grandTotal invoiceDate isRegularCustomer"
        )
        .lean(),

      Party.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalCustomers: {
              $sum: { $cond: [{ $eq: ["$type", "customer"] }, 1, 0] },
            },
            regularCustomers: {
              $sum: { $cond: ["$isRegular", 1, 0] },
            },
            totalReceivable: {
              $sum: { $cond: [{ $gt: ["$balance", 0] }, "$balance", 0] },
            },
          },
        },
      ]),

      Item.countDocuments({
        userId,
        $expr: { $lte: ["$stock", "$lowStockThreshold"] },
      }),

      Invoice.countDocuments({ userId }),
    ]);

    let todaySalesTotal = 0;
    const paymentBreakdown = {
      CASH: 0,
      UPI: 0,
      "UPI/CASH": 0,
      BANK: 0,
      CHEQUE: 0,
      CREDIT: 0,
    };

    for (const inv of todayInvoices) {
      todaySalesTotal += inv.grandTotal || 0;
      if (inv.paymentMode === "UPI/CASH") {
        paymentBreakdown["UPI/CASH"] += inv.grandTotal || 0;
        paymentBreakdown.CASH += inv.cashAmount || 0;
        paymentBreakdown.UPI += inv.upiAmount || 0;
      } else if (paymentBreakdown[inv.paymentMode] !== undefined) {
        paymentBreakdown[inv.paymentMode] += inv.grandTotal || 0;
      }
    }

    const pStat = partyStats[0] || {
      totalCustomers: 0,
      regularCustomers: 0,
      totalReceivable: 0,
    };

    return res.status(200).json({
      success: true,
      stats: {
        todaySalesTotal,
        todayInvoiceCount: todayInvoices.length,
        paymentBreakdown,
        totalReceivable: pStat.totalReceivable,
        totalCustomers: pStat.totalCustomers,
        regularCustomers: pStat.regularCustomers,
        lowStockCount,
        allTimeInvoicesCount,
      },
      recentTransactions,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard statistics",
      error: error.message,
    });
  }
});

export default router;
