import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getWhatsAppStatus,
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
  await initWhatsApp();
  const status = getWhatsAppStatus();
  return res.status(200).json({ success: true, ...status });
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
