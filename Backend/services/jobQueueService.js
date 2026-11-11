import Invoice from "../models/Invoice.js";
import User from "../models/User.js";
import { generateInvoicePdfBuffer } from "./pdfService.js";
import {
  sendWhatsAppMessage,
  sendWhatsAppDocument,
  getWhatsAppStatus,
} from "./whatsappService.js";
import {
  isSqsConfigured,
  sendSqsJob,
  receiveSqsJobs,
  deleteSqsJob,
  sendSmsViaSns,
  isSnsSmsEnabled,
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

  const waStatus = getWhatsAppStatus();
  let sent = false;

  if (waStatus.status === "connected") {
    try {
      if (pdfBuffer) {
        const docRes = await sendWhatsAppDocument(
          destinationPhone,
          pdfBuffer,
          `Bill_${invoice.invoiceNumber || invoice._id}_${(business?.businessName || "Store").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
          whatsappText
        );
        if (docRes?.success) sent = true;
      }
      if (!sent) {
        const textRes = await sendWhatsAppMessage(destinationPhone, whatsappText);
        if (textRes?.success) sent = true;
      }
    } catch (waErr) {
      console.warn("[Worker] WhatsApp send warning:", waErr.message);
    }
  }

  if (sent) {
    invoice.whatsappSent = true;
    await invoice.save().catch(() => {});
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
  const { recipients = [] } = payload || {};
  if (!Array.isArray(recipients) || !recipients.length) return;

  for (const rec of recipients) {
    if (!rec?.phone || !rec?.messageText) continue;
    try {
      await sendWhatsAppMessage(rec.phone, rec.messageText);
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

export async function processJob(job) {
  const { type, payload } = job || {};
  switch (type) {
    case "INVOICE_WHATSAPP_PDF":
      return handleInvoiceWhatsAppJob(payload);
    case "BULK_WHATSAPP_BROADCAST":
      return handleBulkWhatsAppJob(payload);
    case "SEND_SMS":
      return handleSmsJob(payload);
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
 * Uses AWS SQS when configured, with automatic fallback to local non-blocking queue.
 */
export async function enqueueJob(type, payload) {
  if (isSqsConfigured()) {
    try {
      const sqsRes = await sendSqsJob(type, payload);
      if (sqsRes.queued) {
        return { mode: "sqs", messageId: sqsRes.messageId };
      }
    } catch (err) {
      console.warn("[Queue] SQS send failed, using local fallback:", err.message);
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

