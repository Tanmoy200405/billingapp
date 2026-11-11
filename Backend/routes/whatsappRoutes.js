import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import User from "../models/User.js";
import {
  getWhatsAppStatus,
  waitForWhatsAppQrOrReady,
  initWhatsApp,
  disconnectWhatsApp,
  sendWhatsAppMessage,
  requestPairingCodeForNumber,
} from "../services/whatsappService.js";

const router = express.Router();

router.use(protect);

router.get("/status", async (req, res) => {
  const userId = req.user?._id?.toString();
  const user = req.user;
  const waStatus = getWhatsAppStatus(userId);

  if (
    waStatus.status === "disconnected" &&
    !waStatus.isInitializing &&
    userId &&
    (user?.whatsappLinked || waStatus.sessionPersisted)
  ) {
    initWhatsApp(false, userId).catch(() => {});
  }

  let userPhone = waStatus.phoneNumber || user?.whatsappLinkedNumber || null;

  if (waStatus.status === "connected" && user?._id) {
    if (!user.whatsappLinked || (waStatus.phoneNumber && user.whatsappLinkedNumber !== waStatus.phoneNumber)) {
      await User.findByIdAndUpdate(user._id, {
        whatsappLinked: true,
        whatsappLinkedNumber: userPhone || "",
      }).catch(() => {});
    }
  }

  return res.status(200).json({
    success: true,
    status: waStatus.status,
    qrCode: waStatus.qrCode,
    phoneNumber: userPhone,
    isInitializing: waStatus.isInitializing,
    lastError: waStatus.lastError,
    isLinkedForUser: waStatus.status === "connected",
  });
});

router.post("/init", async (req, res) => {
  const userId = req.user?._id?.toString();
  const force = req.body?.force === true;
  await initWhatsApp(force, userId, { cleanUnregistered: force });
  const status = await waitForWhatsAppQrOrReady(18000, userId);
  return res.status(200).json({ success: true, ...status });
});

router.post("/pairing-code", async (req, res) => {
  const userId = req.user?._id?.toString();
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }
  try {
    const code = await requestPairingCodeForNumber(phone, userId);
    if (req.user?._id) {
      req.user.whatsappLinkedNumber = phone;
      await User.findByIdAndUpdate(req.user._id, {
        whatsappLinkedNumber: phone,
      }).catch(() => {});
    }
    return res.status(200).json({ success: true, code });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  const userId = req.user?._id?.toString();
  if (req.user?._id) {
    req.user.whatsappLinked = false;
    req.user.whatsappLinkedNumber = "";
    await User.findByIdAndUpdate(req.user._id, {
      whatsappLinked: false,
      whatsappLinkedNumber: "",
    }).catch(() => {});
  }
  await disconnectWhatsApp(false, userId);
  return res.status(200).json({ success: true, status: "disconnected" });
});

router.post("/test", async (req, res) => {
  const userId = req.user?._id?.toString();
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ success: false, message: "Phone and message required" });
  }
  const result = await sendWhatsAppMessage(phone, message, userId);
  return res.status(result.success ? 200 : 400).json(result);
});

export default router;
