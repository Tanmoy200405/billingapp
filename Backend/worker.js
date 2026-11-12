import dotenv from "dotenv";
dotenv.config();

import connectDB from "./config/dbConnect.js";
import { initAllWhatsAppSessions } from "./services/whatsappService.js";
import { startQueueWorker } from "./services/jobQueueService.js";
import { getAwsMessagingStatus } from "./services/awsMessagingService.js";

async function startStandaloneWorker() {
  console.log("[Worker] Booting standalone Bistromate SQS/Messaging worker...");
  await connectDB();
  await initAllWhatsAppSessions().catch((err) =>
    console.warn("[Worker] WhatsApp init warning:", err.message)
  );
  console.log("[Worker] AWS Messaging status:", getAwsMessagingStatus());
  startQueueWorker();
}

startStandaloneWorker().catch((err) => {
  console.error("[Worker] Fatal startup error:", err);
  process.exit(1);
});

