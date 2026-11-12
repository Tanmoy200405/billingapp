import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Item from "../models/Item.js";
import Party from "../models/Party.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendWhatsAppMessage, sendWhatsAppDocument, normalizeWhatsAppNumber } from "../services/whatsappService.js";
import { generateInvoicePdfBuffer } from "../services/pdfService.js";
import { enqueueJob } from "../services/jobQueueService.js";
import { invalidateUserCache } from "../services/cacheService.js";
const router = express.Router();

function getPublicBackendBase() {
  const configured = (process.env.BACKEND_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured && !configured.includes("onrender.com")) {
    return configured;
  }
  return "https://billingapi.duckdns.org";
}

const VALID_ORDER_SOURCES = new Set(["COUNTER", "TAKEAWAY", "SWIGGY", "ZOMATO"]);

function resolveOrderSource(orderSource, paymentMode) {
  const src = (orderSource || "").toString().trim().toUpperCase();
  if (VALID_ORDER_SOURCES.has(src)) return src;
  const mode = (paymentMode || "").toString().trim().toUpperCase();
  if (mode === "SWIGGY") return "SWIGGY";
  if (mode === "ZOMATO") return "ZOMATO";
  return "COUNTER";
}

function safeSecretEqual(a = "", b = "") {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (!bufA.length || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function resolveParcelMode(processedItems = []) {
  let totalQty = 0;
  let totalParcel = 0;
  for (const it of processedItems) {
    const q = Number(it.quantity || 0);
    const p = Number(it.parcelQuantity || 0);
    totalQty += q;
    totalParcel += p;
  }
  if (totalParcel <= 0) return "DINE_IN";
  if (totalParcel >= totalQty) return "PARCEL";
  return "MIXED";
}

async function getNextDailyInvoiceNumber(userId) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const todayInvoices = await Invoice.find({
    userId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  })
    .select("invoiceNumber")
    .lean();
  let maxNumber = 0;
  for (const inv of todayInvoices) {
    const num = parseInt(inv.invoiceNumber, 10);
    if (!isNaN(num) && num > maxNumber) maxNumber = num;
  }
  return (maxNumber + 1).toString();
}

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
    const storeName = storeUser?.businessName || invoice.businessName || "My Store";
    const phone = storeUser?.phone || storeUser?.whatsappNumber || "";
    const rawDate = invoice.createdAt || invoice.invoiceDate || new Date();
    const petpoojaDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(rawDate)).replace(",", "");
    const itemsHtml = (invoice.items || [])
      .map(
        (it, idx) => `
      <tr style="border-bottom: 1px solid #F1F5F9; ${idx % 2 === 1 ? 'background:#F8FAFC;' : ''}">
        <td style="padding: 12px 10px; font-size: 13.5px; font-weight: 600; color: #0F172A;">${it.name}</td>
        <td style="padding: 12px 6px; font-size: 13px; text-align: center; color: #475569;">${it.quantity}</td>
        <td style="padding: 12px 6px; font-size: 13px; text-align: right; color: #475569;">Rs. ${Number(it.sellingPrice || it.price || 0).toFixed(0)}</td>
        <td style="padding: 12px 10px; font-size: 13.5px; text-align: right; font-weight: 700; color: #0F172A;">Rs. ${Number(it.total || 0).toFixed(0)}</td>
      </tr>
    `
      )
      .join("");
    const isPaid = (invoice.paymentStatus || "PAID").toUpperCase() === "PAID";
    const totalSavings = (invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0);
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #${invoice.invoiceNumber} - ${storeName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0B0F19;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 16px;
          }
          .card {
            background: #FFFFFF;
            max-width: 440px;
            width: 100%;
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            overflow: hidden;
            position: relative;
          }
          .accent-top { height: 6px; background: linear-gradient(90deg, #0F172A 0%, #059669 100%); }
          .header { padding: 24px 20px 16px; text-align: center; }
          .store-name { font-size: 19px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; }
          .badges { display: flex; justify-content: center; gap: 8px; margin-top: 6px; }
          .pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
          .pill-tax { background: #F1F5F9; color: #334155; }
          .pill-status { background: ${isPaid ? '#DCFCE7' : '#FEE2E2'}; color: ${isPaid ? '#15803D' : '#B91C1C'}; }
          .token-box { margin: 12px 20px; background: #F8FAFC; border: 1.5px dashed #CBD5E1; border-radius: 14px; padding: 10px; text-align: center; }
          .token-lbl { font-size: 10px; font-weight: 700; color: #64748B; letter-spacing: 1px; text-transform: uppercase; }
          .token-num { font-size: 26px; font-weight: 800; color: #0F172A; }
          .meta-box { margin: 0 20px 12px; background: #F8FAFC; border-radius: 14px; padding: 12px 14px; font-size: 12.5px; color: #334155; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .meta-item b { color: #0F172A; }
          .table-box { padding: 0 16px; }
          .table { width: 100%; border-collapse: collapse; }
          .table th { padding: 8px 10px; background: #0F172A; color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .table th:first-child { border-top-left-radius: 8px; }
          .table th:last-child { border-top-right-radius: 8px; }
          .total-box { margin: 16px 20px 10px; background: #0F172A; color: white; padding: 16px 18px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; }
          .savings-card { margin: 0 20px 12px; background: #DCFCE7; border: 1px solid #86EFAC; color: #15803D; padding: 10px; border-radius: 12px; text-align: center; font-size: 12.5px; font-weight: 700; }
          .btn-download { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 20px; background: #059669; color: white; text-decoration: none; font-weight: 700; font-size: 14.5px; padding: 14px; border-radius: 14px; box-shadow: 0 4px 14px rgba(5,150,105,0.3); transition: transform 0.15s; }
          .btn-download:active { transform: scale(0.98); }
          .footer { text-align: center; font-size: 11.5px; color: #64748B; padding: 10px 20px 22px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="accent-top"></div>
          <div class="header">
            <div class="store-name">${storeName}</div>
            <div class="badges">
              <span class="pill pill-tax">TAX INVOICE</span>
              <span class="pill pill-status">${isPaid ? 'PAID' : 'DUE'}</span>
            </div>
            ${storeUser?.address ? `<div style="font-size: 11.5px; color: #64748B; margin-top: 4px;">${storeUser.address}</div>` : ''}
            ${phone ? `<div style="font-size: 11.5px; color: #64748B;">Phone: ${phone}</div>` : ''}
            ${(storeUser?.googleMapLocation || invoice.googleMapLocation) ? `
              <div style="margin-top: 8px;">
                <a href="${(storeUser?.googleMapLocation || invoice.googleMapLocation).startsWith('http') ? (storeUser?.googleMapLocation || invoice.googleMapLocation) : 'https://' + (storeUser?.googleMapLocation || invoice.googleMapLocation)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #2563EB; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 4px 12px; border-radius: 20px; text-decoration: none;">
                  📍 Open Store on Google Maps
                </a>
              </div>
            ` : ''}
          </div>
          <div class="token-box">
            <div class="token-lbl">Order / Token Number</div>
            <div class="token-num">#${invoice.invoiceNumber || '1'}</div>
          </div>
          <div class="meta-box">
            <div class="meta-item">Bill No: <b>#${invoice.invoiceNumber}</b></div>
            <div class="meta-item">Date: <b>${petpoojaDate}</b></div>
            <div class="meta-item">Customer: <b>${invoice.partyName || "Customer"}</b></div>
            <div class="meta-item">Payment: <b style="color: #059669;">${invoice.paymentMode || "CASH"}</b></div>
          </div>
          <div class="table-box">
            <table class="table">
              <thead>
                <tr>
                  <th style="text-align: left;">Item</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Rate</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>
          <div class="total-box">
            <span style="font-size: 13.5px; font-weight: 600; letter-spacing: 0.5px;">GRAND TOTAL</span>
            <span style="font-size: 22px; font-weight: 800;">Rs. ${Number(invoice.grandTotal || 0).toFixed(2)}</span>
          </div>
          ${totalSavings > 0 ? `<div class="savings-card">🎉 TOTAL SAVINGS: Rs. ${totalSavings.toFixed(0)} ON THIS BILL</div>` : ''}
          <a class="btn-download" href="/api/invoices/public/${invoice._id}/pdf" download="Bill_${invoice.invoiceNumber || 'receipt'}.pdf">
            📥 Download Official PDF Receipt
          </a>
          ${(storeUser?.googleMapLocation || invoice.googleMapLocation) ? `
            <a href="${(storeUser?.googleMapLocation || invoice.googleMapLocation).startsWith('http') ? (storeUser?.googleMapLocation || invoice.googleMapLocation) : 'https://' + (storeUser?.googleMapLocation || invoice.googleMapLocation)}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 20px 10px; background: #EFF6FF; border: 1.5px solid #2563EB; color: #2563EB; text-decoration: none; font-weight: 700; font-size: 13.5px; padding: 12px; border-radius: 14px;">
              📍 Get Directions on Google Maps
            </a>
          ` : ''}
          <div class="footer">
            Thank you for dining with us! Have a wonderful day.
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

// Public Aggregator Webhook (UrbanPiper / Swiggy / Zomato Partner integration)
router.post("/webhook/aggregator/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid store userId" });
    }
    const storeUser = await User.findById(userId).select("-password").lean();
    if (!storeUser) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }
    const cfg = storeUser.aggregatorConfig || {};
    if (!cfg.enabled || !cfg.webhookSecret) {
      return res.status(403).json({
        success: false,
        message: "Live aggregator webhook is not enabled for this store",
      });
    }

    const incomingSecret =
      req.headers["x-webhook-secret"] ||
      req.headers["x-api-key"] ||
      req.query?.secret ||
      "";
    if (!safeSecretEqual(incomingSecret, cfg.webhookSecret)) {
      return res.status(401).json({ success: false, message: "Invalid webhook secret" });
    }

    const body = req.body || {};
    const orderObj = body.order || body;
    const details = orderObj.details || {};
    const rawChannel =
      body.source ||
      body.orderSource ||
      details.channel ||
      details.platform ||
      "";
    const channelUpper = rawChannel.toString().toUpperCase();
    const orderSource = channelUpper.includes("ZOMATO")
      ? "ZOMATO"
      : channelUpper.includes("SWIGGY")
      ? "SWIGGY"
      : resolveOrderSource(rawChannel, "SWIGGY");

    const externalOrderId = String(
      body.orderId ||
        body.externalOrderId ||
        details.ext_platforms?.[0]?.id ||
        details.id ||
        orderObj.id ||
        ""
    ).trim();

    if (externalOrderId) {
      const existingDup = await Invoice.findOne({
        userId: storeUser._id,
        orderSource,
        externalOrderId,
      }).lean();
      if (existingDup) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: `Order ${externalOrderId} already imported`,
          invoice: existingDup,
        });
      }
    }

    const rawItems = Array.isArray(orderObj.items)
      ? orderObj.items
      : Array.isArray(body.items)
      ? body.items
      : [];
    if (!rawItems.length) {
      return res.status(400).json({ success: false, message: "No order items found in payload" });
    }

    const storeCatalog = await Item.find({ userId: storeUser._id }).lean();
    const itemByName = new Map(
      storeCatalog.map((it) => [String(it.name || "").trim().toLowerCase(), it])
    );

    let calculatedSubtotal = 0;
    let calculatedTaxTotal = 0;
    const processedItems = [];
    const stockUpdates = [];

    for (const rawIt of rawItems) {
      const itemName = String(rawIt.title || rawIt.name || rawIt.itemName || "Online Item").trim();
      const qty = Math.max(0.01, Number(rawIt.quantity ?? rawIt.qty ?? 1) || 1);
      const unitPrice = Number(rawIt.price ?? rawIt.sellingPrice ?? rawIt.rate ?? 0);
      const taxRate = Number(rawIt.taxRate ?? 0);
      const lineTotal = unitPrice * qty;
      const lineTax = (lineTotal * taxRate) / 100;
      calculatedSubtotal += lineTotal;
      calculatedTaxTotal += lineTax;

      const matched =
        (rawIt.itemId &&
          mongoose.Types.ObjectId.isValid(rawIt.itemId) && { _id: rawIt.itemId }) ||
        itemByName.get(itemName.toLowerCase());

      processedItems.push({
        itemId: matched?._id,
        name: itemName,
        sellingPrice: unitPrice,
        quantity: qty,
        unit: rawIt.unit || "PCS",
        taxRate,
        total: lineTotal + lineTax,
      });

      if (matched?._id) {
        stockUpdates.push({
          updateOne: {
            filter: { _id: matched._id, userId: storeUser._id },
            update: { $inc: { stock: -qty } },
          },
        });
      }
    }

    const discountTotal = Number(details.discount ?? body.discountTotal ?? 0) || 0;
    const explicitGrandTotal = Number(details.order_total ?? body.grandTotal);
    const totalBeforeRound =
      !isNaN(explicitGrandTotal) && explicitGrandTotal > 0
        ? explicitGrandTotal
        : calculatedSubtotal + calculatedTaxTotal - discountTotal;
    const grandTotal = Math.round(totalBeforeRound);
    const roundOff = Math.round((grandTotal - totalBeforeRound) * 100) / 100;

    const cust = body.customer || orderObj.customer || {};
    const customerName = String(cust.name || body.customerName || `${orderSource} Customer`).trim();
    const customerPhone = normalizeWhatsAppNumber(cust.phone || body.customerPhone || "");
    const invoiceNumber = await getNextDailyInvoiceNumber(storeUser._id);
    const paymentMode = orderSource === "ZOMATO" ? "ZOMATO" : "SWIGGY";

    const invoice = await Invoice.create({
      userId: storeUser._id,
      invoiceNumber,
      invoiceDate: new Date(),
      partyName: customerName,
      partyPhone: customerPhone,
      items: processedItems,
      subtotal: calculatedSubtotal,
      taxTotal: calculatedTaxTotal,
      discountTotal,
      roundOff,
      grandTotal,
      paymentMode,
      orderSource,
      externalOrderId,
      paymentStatus: "PAID",
      paidAmount: grandTotal,
      dueAmount: 0,
      notes: String(details.instructions || body.notes || `Imported from ${orderSource}`).trim(),
    });

    if (stockUpdates.length > 0) {
      await Item.bulkWrite(stockUpdates, { ordered: false }).catch(() => {});
    }
    invalidateUserCache(storeUser._id);

    return res.status(201).json({
      success: true,
      message: `${orderSource} order #${externalOrderId || invoiceNumber} imported`,
      invoice,
    });
  } catch (err) {
    console.error("[Webhook] Aggregator import error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.use(protect);
const sendAutomaticWhatsAppBill = async (
  phone,
  message,
  pdfBuffer = null,
  invoiceNumber = "1",
  storeName = "THE A POP JAKO BITES",
  userId = null
) => {
  if (pdfBuffer) {
    try {
      const docResult = await sendWhatsAppDocument(
        phone,
        pdfBuffer,
        `Invoice_${invoiceNumber}.pdf`,
        message,
        userId
      );
      if (docResult && docResult.success) {
        console.log(`[WhatsApp] Invoice #${invoiceNumber} PDF delivered successfully to +${phone}`);
        return true;
      }
    } catch (docErr) {
      console.warn("[WhatsApp] Document send warning:", docErr.message);
    }
  }
  try {
    const directResult = await sendWhatsAppMessage(phone, message, userId);
    if (directResult && directResult.success) {
      console.log(`[WhatsApp] Invoice #${invoiceNumber} text copy delivered to +${phone}`);
      return true;
    }
  } catch (textErr) {
    console.warn("[WhatsApp] Direct message warning:", textErr.message);
  }
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
    const { startDate, endDate, paymentMode, orderSource, partyId, limit = 50 } = req.query;
    const filter = { userId: req.user._id };
    if (paymentMode) {
      filter.paymentMode = paymentMode.toUpperCase();
    }
    if (orderSource) {
      filter.orderSource = orderSource.toUpperCase();
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
      orderSource,
      externalOrderId = "",
      cashAmount,
      upiAmount,
      applyRegularDiscount = true,
      additionalDiscountPercent = 0,
      customDiscountPercent = 0,
      customFreebieItem = "",
      notes,
    } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one item is required" });
    }
    let customer = null;
    let isRegularCustomer = false;
    let regularDiscountPercent = Number(customDiscountPercent) || 0;
    let freebieItem = (customFreebieItem || "").trim();
    const typedDigits = (partyPhone || "").toString().replace(/[^0-9]/g, "").replace(/^0+/, "");
    const tenDigitPhone = typedDigits.length >= 10 ? typedDigits.slice(-10) : typedDigits;
    if (partyId) {
      customer = await Party.findOne({ _id: partyId, userId: req.user._id });
      if (customer && tenDigitPhone && (!customer.phone || customer.phone !== tenDigitPhone)) {
        customer.phone = tenDigitPhone;
        customer.whatsappNumber = tenDigitPhone;
        await customer.save();
      }
    } else if (tenDigitPhone && tenDigitPhone.length === 10) {
      customer = await Party.findOne({
        userId: req.user._id,
        $or: [
          { phone: tenDigitPhone },
          { phone: `91${tenDigitPhone}` },
          { whatsappNumber: tenDigitPhone },
          { whatsappNumber: `91${tenDigitPhone}` },
        ],
      });
      if (!customer) {
        customer = await Party.create({
          userId: req.user._id,
          name: partyName && partyName.trim() !== "Walk-in Customer" ? partyName.trim() : `Customer ${tenDigitPhone.slice(-4)}`,
          phone: tenDigitPhone,
          whatsappNumber: tenDigitPhone,
          type: "customer",
        });
      } else if (partyName && partyName.trim() !== "Walk-in Customer" && customer.name.startsWith("Customer ")) {
        customer.name = partyName.trim();
        await customer.save();
      }
    }
    if (customer) {
      const vipThreshold = req.user?.vipVisitThreshold || 3;
      isRegularCustomer = customer.isRegular || (customer.visitCount >= vipThreshold);
      if (!regularDiscountPercent && isRegularCustomer && applyRegularDiscount) {
        regularDiscountPercent = customer.customDiscountPercent || 0;
      }
      if (!freebieItem && isRegularCustomer && applyRegularDiscount) {
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
      const validItemId =
        it.itemId && mongoose.Types.ObjectId.isValid(it.itemId)
          ? new mongoose.Types.ObjectId(it.itemId)
          : it._id && mongoose.Types.ObjectId.isValid(it._id)
          ? new mongoose.Types.ObjectId(it._id)
          : undefined;

      const pQty = Math.min(qty, Math.max(0, Number(it.parcelQuantity ?? (it.isParcel ? qty : 0)) || 0));
      processedItems.push({
        itemId: validItemId,
        name: it.name || it.itemName || "Item",
        barcode: it.barcode,
        sellingPrice: price,
        quantity: qty,
        parcelQuantity: pQty,
        unit: it.unit || "PCS",
        taxRate,
        discountPercent: it.discountPercent || 0,
        total: lineTotal + lineTax,
      });
      if (validItemId) {
        stockUpdates.push({
          updateOne: {
            filter: { _id: validItemId, userId: req.user._id },
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
    const invoiceNumber = await getNextDailyInvoiceNumber(req.user._id);
    const mode = paymentMode.toUpperCase();
    const resolvedSource = resolveOrderSource(orderSource, mode);
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
    let rawDestination = "";
    if (tenDigitPhone && tenDigitPhone.length === 10) {
      rawDestination = tenDigitPhone;
    } else if (customer) {
      rawDestination = customer.whatsappNumber || customer.phone || "";
    } else if (partyPhone) {
      rawDestination = partyPhone;
    }
    const destinationPhone = normalizeWhatsAppNumber(rawDestination);
    const currentTimestamp = new Date();
    const invoice = await Invoice.create({
      userId: req.user._id,
      invoiceNumber,
      invoiceDate: currentTimestamp,
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
      orderSource: resolvedSource,
      externalOrderId: String(externalOrderId || "").trim(),
      parcelMode: resolveParcelMode(processedItems),
      cashAmount: finalCash,
      upiAmount: finalUpi,
      paymentStatus,
      paidAmount,
      dueAmount,
      whatsappSent: false,
      googleMapLocation: (req.body.googleMapLocation || req.user?.googleMapLocation || "").trim(),
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
      const vipThreshold = req.user?.vipVisitThreshold || 3;
      if (!customer.isRegular && (customer.visitCount >= vipThreshold || customer.totalSpent >= 5000)) {
        customer.isRegular = true;
      }
      await customer.save();
    }
    const business = req.user;
    const resolvedMapLocation = (
      req.body.googleMapLocation ||
      business.googleMapLocation ||
      ""
    ).trim();
    if (resolvedMapLocation && !business.googleMapLocation) {
      business.googleMapLocation = resolvedMapLocation;
      await business.save().catch(() => {});
    }
    const backendBase = getPublicBackendBase();
    const publicPdfUrl = `${backendBase}/api/invoices/public/${invoice._id}/pdf`;
    const itemsSummary = processedItems
      .map((it, idx) => `• ${it.name} x ${it.quantity} = Rs.${it.total}`)
      .join("\n");
    const petpoojaDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(invoice.invoiceDate || invoice.createdAt || currentTimestamp)).replace(",", "");
    const storeTitle = business.businessName || "My Store";
    const amountVal = Number(grandTotal || 0).toFixed(0);
    const storePhoneClean = (business.phone || business.whatsappNumber || "").replace(/[^0-9]/g, "");
    const feedbackStorePhone = storePhoneClean.length === 10 ? `91${storePhoneClean}` : storePhoneClean;
    const invoiceNumStr = String(invoiceNumber || invoice.invoiceNumber || "");
    const lovedUrl = `https://wa.me/${feedbackStorePhone}?text=${encodeURIComponent(`Loved it! ⭐️ Fantastic experience with Order #${invoiceNumStr}`)}`;
    const okayUrl = `https://wa.me/${feedbackStorePhone}?text=${encodeURIComponent(`Okay 👍 Order #${invoiceNumStr} was fine`)}`;
    const needsImpUrl = `https://wa.me/${feedbackStorePhone}?text=${encodeURIComponent(`Needs Improvement 👎 Feedback for Order #${invoiceNumStr}`)}`;
    const discountLine = (invoice.discountTotal > 0 || invoice.regularDiscountAmount > 0)
      ? `🎉 Discount: -Rs.${((invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0)).toFixed(0)}\n`
      : "";
    const freebieLine = invoice.freebieItemGiven
      ? `🎁 Complimentary Gift: ${invoice.freebieItemGiven}\n`
      : "";
    const mapLocationLine = (resolvedMapLocation || business.googleMapLocation)
      ? `📍 *Find Us on Google Maps:*\n${resolvedMapLocation || business.googleMapLocation}\n\n`
      : "";
    const whatsappText =
      `Dear Customer,\n\n` +
      `Thank you for your order at *${storeTitle}*!\n\n` +
      `📋 *Bill No:* #${invoiceNumStr}\n` +
      `📅 *Date & Time:* ${petpoojaDate}\n` +
      `👤 *Customer:* ${invoice.partyName || "Customer"}\n` +
      `💳 *Payment:* ${invoice.paymentMode || "CASH"}\n\n` +
      `🛒 *ORDER DETAILS:*\n` +
      `${itemsSummary}\n\n` +
      `💵 *Subtotal:* Rs.${Number(invoice.subtotal || invoice.grandTotal).toFixed(0)}\n` +
      discountLine +
      freebieLine +
      `💰 *Grand Total:* *Rs.${amountVal}*\n\n` +
      `🔗 *View Full Bill Online:*\n${publicPdfUrl}\n\n` +
      mapLocationLine +
      `How was your experience with *${storeTitle}* today?\n` +
      `_Tap to reply automatically in 1 click:_\n` +
      `🌟 *Loved it!* ➔ ${lovedUrl}\n` +
      `👍 *Okay* ➔ ${okayUrl}\n` +
      `👎 *Needs Improvement* ➔ ${needsImpUrl}\n\n` +
      `_Thank you! Visit again._ ✨`;
    invalidateUserCache(req.user._id);

    let whatsappQueued = false;
    if (req.body.autoSendWhatsApp !== false && destinationPhone) {
      await enqueueJob("INVOICE_WHATSAPP_PDF", {
        invoiceId: invoice._id.toString(),
        userId: req.user._id.toString(),
        destinationPhone,
        whatsappText,
      });
      whatsappQueued = true;
    }

    const whatsappUrl = destinationPhone
      ? `https://wa.me/${destinationPhone}?text=${encodeURIComponent(whatsappText)}`
      : "";
    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoice,
      whatsappSent: false,
      whatsappQueued,
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
router.post("/:id/send-whatsapp", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user._id });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const targetPhone = normalizeWhatsAppNumber(
      req.body.phone || invoice.partyPhone || ""
    );
    if (!targetPhone || targetPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Customer phone number is required to send WhatsApp bill",
      });
    }
    const business = req.user;
    const resolvedMapLocation = (
      req.body.googleMapLocation ||
      business.googleMapLocation ||
      ""
    ).trim();
    if (resolvedMapLocation && !business.googleMapLocation) {
      business.googleMapLocation = resolvedMapLocation;
      await business.save().catch(() => {});
    }
    const backendBase = getPublicBackendBase();
    const publicPdfUrl = `${backendBase}/api/invoices/public/${invoice._id}/pdf`;
    const itemsSummary = (invoice.items || [])
      .map((it) => `• ${it.name} x ${it.quantity} = Rs.${it.total}`)
      .join("\n");
    const petpoojaDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(invoice.createdAt || invoice.invoiceDate || new Date())).replace(",", "");
    const storeTitle = business.businessName || "My Store";
    const amountVal = Number(invoice.grandTotal || 0).toFixed(0);
    const storePhoneClean = (business.phone || business.whatsappNumber || "").replace(/[^0-9]/g, "");
    const feedbackStorePhone = storePhoneClean.length === 10 ? `91${storePhoneClean}` : storePhoneClean;
    const invoiceNumStr = String(invoice.invoiceNumber || "");
    const lovedUrl = `https://wa.me/${feedbackStorePhone}?text=${encodeURIComponent(`Loved it! ⭐️ Fantastic experience with Order #${invoiceNumStr}`)}`;
    const okayUrl = `https://wa.me/${feedbackStorePhone}?text=${encodeURIComponent(`Okay 👍 Order #${invoiceNumStr} was fine`)}`;
    const needsImpUrl = `https://wa.me/${feedbackStorePhone}?text=${encodeURIComponent(`Needs Improvement 👎 Feedback for Order #${invoiceNumStr}`)}`;
    const discountLine = (invoice.discountTotal > 0 || invoice.regularDiscountAmount > 0)
      ? `🎉 Discount: -Rs.${((invoice.discountTotal || 0) + (invoice.regularDiscountAmount || 0)).toFixed(0)}\n`
      : "";
    const freebieLine = invoice.freebieItemGiven
      ? `🎁 Complimentary Gift: ${invoice.freebieItemGiven}\n`
      : "";
    const mapLocationLine = (resolvedMapLocation || business.googleMapLocation)
      ? `📍 *Find Us on Google Maps:*\n${resolvedMapLocation || business.googleMapLocation}\n\n`
      : "";
    const whatsappText =
      `Dear Customer,\n\n` +
      `Thank you for your order at *${storeTitle}*!\n\n` +
      `📋 *Bill No:* #${invoiceNumStr}\n` +
      `📅 *Date & Time:* ${petpoojaDate}\n` +
      `👤 *Customer:* ${invoice.partyName || "Customer"}\n` +
      `💳 *Payment:* ${invoice.paymentMode || "CASH"}\n\n` +
      `🛒 *ORDER DETAILS:*\n` +
      `${itemsSummary}\n\n` +
      `💵 *Subtotal:* Rs.${Number(invoice.subtotal || invoice.grandTotal).toFixed(0)}\n` +
      discountLine +
      freebieLine +
      `💰 *Grand Total:* *Rs.${amountVal}*\n\n` +
      `🔗 *View Full Bill Online:*\n${publicPdfUrl}\n\n` +
      mapLocationLine +
      `How was your experience with *${storeTitle}* today?\n` +
      `_Tap to reply automatically in 1 click:_\n` +
      `🌟 *Loved it!* ➔ ${lovedUrl}\n` +
      `👍 *Okay* ➔ ${okayUrl}\n` +
      `👎 *Needs Improvement* ➔ ${needsImpUrl}\n\n` +
      `_Thank you! Visit again._ ✨`;
    let pdfBuffer = null;
    try {
      pdfBuffer = await generateInvoicePdfBuffer(invoice, business);
    } catch (e) {
      console.warn("PDF generation warning:", e.message);
    }
    const sent = await sendAutomaticWhatsAppBill(
      targetPhone,
      whatsappText,
      pdfBuffer,
      invoice.invoiceNumber,
      business.businessName || "THE A POP JAKO BITES",
      req.user._id
    );
    if (sent) {
      invoice.whatsappSent = true;
      if (!invoice.partyPhone) invoice.partyPhone = targetPhone;
      await invoice.save();
    }
    const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(whatsappText)}`;
    return res.status(200).json({
      success: true,
      whatsappSent: sent,
      whatsappUrl,
      message: sent
        ? "Invoice delivered successfully via WhatsApp!"
        : "WhatsApp socket not linked. Use the pre-filled WhatsApp link to share.",
    });
  } catch (error) {
    console.error("Send WhatsApp bill error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});
router.put("/:id", async (req, res) => {
  try {
    const existing = await Invoice.findOne({ _id: req.params.id, userId: req.user._id });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const {
      partyId,
      partyName,
      partyPhone,
      items,
      paymentMode = "CASH",
      cashAmount,
      upiAmount,
      customDiscountPercent = 0,
      customFreebieItem = "",
      notes,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one item is required" });
    }

    // Revert previous item stocks
    if (existing.items && existing.items.length > 0) {
      const revertStockOps = existing.items
        .filter((it) => it.itemId)
        .map((it) => ({
          updateOne: {
            filter: { _id: it.itemId, userId: req.user._id },
            update: { $inc: { stock: Number(it.quantity) || 1 } },
          },
        }));
      if (revertStockOps.length > 0) {
        await Item.bulkWrite(revertStockOps, { ordered: false }).catch(() => {});
      }
    }

    // Revert previous customer stats
    if (existing.partyId) {
      const oldCustomer = await Party.findOne({ _id: existing.partyId, userId: req.user._id });
      if (oldCustomer) {
        oldCustomer.totalSpent = Math.max(0, (oldCustomer.totalSpent || 0) - (existing.grandTotal || 0));
        if (existing.paymentMode === "CREDIT") {
          oldCustomer.balance = Math.max(0, (oldCustomer.balance || 0) - (existing.grandTotal || 0));
        }
        await oldCustomer.save().catch(() => {});
      }
    }

    // Process new customer
    let customer = null;
    let isRegularCustomer = false;
    let regularDiscountPercent = Number(customDiscountPercent) || 0;
    let freebieItem = (customFreebieItem || "").trim();
    const typedDigits = (partyPhone || "").toString().replace(/[^0-9]/g, "").replace(/^0+/, "");
    const tenDigitPhone = typedDigits.length >= 10 ? typedDigits.slice(-10) : typedDigits;

    if (partyId) {
      customer = await Party.findOne({ _id: partyId, userId: req.user._id });
    } else if (tenDigitPhone && tenDigitPhone.length === 10) {
      customer = await Party.findOne({
        userId: req.user._id,
        $or: [
          { phone: tenDigitPhone },
          { phone: `91${tenDigitPhone}` },
          { whatsappNumber: tenDigitPhone },
        ],
      });
    }

    if (customer) {
      isRegularCustomer = customer.isRegular || ((customer.visitCount || 0) >= (req.user?.vipVisitThreshold || 3));
      if (!regularDiscountPercent && isRegularCustomer) {
        regularDiscountPercent = customer.customDiscountPercent || 0;
      }
      if (!freebieItem && isRegularCustomer) {
        freebieItem = customer.assignedFreebie || "";
      }
    }

    // Process items and stock updates
    let calculatedSubtotal = 0;
    let calculatedTaxTotal = 0;
    const processedItems = [];
    const newStockOps = [];

    for (const it of items) {
      const price = Number(it.sellingPrice ?? it.price ?? it.rate ?? 0);
      const qty = Number(it.quantity || it.qty || 1);
      const taxRate = Number(it.taxRate) || 0;
      const lineTotal = price * qty;
      const lineTax = (lineTotal * taxRate) / 100;
      calculatedSubtotal += lineTotal;
      calculatedTaxTotal += lineTax;
      const validItemId =
        it.itemId && mongoose.Types.ObjectId.isValid(it.itemId)
          ? new mongoose.Types.ObjectId(it.itemId)
          : it._id && mongoose.Types.ObjectId.isValid(it._id)
          ? new mongoose.Types.ObjectId(it._id)
          : undefined;

      const pQty = Math.min(qty, Math.max(0, Number(it.parcelQuantity ?? (it.isParcel ? qty : 0)) || 0));
      processedItems.push({
        itemId: validItemId,
        name: it.name || it.itemName || "Item",
        barcode: it.barcode,
        sellingPrice: price,
        quantity: qty,
        parcelQuantity: pQty,
        unit: it.unit || "PCS",
        taxRate,
        discountPercent: it.discountPercent || 0,
        total: lineTotal + lineTax,
      });
      if (validItemId) {
        newStockOps.push({
          updateOne: {
            filter: { _id: validItemId, userId: req.user._id },
            update: { $inc: { stock: -qty } },
          },
        });
      }
    }

    if (newStockOps.length > 0) {
      await Item.bulkWrite(newStockOps, { ordered: false }).catch(() => {});
    }

    const discountAmount = Math.round((calculatedSubtotal * regularDiscountPercent) / 100 * 100) / 100;
    const totalBeforeRound = calculatedSubtotal + calculatedTaxTotal - discountAmount;
    const grandTotal = Math.round(totalBeforeRound);
    const roundOff = Math.round((grandTotal - totalBeforeRound) * 100) / 100;

    const mode = paymentMode.toUpperCase();
    const isCredit = mode === "CREDIT";
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

    existing.partyId = customer ? customer._id : undefined;
    existing.partyName = customer ? customer.name : partyName || "Cash Customer";
    existing.partyPhone = normalizeWhatsAppNumber(partyPhone || (customer ? customer.phone : ""));
    existing.isRegularCustomer = isRegularCustomer;
    existing.items = processedItems;
    existing.regularDiscountAppliedPercent = regularDiscountPercent;
    existing.regularDiscountAmount = discountAmount;
    existing.freebieItemGiven = freebieItem;
    existing.subtotal = calculatedSubtotal;
    existing.taxTotal = calculatedTaxTotal;
    existing.discountTotal = discountAmount;
    existing.roundOff = roundOff;
    existing.grandTotal = grandTotal;
    existing.paymentMode = mode;
    existing.cashAmount = finalCash;
    existing.upiAmount = finalUpi;
    existing.paymentStatus = isCredit ? "UNPAID" : "PAID";
    existing.paidAmount = isCredit ? 0 : grandTotal;
    existing.dueAmount = isCredit ? grandTotal : 0;
    if (notes !== undefined) existing.notes = notes;

    await existing.save();

    if (customer) {
      customer.totalSpent = (customer.totalSpent || 0) + grandTotal;
      if (isCredit) {
        customer.balance = (customer.balance || 0) + grandTotal;
      }
      await customer.save().catch(() => {});
    }

    invalidateUserCache(req.user._id);

    return res.status(200).json({
      success: true,
      message: `Invoice #${existing.invoiceNumber} updated successfully`,
      invoice: existing,
    });
  } catch (error) {
    console.error("Update invoice error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const query = { userId: req.user._id };
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      query._id = new mongoose.Types.ObjectId(req.params.id);
    } else {
      query._id = req.params.id;
    }
    const invoice = await Invoice.findOne(query);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // Restore item stocks
    if (invoice.items && invoice.items.length > 0) {
      const restockOps = invoice.items
        .filter((it) => it.itemId)
        .map((it) => ({
          updateOne: {
            filter: { _id: it.itemId, userId: req.user._id },
            update: { $inc: { stock: Number(it.quantity) || 1 } },
          },
        }));
      if (restockOps.length > 0) {
        await Item.bulkWrite(restockOps, { ordered: false }).catch(() => {});
      }
    }

    // Revert customer stats
    if (invoice.partyId) {
      const customer = await Party.findOne({ _id: invoice.partyId, userId: req.user._id });
      if (customer) {
        customer.visitCount = Math.max(0, (customer.visitCount || 1) - 1);
        customer.totalSpent = Math.max(0, (customer.totalSpent || 0) - (invoice.grandTotal || 0));
        if (invoice.paymentMode === "CREDIT") {
          customer.balance = Math.max(0, (customer.balance || 0) - (invoice.grandTotal || 0));
        }
        await customer.save().catch(() => {});
      }
    }

    await Invoice.deleteOne({ _id: invoice._id });
    invalidateUserCache(req.user._id);

    return res.status(200).json({
      success: true,
      message: `Invoice #${invoice.invoiceNumber} deleted successfully. Stock restored.`,
    });
  } catch (error) {
    console.error("Delete invoice error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
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