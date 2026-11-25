import express from "express";
import crypto from "crypto";
import {
  SYSTEM_SESSION_ID,
  getWhatsAppStatus,
  waitForWhatsAppQrOrReady,
  initWhatsApp,
  disconnectWhatsApp,
  requestPairingCodeForNumber,
  sendSystemWhatsAppMessage,
} from "../services/whatsappService.js";
import {
  getAwsMessagingStatus,
  getEmailProviderDetails,
  isSesConfigured,
  sendEmailViaSes,
} from "../services/awsMessagingService.js";

const router = express.Router();

function getAdminSecret() {
  return process.env.ADMIN_SETUP_KEY || process.env.JWT_SECRET || "";
}

function constantTimeMatch(a = "", b = "") {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (!bufA.length || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdminKey(req, res, next) {
  const expected = getAdminSecret();
  if (!expected) {
    return res.status(500).json({ success: false, message: "ADMIN_SETUP_KEY not configured" });
  }
  const provided =
    req.headers["x-admin-key"] ||
    req.query?.key ||
    req.body?.adminKey ||
    "";

  if (!constantTimeMatch(provided, expected)) {
    return res.status(401).json({ success: false, message: "Invalid admin key" });
  }
  next();
}

/**
 * REST API for Bistromate Admin Portal:
 * Admin WhatsApp ('system') and Email (AWS SES/Gmail SMTP) management.
 */
router.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    service: "Bistromate Admin API",
    version: "1.2.4",
    message: "Admin service is active. Use endpoints with x-admin-key header.",
    endpoints: {
      status: "GET /api/admin/status",
      whatsappInit: "POST /api/admin/whatsapp/init",
      whatsappPairingCode: "POST /api/admin/whatsapp/pairing-code",
      whatsappDisconnect: "POST /api/admin/whatsapp/disconnect",
      whatsappTest: "POST /api/admin/whatsapp/test",
      emailVerify: "POST /api/admin/email/verify-identity",
      emailTest: "POST /api/admin/email/test"
    }
  });
});

router.use(requireAdminKey);

router.get("/status", (req, res) => {
  const wa = getWhatsAppStatus(SYSTEM_SESSION_ID);
  const aws = getAwsMessagingStatus();
  const emailDetails = getEmailProviderDetails();
  return res.status(200).json({
    success: true,
    whatsapp: wa,
    email: emailDetails,
    awsMessaging: aws,
  });
});

router.post("/whatsapp/init", async (req, res) => {
  const force = req.body?.force !== false;
  await initWhatsApp(force, SYSTEM_SESSION_ID, { cleanUnregistered: force });
  const status = await waitForWhatsAppQrOrReady(18000, SYSTEM_SESSION_ID);
  return res.status(200).json({ success: true, ...status });
});

router.post("/whatsapp/pairing-code", async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }
  try {
    const code = await requestPairingCodeForNumber(phone, SYSTEM_SESSION_ID);
    return res.status(200).json({ success: true, code });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/whatsapp/disconnect", async (req, res) => {
  await disconnectWhatsApp(false, SYSTEM_SESSION_ID);
  return res.status(200).json({ success: true, status: "disconnected" });
});

router.post("/whatsapp/test", async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ success: false, message: "Recipient phone required" });
  const result = await sendSystemWhatsAppMessage(
    phone,
    message || "Bistromate Company WhatsApp test message — your system OTP sender is active!",
    { attachLogo: true }
  );
  return res.status(result.success ? 200 : 400).json(result);
});

router.post("/email/test", async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ success: false, message: "Recipient email required" });
  try {
    const result = await sendEmailViaSes({
      to,
      subject: "Bistromate Company Email Test",
      text: "Your Bistromate AWS SES company email configuration is working!",
    });
    return res.status(result.sent ? 200 : 400).json({ success: result.sent, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

