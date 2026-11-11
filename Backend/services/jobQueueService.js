import Invoice from "../models/Invoice.js";
import User from "../models/User.js";
import { generateInvoicePdfBuffer } from "./pdfService.js";
import {
  sendWhatsAppMessage,
  sendWhatsAppDocument,
  sendSystemWhatsAppMessage,
  getWhatsAppStatus,
  initWhatsApp,
  waitForWhatsAppQrOrReady,
} from "./whatsappService.js";
import {
  isSqsConfigured,
  sendSqsJob,
  receiveSqsJobs,
  deleteSqsJob,
  sendSmsViaSns,
  isSnsSmsEnabled,
  sendEmailViaSes,
  isSesConfigured,
} from "./awsMessagingService.js";

const localQueue = [];
let localWorkerActive = false;
let sqsWorkerStarted = false;

async function handleInvoiceWhatsAppJob(payload) {
  const { invoiceId, userId, destinationPhone, whatsappText } = payload || {};
  if (!invoiceId || !destinationPhone) return;

  const [invoice, business] = await Promise.all([
    Invoice.findById(invoiceId),
    userId ? User.findById(userId).lean() : null,
  ]);
  if (!invoice) return;

  let pdfBuffer = null;
  try {
    pdfBuffer = await generateInvoicePdfBuffer(invoice, business || {});
  } catch (err) {
    console.warn("[Worker] PDF render warning:", err.message);
  }

  let waStatus = getWhatsAppStatus(userId);
  if (waStatus.status !== "connected" && (business?.whatsappLinked || waStatus.sessionPersisted)) {
    await initWhatsApp(false, userId).catch(() => {});
    waStatus = await waitForWhatsAppQrOrReady(6000, userId);
  }
  let sent = false;

  if (waStatus.status === "connected") {
    try {
      if (pdfBuffer) {
        const docRes = await sendWhatsAppDocument(
          destinationPhone,
          pdfBuffer,
          `Bill_${invoice.invoiceNumber || invoice._id}_${(business?.businessName || "Store").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
          whatsappText,
          userId
        );
        if (docRes?.success) sent = true;
      }
      if (!sent) {
        const textRes = await sendWhatsAppMessage(destinationPhone, whatsappText, userId);
        if (textRes?.success) sent = true;
      }
    } catch (waErr) {
      console.warn("[Worker] WhatsApp send warning:", waErr.message);
    }
  } else {
    console.warn(`[Worker] WhatsApp not connected for user ${userId} (status=${waStatus.status})`);
  }

  if (sent) {
    invoice.whatsappSent = true;
    await invoice.save().catch(() => {});
    console.log(`[Worker] Delivered Bill #${invoice.invoiceNumber} to ${destinationPhone} (user=${userId})`);
  } else if (isSnsSmsEnabled()) {
    // Optional fallback SMS notification via AWS SNS if enabled
    const storeName = business?.businessName || "Our Store";
    const smsText = `Thank you for visiting ${storeName}! Bill #${invoice.invoiceNumber} Total: Rs.${Number(
      invoice.grandTotal || 0
    ).toFixed(0)}.`;
    await sendSmsViaSns(destinationPhone, smsText).catch(() => {});
  }
}

async function handleBulkWhatsAppJob(payload) {
  const { userId, recipients = [] } = payload || {};
  if (!userId || !Array.isArray(recipients) || !recipients.length) return;

  for (const rec of recipients) {
    if (!rec?.phone || !rec?.messageText) continue;
    try {
      await sendWhatsAppMessage(rec.phone, rec.messageText, userId);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

async function handleSmsJob(payload) {
  const { phone, message } = payload || {};
  if (!phone || !message) return;
  await sendSmsViaSns(phone, message).catch((err) => {
    console.warn("[Worker] SNS SMS error:", err.message);
  });
}

async function handleEmailJob(payload) {
  const { to, subject, html, text } = payload || {};
  if (!to || !subject || !isSesConfigured()) return;
  await sendEmailViaSes({ to, subject, html, text }).catch((err) => {
    console.warn("[Worker] SES Email error:", err.message);
  });
}

async function handleSystemWhatsAppJob(payload) {
  const { phone, message } = payload || {};
  if (!phone || !message) return;
  await sendSystemWhatsAppMessage(phone, message).catch((err) => {
    console.warn("[Worker] System WhatsApp error:", err.message);
  });
}

export async function processJob(job) {
  const { type, payload } = job || {};
  switch (type) {
    case "INVOICE_WHATSAPP_PDF":
      return handleInvoiceWhatsAppJob(payload);
    case "BULK_WHATSAPP_BROADCAST":
      return handleBulkWhatsAppJob(payload);
    case "SEND_SMS":
      return handleSmsJob(payload);
    case "SEND_EMAIL":
      return handleEmailJob(payload);
    case "SEND_SYSTEM_WHATSAPP":
      return handleSystemWhatsAppJob(payload);
    default:
      console.warn("[Worker] Unknown job type:", type);
  }
}

async function drainLocalQueue() {
  if (localWorkerActive) return;
  localWorkerActive = true;
  try {
    while (localQueue.length > 0) {
      const job = localQueue.shift();
      try {
        await processJob(job);
      } catch (err) {
        console.error("[LocalQueue] Job execution error:", err.message);
      }
    }
  } finally {
    localWorkerActive = false;
  }
}

/**
 * Enqueue an async background job.
 * Uses AWS SQS when configured, forwards to ms-messaging in microservice mode,
 * or falls back to local non-blocking queue in single-process mode.
 */
export async function enqueueJob(type, payload, options = {}) {
  if (!options.forceLocal && isSqsConfigured()) {
    try {
      const sqsRes = await sendSqsJob(type, payload);
      if (sqsRes.queued) {
        return { mode: "sqs", messageId: sqsRes.messageId };
      }
    } catch (err) {
      console.warn("[Queue] SQS send failed, using fallback:", err.message);
    }
  }

  if (!options.forceLocal && process.env.MICROSERVICES_MODE === "true") {
    const messagingUrl = process.env.MESSAGING_SERVICE_URL || "http://127.0.0.1:5004";
    try {
      const resp = await fetch(`${messagingUrl}/internal/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
      if (resp.ok) {
        return { mode: "microservice-bridge" };
      }
    } catch (err) {
      console.warn("[Queue] Messaging bridge fallback to local queue:", err.message);
    }
  }

  localQueue.push({ type, payload });
  setImmediate(() => {
    drainLocalQueue().catch((e) => console.error("[LocalQueue] Fatal:", e.message));
  });
  return { mode: "local" };
}

async function pollSqsLoop() {
  while (sqsWorkerStarted) {
    try {
      const messages = await receiveSqsJobs(10);
      for (const msg of messages) {
        try {
          const parsed = JSON.parse(msg.Body || "{}");
          await processJob(parsed);
          await deleteSqsJob(msg.ReceiptHandle);
        } catch (err) {
          console.error("[SQS Worker] Job processing error:", err.message);
        }
      }
    } catch (err) {
      console.warn("[SQS Worker] Poll warning:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export function startQueueWorker() {
  if (process.env.DISABLE_EMBEDDED_WORKER === "true") {
    console.log("[Queue] Embedded worker disabled (running external worker.js).");
    return;
  }

  if (isSqsConfigured() && !sqsWorkerStarted) {
    sqsWorkerStarted = true;
    console.log("[Queue] AWS SQS long-polling worker started.");
    pollSqsLoop().catch((err) => console.error("[SQS Worker] Loop error:", err.message));
  } else {
    console.log("[Queue] In-process async background queue ready (set AWS_SQS_QUEUE_URL to enable SQS).");
  }
}

export function stopQueueWorker() {
  sqsWorkerStarted = false;
}

