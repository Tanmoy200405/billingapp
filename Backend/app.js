import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import config from "./config/env.js";
import connectDB from "./config/dbConnect.js";
import authRoutes from "./routes/authRoutes.js";
import partyRoutes from "./routes/partyRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import tableRoutes from "./routes/tableRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import { initAllWhatsAppSessions } from "./services/whatsappService.js";
import { startQueueWorker } from "./services/jobQueueService.js";
import { getAwsMessagingStatus } from "./services/awsMessagingService.js";

// Prevent unhandled errors from terminating the Node process
process.on("uncaughtException", (err) => {
  console.error("[Fatal Error Caught]", err?.stack || err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Promise Rejection]", reason?.stack || reason?.message || reason);
});

// Initial Database Connection
connectDB().catch((err) => {
  console.warn("[Database Connection Warning]", err.message);
});

if (!process.env.VERCEL) {
  initAllWhatsAppSessions().catch((err) => {
    console.warn("[WhatsApp Service Notice]", err.message);
  });
  startQueueWorker();
}

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);
app.use(compression({ threshold: 512 }));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.raw({ type: "application/pdf", limit: "100mb" }));
app.use(cookieParser());

// Root API Health & Identification
app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Bistromate Billing API",
    version: config.appRelease.latestVersion,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = states[mongoose.connection.readyState] || "unknown";
  res.status(200).json({
    status: "healthy",
    database: {
      status: dbState,
      readyState: mongoose.connection.readyState,
      hasUri: Boolean(config.database.uri),
    },
    awsMessaging: getAwsMessagingStatus(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/download-apk", (req, res) => {
  return res.redirect(302, config.appRelease.apkUrl);
});

app.get("/api/app-version", (req, res) => {
  res.status(200).json({
    success: true,
    latestVersion: config.appRelease.latestVersion,
    minSupportedVersion: config.appRelease.minSupportedVersion,
    apkUrl: config.appRelease.apkUrl,
    releaseNotes: config.appRelease.releaseNotes,
    forceUpdate: false,
    timestamp: new Date().toISOString(),
  });
});

// Database Connection Middleware Guard
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failure:", error.message);
    return res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
      hint: "Verify MONGODB_URI in environment variables and ensure MongoDB Atlas Network Access allows 0.0.0.0/0.",
    });
  }
});

// Primary Domain API Routes
app.use("/api/auth", authRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/inventory", inventoryRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[API Error Handler]", err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

if (config.nodeEnv !== "test") {
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`[Bistromate API] Server active on port ${config.port} (0.0.0.0)`);
  });
}

export default app;
