import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getWhatsAppStatus,
  waitForWhatsAppQrOrReady,
  initWhatsApp,
  disconnectWhatsApp,
  sendWhatsAppMessage,
} from "../services/whatsappService.js";

const router = express.Router();

router.use(protect);

router.get("/status", (req, res) => {
  const status = getWhatsAppStatus();
  return res.status(200).json({ success: true, ...status });
});

router.post("/init", async (req, res) => {
  const force = req.body?.force === true;
  await initWhatsApp(force);
  const status = await waitForWhatsAppQrOrReady(7000);
  return res.status(200).json({ success: true, ...status });
});

router.post("/pairing-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }
  try {
    const { requestPairingCodeForNumber } = await import("../services/whatsappService.js");
    const code = await requestPairingCodeForNumber(phone);
    return res.status(200).json({ success: true, code });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  const result = await disconnectWhatsApp();
  return res.status(200).json(result);
});

router.post("/test", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ success: false, message: "Phone and message required" });
  }
  const result = await sendWhatsAppMessage(phone, message);
  return res.status(result.success ? 200 : 400).json(result);
});

export default router;
