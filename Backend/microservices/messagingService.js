import express from "express";
import whatsappRoutes from "../routes/whatsappRoutes.js";
import {
  initAllWhatsAppSessions,
  getWhatsAppStatus,
  sendWhatsAppMessage,
  sendSystemWhatsAppMessage,
} from "../services/whatsappService.js";
import { enqueueJob, startQueueWorker } from "../services/jobQueueService.js";
import { createServiceApp } from "./createServiceApp.js";

/**
 * Async Messaging & Multi-Tenant WhatsApp Microservice (Baileys Sessions + SQS/SNS/SES Worker).
 */
const app = createServiceApp({
  serviceName: "messaging-service",
  defaultPort: process.env.MESSAGING_SERVICE_PORT || 5004,
  onBoot: async () => {
    await initAllWhatsAppSessions();
    startQueueWorker();
  },
  mountRoutes: (server) => {
    // Internal microservice-to-microservice bridge (blocked at API Gateway)
    const internalRouter = express.Router();
    internalRouter.post("/jobs", async (req, res) => {
      const { type, payload } = req.body || {};
      if (!type) return res.status(400).json({ success: false, message: "Missing job type" });
      const result = await enqueueJob(type, payload, { forceLocal: true });
      return res.status(200).json({ success: true, ...result });
    });
    internalRouter.get("/whatsapp/status/:userId", (req, res) => {
      return res.status(200).json(getWhatsAppStatus(req.params.userId));
    });
    internalRouter.post("/whatsapp/send-system", async (req, res) => {
      const { phone, message } = req.body || {};
      const result = await sendSystemWhatsAppMessage(phone, message);
      return res.status(200).json(result);
    });
    internalRouter.post("/whatsapp/send", async (req, res) => {
      const { phone, message, userId } = req.body || {};
      const result = await sendWhatsAppMessage(phone, message, userId);
      return res.status(200).json(result);
    });
    server.use("/internal", internalRouter);

    server.use("/api/whatsapp", whatsappRoutes);
  },
});

export default app;
