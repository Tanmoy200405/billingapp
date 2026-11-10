import express from "express";
import { createRequire } from "module";
import Party from "../models/Party.js";
import Invoice from "../models/Invoice.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendWhatsAppMessage, getWhatsAppStatus } from "../services/whatsappService.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const router = express.Router();

router.use(protect);

router.post("/broadcast-offer", async (req, res) => {
  try {
    const {
      targetAudience = "all",
      customMessage,
      autoSendViaServer = false,
    } = req.body;

    const business = req.user;
    const storeName = business.businessName || "Our Store";
    const vipThreshold = Number(business.vipVisitThreshold) || 3;

    let partyFilter = { userId: business._id };
    if (targetAudience === "vips") {
      partyFilter.$or = [
        { isRegular: true },
        { isRegular: "true" },
        { visitCount: { $gte: vipThreshold } },
        { customDiscountPercent: { $gt: 0 } },
      ];
    }

    const savedParties = await Party.find(partyFilter).lean();
    const recipientMap = new Map();

    for (const p of savedParties) {
      const ph = p.whatsappNumber || p.phone;
      if (ph) {
        const cleanPh = ph.toString().replace(/[^0-9]/g, "");
        if (cleanPh.length >= 10 && cleanPh !== "0000000000") {
          recipientMap.set(cleanPh, {
            name: p.name || "Valued Customer",
            phone: cleanPh,
            isVip: Boolean(p.isRegular || (p.visitCount || 0) >= vipThreshold || p.customDiscountPercent > 0),
          });
        }
      }
    }

    // If VIPs, also discover repeat customers from Invoices (>= vipThreshold purchases)
    if (targetAudience === "vips") {
      try {
        const repeatInvoices = await Invoice.aggregate([
          { $match: { userId: business._id, partyPhone: { $exists: true, $ne: "" } } },
          { $group: { _id: "$partyPhone", count: { $sum: 1 }, name: { $first: "$partyName" } } },
          { $match: { count: { $gte: vipThreshold } } },
        ]);
        for (const inv of repeatInvoices) {
          const cleanPh = (inv._id || "").toString().replace(/[^0-9]/g, "");
          if (cleanPh.length >= 10 && cleanPh !== "0000000000" && !recipientMap.has(cleanPh)) {
            recipientMap.set(cleanPh, {
              name: inv.name && inv.name !== "Walk-in Customer" ? inv.name : "VIP Customer",
              phone: cleanPh,
              isVip: true,
            });
          }
        }
      } catch (aggErr) {
        console.warn("VIP invoice aggregation warning:", aggErr.message);
      }
    }

    // If all, discover all unique invoice customers
    if (targetAudience === "all") {
      const pastInvoices = await Invoice.find({ userId: business._id })
        .select("partyName partyPhone")
        .lean();
      for (const inv of pastInvoices) {
        if (inv.partyPhone) {
          const cleanPh = inv.partyPhone.toString().replace(/[^0-9]/g, "");
          if (cleanPh.length >= 10 && cleanPh !== "0000000000" && !recipientMap.has(cleanPh)) {
            recipientMap.set(cleanPh, {
              name: inv.partyName && inv.partyName !== "Walk-in Customer" ? inv.partyName : "Valued Customer",
              phone: cleanPh,
              isVip: false,
            });
          }
        }
      }
    }

    const recipients = Array.from(recipientMap.values());
    if (!recipients.length) {
      return res.status(200).json({
        success: false,
        message: targetAudience === "vips"
          ? "No VIP customers found yet. Mark customers as Regular or set discounts in Party/Inventory."
          : "No customers with valid phone numbers found.",
        sentCount: 0,
        total: 0,
        recipients: [],
      });
    }

    if (!customMessage || !customMessage.trim()) {
      return res.status(400).json({ success: false, message: "Message text is required." });
    }

    const formattedResults = recipients.map((rec) => {
      const msg =
        `Hello ${rec.name}!\n\n` +
        `Greetings from *${storeName}*! 🎉\n\n` +
        `${customMessage.trim()}\n\n` +
        `Reply here to order directly on WhatsApp!\n\n` +
        `*${storeName}*`;
      const waUrl = `https://wa.me/91${rec.phone}?text=${encodeURIComponent(msg)}`;
      return {
        name: rec.name,
        phone: rec.phone,
        messageText: msg,
        whatsappUrl: waUrl,
        isVip: rec.isVip,
      };
    });

    // Check if server-side WhatsApp socket is connected
    const waStatus = getWhatsAppStatus();
    const canServerSend = waStatus.status === "connected";

    if (autoSendViaServer && canServerSend) {
      let sentCount = 0;
      let failedCount = 0;
      for (const rec of formattedResults) {
        try {
          const r = await sendWhatsAppMessage(rec.phone, rec.messageText);
          if (r?.success) {
            sentCount++;
          } else {
            failedCount++;
          }
        } catch (e) {
          failedCount++;
        }
        // Polite delay between sends so WhatsApp does not disconnect socket
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      return res.status(200).json({
        success: true,
        mode: "server",
        total: formattedResults.length,
        sentCount,
        failedCount,
        message: `Successfully sent ${sentCount} of ${formattedResults.length} messages directly via WhatsApp!`,
        recipients: formattedResults,
      });
    }

    return res.status(200).json({
      success: true,
      mode: "client",
      canServerSend,
      total: formattedResults.length,
      sentCount: formattedResults.length,
      message: `${formattedResults.length} customer${formattedResults.length > 1 ? "s" : ""} ready for broadcast.`,
      recipients: formattedResults,
    });
  } catch (error) {
    console.error("broadcast-offer error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to broadcast offer",
      error: error.message,
    });
  }
});




const buildWhatsAppMessage = (party, business) => {
  let offerDetails = "";
  if (party.customDiscountPercent > 0 && party.assignedFreebie) {
    offerDetails = `Special *${party.customDiscountPercent}% Discount* + *${party.assignedFreebie} FREE* with your next bill!`;
  } else if (party.customDiscountPercent > 0) {
    offerDetails = `Special *${party.customDiscountPercent}% Discount* activated for your next purchase!`;
  } else if (party.assignedFreebie) {
    offerDetails = `*Complimentary ${party.assignedFreebie}* waiting for you on your next visit!`;
  } else if (party.isRegular) {
    offerDetails = `Exclusive VIP rewards and priority service on your next visit!`;
  } else {
    offerDetails = `Exciting new offers and special discounts on your next visit!`;
  }

  const visitLine =
    party.visitCount > 0
      ? `You have visited us *${party.visitCount} times* and spent *Rs.${party.totalSpent || 0}*.\n\n`
      : `We are delighted to have you as our customer!\n\n`;

  return (
    `Hello ${party.name}!\n\n` +
    `Greetings from *${business.businessName}*!\n\n` +
    visitLine +
    `Special Offer:\n${offerDetails}\n\n` +
    `Visit our store or reply to this message to order directly on WhatsApp!\n\n` +
    `Warm regards,\n*${business.businessName}*\nPhone: ${business.phone}`
  );
};

router.get("/vip-count", async (req, res) => {
  try {
    const vipThreshold = Number(req.user?.vipVisitThreshold) || 3;
    const count = await Party.countDocuments({
      userId: req.user._id,
      $or: [{ isRegular: true }, { visitCount: { $gte: vipThreshold } }],
    });
    return res.status(200).json({ success: true, count });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/send-bulk-vip-offer", async (req, res) => {
  try {
    const vipThreshold = Number(req.user?.vipVisitThreshold) || 3;
    const vips = await Party.find({
      userId: req.user._id,
      $or: [{ isRegular: true }, { visitCount: { $gte: vipThreshold } }],
    }).lean();

    if (!vips.length) {
      return res.status(200).json({ success: true, sent: 0, message: "No VIP customers found" });
    }

    const business = req.user;
    const results = [];

    for (const party of vips) {
      const phone = party.whatsappNumber || party.phone;
      if (!phone) continue;
      const message = buildWhatsAppMessage(party, business);
      const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
      let sentDirectly = false;
      try {
        const direct = await sendWhatsAppMessage(phone, message);
        if (direct.success) sentDirectly = true;
      } catch {}
      results.push({ name: party.name, phone, whatsappUrl, message, sentDirectly });
    }

    const autoSentCount = results.filter((r) => r.sentDirectly).length;
    return res.status(200).json({
      success: true,
      sent: results.length,
      autoSentCount,
      vips: results,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to prepare VIP offers", error: error.message });
  }
});

async function upsertPartiesBulk(userId, rawEntries) {
  const existingParties = await Party.find({ userId })
    .select("_id name phone whatsappNumber type isRegular balance visitCount totalSpent")
    .lean();

  const byPhone = new Map();
  const byName = new Map();

  const normalizePhone = (val) => {
    const digits = (val || "").toString().replace(/[^0-9]/g, "").slice(-10);
    return digits && digits !== "0000000000" ? digits : "";
  };

  for (const p of existingParties) {
    const ph = normalizePhone(p.phone);
    const wa = normalizePhone(p.whatsappNumber);
    if (ph && !byPhone.has(ph)) byPhone.set(ph, p);
    if (wa && !byPhone.has(wa)) byPhone.set(wa, p);
    const nm = (p.name || "").trim().toLowerCase();
    if (nm && !byName.has(nm)) byName.set(nm, p);
  }

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const bulkOps = [];

  for (const entry of rawEntries) {
    const rawPhone = (entry.phone || entry.whatsappNumber || entry["Phone"] || entry["Mobile"] || "").toString();
    const cleanPhone = normalizePhone(rawPhone);
    const name = (entry.name || entry["Customer Name"] || entry["Party Name"] || entry["Name"] || "").toString().trim();

    if (!cleanPhone && !name) {
      continue;
    }

    const partyName = name || `Customer ${cleanPhone ? cleanPhone.slice(-4) : "Imported"}`;
    const type = (entry.type || entry["Type"] || "customer").toString().toLowerCase().includes("supp")
      ? "supplier"
      : "customer";
    const isRegular = Boolean(
      entry.isRegular === true ||
      entry.isRegular === "true" ||
      entry["Is Regular"] === "YES" ||
      entry["Is Regular"] === "true" ||
      entry["VIP"] === "YES"
    );
    const balance = Number(entry.balance ?? entry["Udhar Balance"] ?? entry["Balance"] ?? 0) || 0;
    const visitCount = Number(entry.visitCount ?? entry["Visits"] ?? entry["Visit Count"] ?? 1) || 1;
    const totalSpent = Number(entry.totalSpent ?? entry["Total Spent"] ?? 0) || 0;

    let existing = cleanPhone ? byPhone.get(cleanPhone) : null;
    if (!existing && partyName && !partyName.startsWith("Customer ")) {
      existing = byName.get(partyName.toLowerCase()) || null;
    }

    if (existing) {
      const updates = {};
      if (partyName && !partyName.startsWith("Customer ") && existing.name !== partyName) {
        updates.name = partyName;
        existing.name = partyName;
      }
      if (cleanPhone && (!existing.phone || existing.phone === "0000000000")) {
        updates.phone = cleanPhone;
        existing.phone = cleanPhone;
        if (!existing.whatsappNumber || existing.whatsappNumber === "0000000000") {
          updates.whatsappNumber = cleanPhone;
          existing.whatsappNumber = cleanPhone;
        }
      }
      if (type && existing.type !== type && type === "supplier") {
        updates.type = type;
        existing.type = type;
      }
      if (isRegular && !existing.isRegular) {
        updates.isRegular = true;
        existing.isRegular = true;
      }
      if (balance !== 0 && existing.balance !== balance) {
        updates.balance = balance;
        existing.balance = balance;
      }
      if (visitCount > (existing.visitCount || 0)) {
        updates.visitCount = visitCount;
        existing.visitCount = visitCount;
      }
      if (totalSpent > (existing.totalSpent || 0)) {
        updates.totalSpent = totalSpent;
        existing.totalSpent = totalSpent;
      }

      if (Object.keys(updates).length > 0 && existing._id) {
        bulkOps.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: updates },
          },
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      const doc = {
        userId,
        name: partyName,
        phone: cleanPhone || "0000000000",
        whatsappNumber: cleanPhone || "0000000000",
        type,
        isRegular,
        balance,
        visitCount,
        totalSpent,
      };
      bulkOps.push({ insertOne: { document: doc } });
      if (cleanPhone) byPhone.set(cleanPhone, doc);
      if (partyName && !partyName.startsWith("Customer ")) {
        byName.set(partyName.toLowerCase(), doc);
      }
      addedCount++;
    }
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
    await Party.bulkWrite(bulkOps.slice(i, i + CHUNK_SIZE), { ordered: false });
  }

  return { addedCount, updatedCount, skippedCount };
}

router.post("/bulk-import", async (req, res) => {
  try {
    const rawParties = Array.isArray(req.body.parties)
      ? req.body.parties
      : Array.isArray(req.body)
      ? req.body
      : [];

    if (!rawParties.length) {
      return res.status(400).json({ success: false, message: "No parties provided for import" });
    }

    const { addedCount, updatedCount, skippedCount } = await upsertPartiesBulk(req.user._id, rawParties);

    return res.status(200).json({
      success: true,
      message: `Parties imported successfully (${addedCount} added, ${updatedCount} updated, ${skippedCount} already existed)`,
      addedCount,
      updatedCount,
      skippedCount,
      totalProcessed: addedCount + updatedCount + skippedCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

function parsePartiesFromPdfText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parties = [];
  const seenKeys = new Set();

  const headerPattern =
    /^(customer\s*name|party\s*name|name|sl\.?\s*no|s\.?\s*no|phone|mobile|contact|whatsapp|type|vip|regular|visits|total\s*spent|udhar|balance|page\s+\d+|customer\s+ledger|party\s+list|customers?\s+list|generated\s+on|report)/i;

  const extractPhoneFromText = (str) => {
    if (!str) return null;
    // Match optional +91/91/0 followed by 10 digits allowing spaces or dashes inside
    const match = str.match(/(?:\+?91[\s\-]?)?(?:0[\s\-]?)?([6-9](?:[\s\-]?\d){9})\b/) ||
                  str.match(/(?:\+?91[\s\-]?)?(\d{5}[\s\-]?\d{5})\b/) ||
                  str.match(/\b(\d{10})\b/);
    if (!match) return null;
    const digits = match[1].replace(/[^0-9]/g, "");
    if (digits.length === 10 && digits !== "0000000000") {
      return {
        digits,
        matchedText: match[0],
        index: match.index ?? str.indexOf(match[0]),
      };
    }
    return null;
  };

  const addParty = (entry) => {
    const cleanPhone = (entry.phone || "").replace(/[^0-9]/g, "").slice(-10);
    const cleanName = (entry.name || "").replace(/\s+/g, " ").trim();
    if (!cleanPhone && (!cleanName || cleanName.length < 2)) return;

    const finalName = cleanName && cleanName.length >= 2
      ? cleanName
      : `Customer ${cleanPhone.slice(-4)}`;

    const dedupeKey = cleanPhone ? `p:${cleanPhone}` : `n:${finalName.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    parties.push({
      name: finalName,
      phone: cleanPhone,
      type: entry.type === "supplier" ? "supplier" : "customer",
      isRegular: Boolean(entry.isRegular),
      balance: Number(entry.balance) || 0,
      visitCount: Number(entry.visitCount) || 1,
      totalSpent: Number(entry.totalSpent) || 0,
    });
  };

  let pendingName = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 2) continue;
    if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) continue;
    if (/^[-_=]{3,}$/.test(line)) continue;

    // Skip pure header lines if there's no phone number on them
    const phoneInfo = extractPhoneFromText(line);
    if (!phoneInfo && headerPattern.test(line)) {
      pendingName = "";
      continue;
    }

    // 1. Key-value format: "Name: Rahul Phone: 9876543210"
    const kvMatch = line.match(/(?:name|customer|party)\s*[:\-]\s*(.+?)\s+(?:phone|mobile|mob|ph|whatsapp|contact)\s*[:\-]\s*([+\d\s\-]{10,16})/i);
    if (kvMatch) {
      const name = kvMatch[1].replace(/^[\d.\-*)]+\s*/, "").trim();
      const pInfo = extractPhoneFromText(kvMatch[2]);
      if (pInfo) {
        addParty({
          name,
          phone: pInfo.digits,
          isRegular: /\b(vip|regular|yes)\b/i.test(line),
          type: /\bsupplier\b/i.test(line) ? "supplier" : "customer",
        });
        pendingName = "";
        continue;
      }
    }

    // 2. Delimited columns: | , \t ;
    const parts = line.split(/[|\t,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const partPhoneIdx = parts.findIndex((p) => extractPhoneFromText(p));
      if (partPhoneIdx !== -1) {
        const pInfo = extractPhoneFromText(parts[partPhoneIdx]);
        // Find name column (prefer column before phone, skipping pure serial numbers)
        let rawName = "";
        for (let idx = 0; idx < parts.length; idx++) {
          if (idx === partPhoneIdx) continue;
          const candidate = parts[idx].replace(/^[\d.\-*)]+\s*/, "").trim();
          if (candidate && !/^\d+$/.test(candidate) && !/^(customer|supplier|vip|regular|yes|no)$/i.test(candidate)) {
            rawName = candidate;
            break;
          }
        }
        const joinedRest = parts.join(" ");
        const isRegular = /\b(vip|regular|yes)\b/i.test(joinedRest);
        const isSupplier = /\bsupplier\b/i.test(joinedRest);
        addParty({
          name: rawName,
          phone: pInfo.digits,
          type: isSupplier ? "supplier" : "customer",
          isRegular,
        });
        pendingName = "";
        continue;
      }
    }

    // 3. Single line containing both name and phone number
    if (phoneInfo) {
      const beforePhone = line.slice(0, phoneInfo.index).replace(/^[\d.\-*)]+\s*/, "").replace(/[-–:,\|]+$/, "").trim();
      const afterPhone = line.slice(phoneInfo.index + phoneInfo.matchedText.length).trim();

      let name = beforePhone;
      if (!name || headerPattern.test(name) || /^\d+$/.test(name)) {
        // Fallback: maybe pendingName from previous line, or text after phone
        if (pendingName && !headerPattern.test(pendingName)) {
          name = pendingName;
        } else {
          const cleanAfter = afterPhone.replace(/^[-–:,\|]+/, "").replace(/\b(vip|regular|customer|supplier|rs\.?\s*\d+).*$/i, "").trim();
          if (cleanAfter && cleanAfter.length >= 2 && !/^\d+$/.test(cleanAfter)) {
            name = cleanAfter;
          }
        }
      }

      addParty({
        name,
        phone: phoneInfo.digits,
        type: /\bsupplier\b/i.test(line) ? "supplier" : "customer",
        isRegular: /\b(vip|regular)\b/i.test(line),
      });
      pendingName = "";
      continue;
    }

    // 4. Line with no phone — remember as candidate name for next line's phone number
    const cleanCandidate = line.replace(/^[\d.\-*)]+\s*/, "").trim();
    if (
      cleanCandidate.length >= 2 &&
      cleanCandidate.length <= 60 &&
      !/^\d+(\.\d+)?$/.test(cleanCandidate) &&
      !headerPattern.test(cleanCandidate) &&
      /[a-zA-Z]/.test(cleanCandidate)
    ) {
      pendingName = cleanCandidate;
    } else {
      pendingName = "";
    }
  }

  return parties;
}

router.post("/import-pdf", async (req, res) => {
  try {
    const isRawBuffer = Buffer.isBuffer(req.body);
    const { pdfBase64, pdfText, previewOnly: bodyPreview } = isRawBuffer ? {} : (req.body || {});
    const previewOnly = bodyPreview || req.query.previewOnly === "true";
    let extractedText = pdfText || "";

    if (isRawBuffer && req.body.length > 0) {
      const parser = new PDFParse({ data: req.body });
      await parser.load();
      const result = await parser.getText();
      await parser.destroy();
      extractedText = result.text || "";
    } else if (pdfBase64) {
      const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const result = await parser.getText();
      await parser.destroy();
      extractedText = result.text || "";
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({
        success: false,
        message: "No readable text found in the provided PDF file.",
      });
    }

    const parsedParties = parsePartiesFromPdfText(extractedText);
    if (!parsedParties.length) {
      return res.status(400).json({
        success: false,
        message: "Could not find valid customer names or phone numbers in this PDF file.",
      });
    }

    if (previewOnly) {
      return res.status(200).json({
        success: true,
        count: parsedParties.length,
        parties: parsedParties,
      });
    }

    const { addedCount, updatedCount, skippedCount } = await upsertPartiesBulk(
      req.user._id,
      parsedParties
    );

    return res.status(200).json({
      success: true,
      message: `PDF party list imported (${addedCount} added, ${updatedCount} updated, ${skippedCount} already existed)`,
      addedCount,
      updatedCount,
      skippedCount,
      totalParsed: parsedParties.length,
      totalProcessed: addedCount + updatedCount + skippedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to process PDF file: " + error.message,
    });
  }
});

router.post("/upsert-by-phone", async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number required" });
    }
    const cleanPhone = phone.toString().trim().replace(/[^0-9]/g, "");
    let party = await Party.findOne({ userId: req.user._id, phone: cleanPhone });
    if (!party) {
      party = await Party.create({
        userId: req.user._id,
        name: name ? name.trim() : `Customer ${cleanPhone.slice(-4)}`,
        phone: cleanPhone,
        whatsappNumber: cleanPhone,
        type: "customer",
      });
    } else if (name && name.trim() && party.name.startsWith("Customer ")) {
      party.name = name.trim();
      await party.save();
    }
    return res.status(200).json({ success: true, party });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to upsert customer", error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { type, isRegular, search } = req.query;
    const filter = { userId: req.user._id };

    if (type) {
      filter.type = type;
    }

    if (isRegular !== undefined) {
      filter.isRegular = isRegular === "true";
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: searchRegex }, { phone: searchRegex }];
    }

    const parties = await Party.find(filter)
      .sort({ isRegular: -1, visitCount: -1, lastVisitDate: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: parties.length,
      parties,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parties",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Customer/Party not found",
      });
    }

    return res.status(200).json({
      success: true,
      party,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch party",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      name,
      phone,
      whatsappNumber,
      type = "customer",
      billingAddress,
      gstin,
      openingBalance = 0,
      isRegular = false,
      customDiscountPercent = 0,
      assignedFreebie = "",
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Customer name and phone number are required",
      });
    }

    const cleanPhone = phone.toString().trim().replace(/[^0-9]/g, "");

    const newParty = await Party.create({
      userId: req.user._id,
      name: name.trim(),
      phone: cleanPhone,
      whatsappNumber: whatsappNumber
        ? whatsappNumber.toString().trim().replace(/[^0-9]/g, "")
        : cleanPhone,
      type,
      billingAddress,
      gstin,
      balance: Number(openingBalance) || 0,
      isRegular: Boolean(isRegular),
      customDiscountPercent: Number(customDiscountPercent) || 0,
      assignedFreebie: assignedFreebie ? assignedFreebie.trim() : "",
    });

    return res.status(201).json({
      success: true,
      message: "Party added successfully",
      party: newParty,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create party",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      phone,
      whatsappNumber,
      type,
      billingAddress,
      gstin,
      balance,
      visitCount,
      isRegular,
      customDiscountPercent,
      assignedFreebie,
      loyaltyNotes,
    } = req.body;

    const updatedParty = await Party.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      {
        ...(name && { name: name.trim() }),
        ...(phone && { phone: phone.toString().trim().replace(/[^0-9]/g, "") }),
        ...(whatsappNumber && {
          whatsappNumber: whatsappNumber.toString().trim().replace(/[^0-9]/g, ""),
        }),
        ...(type && { type }),
        ...(billingAddress !== undefined && { billingAddress }),
        ...(gstin !== undefined && { gstin }),
        ...(balance !== undefined && { balance: Number(balance) || 0 }),
        ...(visitCount !== undefined && { visitCount: Math.max(0, Number(visitCount) || 0) }),
        ...(isRegular !== undefined && { isRegular: Boolean(isRegular) }),
        ...(customDiscountPercent !== undefined && {
          customDiscountPercent: Number(customDiscountPercent),
        }),
        ...(assignedFreebie !== undefined && { assignedFreebie }),
        ...(loyaltyNotes !== undefined && { loyaltyNotes }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedParty) {
      return res.status(404).json({
        success: false,
        message: "Party not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Party updated successfully",
      party: updatedParty,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update party",
      error: error.message,
    });
  }
});

router.put("/:id/regular-perks", async (req, res) => {
  try {
    const { isRegular, customDiscountPercent, assignedFreebie, loyaltyNotes } =
      req.body;

    const party = await Party.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (isRegular !== undefined) party.isRegular = Boolean(isRegular);
    if (customDiscountPercent !== undefined)
      party.customDiscountPercent = Number(customDiscountPercent);
    if (assignedFreebie !== undefined) party.assignedFreebie = assignedFreebie.trim();
    if (loyaltyNotes !== undefined) party.loyaltyNotes = loyaltyNotes.trim();

    await party.save();

    return res.status(200).json({
      success: true,
      message: `Perks updated for regular customer ${party.name}`,
      party,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update regular customer perks",
      error: error.message,
    });
  }
});

router.get("/:id/whatsapp-offer", async (req, res) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const phone = party.whatsappNumber || party.phone;
    const message = buildWhatsAppMessage(party, req.user);
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;

    return res.status(200).json({
      success: true,
      customerName: party.name,
      phone,
      message,
      whatsappUrl,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate WhatsApp offer",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const party = await Party.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Party not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Party deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete party",
      error: error.message,
    });
  }
});

export default router;
