import express from "express";
import Party from "../models/Party.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

const router = express.Router();

router.use(protect);

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
    const count = await Party.countDocuments({ userId: req.user._id, isRegular: true });
    return res.status(200).json({ success: true, count });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/send-bulk-vip-offer", async (req, res) => {
  try {
    const vips = await Party.find({
      userId: req.user._id,
      isRegular: true,
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
