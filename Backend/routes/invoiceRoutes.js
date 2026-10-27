import express from "express";
import Invoice from "../models/Invoice.js";
import Item from "../models/Item.js";
import Party from "../models/Party.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendWhatsAppMessage, sendWhatsAppDocument } from "../services/whatsappService.js";
import { generateInvoicePdfBuffer } from "../services/pdfService.js";

const router = express.Router();

// ==========================================
// PUBLIC UNPROTECTED CUSTOMER ROUTES (Zudio / Petpooja Style)
// Accessible by customers via WhatsApp link without authentication
// ==========================================

router.get("/public/:id/pdf", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).send("Invoice not found or expired.");
    }
    const storeUser = await User.findById(invoice.userId);
    const pdfBuffer = await generateInvoicePdfBuffer(invoice, storeUser || {});

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Bill_${invoice.invoiceNumber || "receipt"}.pdf"`
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Public PDF generation error:", error.message);
    return res.status(500).send("Failed to render invoice PDF.");
  }
});

router.get("/public/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).send("Invoice not found.");
    }
    const storeUser = await User.findById(invoice.userId);
    const storeName = storeUser?.businessName || invoice.businessName || "THE A POP JAKO BITES";
    const phone = storeUser?.phone || storeUser?.whatsappNumber || "7003317615";

    const dateStr = invoice.createdAt
      ? new Date(invoice.createdAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleString("en-IN");

    const itemsHtml = (invoice.items || [])
      .map(
        (it, idx) => `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 10px 8px; font-size: 14px; font-weight: 600; color: #1F2937;">${idx + 1}. ${it.name}</td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: center; color: #4B5563;">${it.quantity} ${it.unit || "PCS"}</td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: right; color: #4B5563;">Rs. ${Number(it.sellingPrice || it.price || 0).toFixed(0)}</td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: right; font-weight: 700; color: #111827;">Rs. ${Number(it.total || 0).toFixed(0)}</td>
      </tr>
    `
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #${invoice.invoiceNumber} - ${storeName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #F3F4F6; padding: 16px; display: flex; justify-content: center; }
          .card { background: #FFFFFF; max-width: 460px; width: 100%; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #E5E7EB; }
          .header { background: #111827; color: white; padding: 24px 20px; text-align: center; }
          .store-name { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
          .meta-box { background: #F9FAFB; padding: 16px; border-bottom: 1px solid #E5E7EB; font-size: 13px; color: #374151; }
          .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .total-box { background: #111827; color: white; padding: 16px; border-radius: 12px; margin: 16px; display: flex; justify-content: space-between; align-items: center; }
          .btn { display: block; text-align: center; background: #059669; color: white; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px; border-radius: 12px; margin: 16px; box-shadow: 0 2px 8px rgba(5,150,105,0.3); }
          .footer { text-align: center; font-size: 11px; color: #6B7280; padding: 0 16px 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="store-name">${storeName}</div>
            <div style="font-size: 12px; color: #9CA3AF;">Official Digital Tax Invoice</div>
          </div>
          <div class="meta-box">
            <div class="row"><span>Bill No: <b>#${invoice.invoiceNumber}</b></span><span>Date: <b>${dateStr}</b></span></div>
            <div class="row"><span>Customer: <b>${invoice.partyName || "Cash Customer"}</b></span><span>Status: <b style="color:#059669;">${invoice.paymentStatus || "PAID"}</b></span></div>
            <div class="row"><span>Payment Mode: <b>${invoice.paymentMode || "CASH"}</b></span><span>Helpline: <b>${phone}</b></span></div>
          </div>
          <div style="padding: 12px 16px;">
            <table class="table">
              <thead>
                <tr style="border-bottom: 2px solid #D1D5DB; font-size: 12px; color: #6B7280; text-transform: uppercase;">
                  <th style="padding: 6px 8px; text-align: left;">Item</th>
                  <th style="padding: 6px 8px; text-align: center;">Qty</th>
                  <th style="padding: 6px 8px; text-align: right;">Rate</th>
                  <th style="padding: 6px 8px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>
          <div class="total-box">
            <span style="font-size: 15px; font-weight: 600;">GRAND TOTAL</span>
            <span style="font-size: 20px; font-weight: 900;">Rs. ${Number(invoice.grandTotal || 0).toFixed(2)}</span>
          </div>
          <a class="btn" href="/api/invoices/public/${invoice._id}/pdf" download="Invoice_${invoice.invoiceNumber}.pdf">
            📥 Download Official PDF Receipt
          </a>
          <div class="footer">
            Thank you for shopping with us! Visit again.<br>
            Powered by Ezo Billing System
          </div>
        </div>
      </body>
      </html>
    `;
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    return res.status(500).send("Error loading bill.");
  }
});

// ==========================================
// PROTECTED MERCHANT ROUTES
// ==========================================
router.use(protect);

const sendAutomaticWhatsAppBill = async (
  phone,
  message,
  pdfBuffer = null,
  invoiceNumber = "1",
  storeName = "THE A POP JAKO BITES"
) => {
  // 1. Try sending the PDF document directly if available (Baileys WhatsApp Web automation)
  if (pdfBuffer) {
    try {
      const docResult = await sendWhatsAppDocument(
        phone,
        pdfBuffer,
        `Invoice_${invoiceNumber}.pdf`,
        message // Send full formatted Petpooja/Zudio caption along with the PDF!
      );
      if (docResult && docResult.success) {
        console.log(`[WhatsApp] Invoice #${invoiceNumber} PDF delivered successfully to +${phone}`);
        return true;
      }
    } catch (docErr) {
      console.warn("[WhatsApp] Document send warning:", docErr.message);
    }
  }

  // 2. Fall back to direct WhatsApp text message (contains clickable PDF download link)
  try {
    const directResult = await sendWhatsAppMessage(phone, message);
    if (directResult && directResult.success) {
      console.log(`[WhatsApp] Invoice #${invoiceNumber} text copy delivered to +${phone}`);
      return true;
    }
  } catch (textErr) {
    console.warn("[WhatsApp] Direct message warning:", textErr.message);
  }

  // 3. Fallback to Meta Cloud API if configured
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
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: true, body: message },
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
    console.error("Fetch invoices error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoices",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch invoice", error: error.message });
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
      cashAmount,
      upiAmount,
      applyRegularDiscount = true,
      additionalDiscountPercent = 0,
      notes,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one item is required" });
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
      const price = Number(it.sellingPrice ?? it.price ?? it.rate ?? 0);
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
      ? customer.whatsappNumber || customer.phone
      : partyPhone
      ? partyPhone.replace(/[^0-9]/g, "")
      : "";

    // 1. Create Invoice Record First to obtain invoice._id
    const invoice = await Invoice.create({
      userId: req.user._id,
      invoiceNumber,
      partyId: customer ? customer._id : undefined,
      partyName: customer ? customer.name : partyName || "Cash Customer",
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
      whatsappSent: false,
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

    // 2. Build Petpooja / Zudio Style WhatsApp Bill Text with direct Public PDF Link
    const business = req.user;
    const backendBase = process.env.BACKEND_PUBLIC_URL || "https://billing-app-backend-lake.vercel.app";
    const publicPdfUrl = `${backendBase}/api/invoices/public/${invoice._id}/pdf`;

    const itemsSummary = processedItems
      .map((it, idx) => `• ${it.name} x ${it.quantity} = Rs.${it.total}`)
      .join("\n");

    const dateFormatted = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let savingsText = "";
    if (regularDiscountAmount > 0) {
      savingsText += `🎉 You saved Rs.${regularDiscountAmount} with Regular Customer Discount!\n`;
    }
    if (freebieItem) {
      savingsText += `🎁 Free Gift: ${freebieItem}\n`;
    }

    const whatsappText =
      `🧾 *TAX INVOICE / BILL*\n` +
      `*${(business.businessName || "STORE").toUpperCase()}*\n` +
      `----------------------------------------\n` +
      `Dear *${customer ? customer.name : partyName || "Customer"}*,\n` +
      `Thank you for shopping with us! Here is your bill:\n\n` +
      `📋 *Bill No:* #${invoiceNumber}\n` +
      `📅 *Date:* ${dateFormatted}\n` +
      `💳 *Payment:* ${mode} (${paymentStatus})\n` +
      `💰 *Grand Total:* *Rs. ${grandTotal}*\n` +
      `----------------------------------------\n` +
      `${itemsSummary}\n` +
      `----------------------------------------\n` +
      `Subtotal: Rs.${calculatedSubtotal}\n` +
      (discountAmount > 0 ? `Discount: -Rs.${discountAmount}\n` : "") +
      savingsText +
      `----------------------------------------\n` +
      `📥 *Download / View PDF Bill:*\n` +
      `${publicPdfUrl}\n` +
      `----------------------------------------\n` +
      `📎 Your official PDF bill is attached.\n` +
      `🙏 Thank you! Visit again.\n` +
      `📞 Helpline: ${business.phone || business.whatsappNumber || "7003317615"}`;

    // 3. Generate High-Res PDF Buffer & Send to WhatsApp
    let pdfBuffer = null;
    try {
      pdfBuffer = await generateInvoicePdfBuffer(invoice, business);
    } catch (pdfErr) {
      console.warn("PDF generation warning:", pdfErr.message);
    }

    let autoSent = false;
    if (destinationPhone) {
      autoSent = await sendAutomaticWhatsAppBill(
        destinationPhone,
        whatsappText,
        pdfBuffer,
        invoiceNumber,
        business.businessName || "THE A POP JAKO BITES"
      );
      if (autoSent) {
        invoice.whatsappSent = true;
        await invoice.save();
      }
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
      publicPdfUrl,
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

router.get("/:id/pdf", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user._id });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const pdfBuffer = await generateInvoicePdfBuffer(invoice, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Invoice_${invoice.invoiceNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to generate PDF", error: error.message });
  }
});

export default router;
