import express from "express";
import Invoice from "../models/Invoice.js";
import Item from "../models/Item.js";
import Party from "../models/Party.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

const router = express.Router();

router.use(protect);

const sendAutomaticWhatsAppBill = async (phone, message) => {
  try {
    const directResult = await sendWhatsAppMessage(phone, message);
    if (directResult.success) {
      return true;
    }
  } catch {}

  if (!process.env.WHATSAPP_API_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return false;
  }
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const recipient = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      }
    );
    const data = await response.json();
    return Boolean(data.messages && data.messages.length > 0);
  } catch {
    return false;
  }
};

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, paymentMode, partyId, limit = 50 } = req.query;
    const filter = { userId: req.user._id };

    if (paymentMode) {
      filter.paymentMode = paymentMode.toUpperCase();
    }

    if (partyId) {
      filter.partyId = partyId;
    }

    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) filter.invoiceDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = end;
      }
    }

    const invoices = await Invoice.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoices",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoice",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      partyId,
      partyName,
      partyPhone,
      items,
      paymentMode = "CASH",
      cashAmount = 0,
      upiAmount = 0,
      notes,
      applyRegularDiscount = true,
      additionalDiscountPercent = 0,
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: "Invoice must have at least one item",
      });
    }

    let customer = null;
    let isRegularCustomer = false;
    let regularDiscountPercent = 0;
    let freebieItem = "";

    if (partyId) {
      customer = await Party.findOne({ _id: partyId, userId: req.user._id });
    } else if (partyPhone) {
      const cleanPhone = partyPhone.replace(/[^0-9]/g, "");
      if (cleanPhone.length >= 10) {
        customer = await Party.findOne({ userId: req.user._id, phone: cleanPhone });
        if (!customer) {
          customer = await Party.create({
            userId: req.user._id,
            name: partyName && partyName.trim() !== "Walk-in Customer" ? partyName.trim() : `Customer ${cleanPhone.slice(-4)}`,
            phone: cleanPhone,
            whatsappNumber: cleanPhone,
            type: "customer",
          });
        } else if (partyName && partyName.trim() !== "Walk-in Customer" && customer.name.startsWith("Customer ")) {
          customer.name = partyName.trim();
          await customer.save();
        }
      }
    }

    if (customer) {
      isRegularCustomer = customer.isRegular;
      if (isRegularCustomer && applyRegularDiscount) {
        regularDiscountPercent = customer.customDiscountPercent || 0;
        freebieItem = customer.assignedFreebie || "";
      }
    }

    let calculatedSubtotal = 0;
    let calculatedTaxTotal = 0;
    const processedItems = [];
    const stockUpdates = [];

    for (const it of items) {
      const price = Number(it.sellingPrice) || 0;
      const qty = Number(it.quantity) || 1;
      const taxRate = Number(it.taxRate) || 0;
      const lineTotal = price * qty;
      const lineTax = (lineTotal * taxRate) / 100;

      calculatedSubtotal += lineTotal;
      calculatedTaxTotal += lineTax;

      processedItems.push({
        itemId: it.itemId || it._id,
        name: it.name,
        barcode: it.barcode,
        sellingPrice: price,
        quantity: qty,
        unit: it.unit || "PCS",
        taxRate,
        discountPercent: it.discountPercent || 0,
        total: lineTotal + lineTax,
      });

      if (it.itemId || it._id) {
        stockUpdates.push({
          updateOne: {
            filter: { _id: it.itemId || it._id, userId: req.user._id },
            update: { $inc: { stock: -qty } },
          },
        });
      }
    }

    const totalDiscountRate = regularDiscountPercent + (Number(additionalDiscountPercent) || 0);
    const discountAmount = Math.round((calculatedSubtotal * totalDiscountRate) / 100 * 100) / 100;
    const regularDiscountAmount = Math.round((calculatedSubtotal * regularDiscountPercent) / 100 * 100) / 100;

    const totalBeforeRound = calculatedSubtotal + calculatedTaxTotal - discountAmount;
    const grandTotal = Math.round(totalBeforeRound);
    const roundOff = Math.round((grandTotal - totalBeforeRound) * 100) / 100;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const todayInvoices = await Invoice.find({
      userId: req.user._id,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).select("invoiceNumber");

    let maxNumber = 0;
    for (const inv of todayInvoices) {
      const num = parseInt(inv.invoiceNumber, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
    const invoiceNumber = (maxNumber + 1).toString();

    const mode = paymentMode.toUpperCase();
    const isCredit = mode === "CREDIT";
    const paidAmount = isCredit ? 0 : grandTotal;
    const dueAmount = isCredit ? grandTotal : 0;
    const paymentStatus = isCredit ? "UNPAID" : "PAID";

    let finalCash = 0;
    let finalUpi = 0;
    if (mode === "UPI/CASH") {
      finalCash = Number(cashAmount) || 0;
      finalUpi = Number(upiAmount) || Math.max(0, grandTotal - finalCash);
    } else if (mode === "CASH") {
      finalCash = grandTotal;
    } else if (mode === "UPI") {
      finalUpi = grandTotal;
    }

    const destinationPhone = customer
      ? (customer.whatsappNumber || customer.phone)
      : (partyPhone ? partyPhone.replace(/[^0-9]/g, "") : "");

    const business = req.user;
    let itemsText = processedItems
      .map((it, idx) => `${idx + 1}. ${it.name} x ${it.quantity} ${it.unit} = Rs.${it.total}`)
      .join("\n");

    let whatsappText =
      `BILL NO: ${invoiceNumber}\n` +
      `STORE: ${business.businessName}\n` +
      `Date: ${new Date().toLocaleDateString()}\n` +
      `Customer: ${customer ? customer.name : (partyName || "Cash Customer")}\n` +
      `--------------------------------\n` +
      `${itemsText}\n` +
      `--------------------------------\n` +
      `Subtotal: Rs.${calculatedSubtotal}\n`;

    if (discountAmount > 0) {
      whatsappText += `Discount: -Rs.${discountAmount}\n`;
    }
    if (isRegularCustomer && regularDiscountAmount > 0) {
      whatsappText += `You saved Rs.${regularDiscountAmount} with Regular Customer Discount!\n`;
    }
    if (freebieItem) {
      whatsappText += `Complimentary Gift: ${freebieItem}\n`;
    }

    const paymentLine =
      mode === "UPI/CASH"
        ? `Payment Mode: UPI/CASH (Cash: Rs.${finalCash}, UPI: Rs.${finalUpi}) (${paymentStatus})\n\n`
        : `Payment Mode: ${mode} (${paymentStatus})\n\n`;

    whatsappText +=
      `Grand Total: Rs.${grandTotal}\n` +
      paymentLine +
      `Thank you for shopping with us!\n` +
      `Contact: ${business.phone}`;

    let autoSent = false;
    if (destinationPhone) {
      autoSent = await sendAutomaticWhatsAppBill(destinationPhone, whatsappText);
    }

    const invoice = await Invoice.create({
      userId: req.user._id,
      invoiceNumber,
      partyId: customer ? customer._id : undefined,
      partyName: customer ? customer.name : (partyName || "Cash Customer"),
      partyPhone: destinationPhone,
      isRegularCustomer,
      items: processedItems,
      regularDiscountAppliedPercent: regularDiscountPercent,
      regularDiscountAmount,
      freebieItemGiven: freebieItem,
      subtotal: calculatedSubtotal,
      taxTotal: calculatedTaxTotal,
      discountTotal: discountAmount,
      roundOff,
      grandTotal,
      paymentMode: mode,
      cashAmount: finalCash,
      upiAmount: finalUpi,
      paymentStatus,
      paidAmount,
      dueAmount,
      whatsappSent: autoSent,
      notes,
    });

    if (stockUpdates.length > 0) {
      await Item.bulkWrite(stockUpdates, { ordered: false });
    }

    if (customer) {
      customer.visitCount = (customer.visitCount || 0) + 1;
      customer.totalSpent = (customer.totalSpent || 0) + grandTotal;
      customer.lastVisitDate = new Date();

      if (isCredit) {
        customer.balance = (customer.balance || 0) + grandTotal;
      }

      if (!customer.isRegular && (customer.visitCount >= 5 || customer.totalSpent >= 5000)) {
        customer.isRegular = true;
      }

      await customer.save();
    }

    const whatsappUrl = destinationPhone
      ? `https://wa.me/91${destinationPhone}?text=${encodeURIComponent(whatsappText)}`
      : "";

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoice,
      whatsappSent: autoSent,
      whatsappText,
      whatsappUrl,
    });
  } catch (error) {
    console.error("Invoice creation error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to create invoice",
      error: error.message,
    });
  }
});

export default router;
