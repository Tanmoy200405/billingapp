import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";

dotenv.config();

import mongoose from "mongoose";
import connectDB from "./config/dbConnect.js";
import authRoutes from "./routes/authRoutes.js";
import partyRoutes from "./routes/partyRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import { initWhatsApp } from "./services/whatsappService.js";

connectDB().catch((err) =>
  console.warn("Initial DB connection attempt notice:", err.message)
);

if (!process.env.VERCEL) {
  initWhatsApp().catch((err) =>
    console.warn("WhatsApp initialization notice:", err.message)
  );
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.raw({ type: "application/pdf", limit: "100mb" }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Billing System API",
    version: "1.0.0",
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
      hasUri: Boolean(process.env.MONGODB_URI),
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/download-apk", (req, res) => {
  const candidates = [
    path.resolve(process.cwd(), "../Frontend/BillingApp-release.apk"),
    path.resolve(process.cwd(), "../Frontend/android/app/build/outputs/apk/release/app-release.apk"),
    path.resolve(process.cwd(), "BillingApp-release.apk"),
  ];
  const target = candidates.find((p) => fs.existsSync(p));
  if (target) {
    res.setHeader("Content-Disposition", "attachment; filename=BillingApp-release.apk");
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    return res.sendFile(target);
  }
  return res.status(404).json({ success: false, message: "APK not found on server." });
});

app.get("/api/app-version", (req, res) => {
  const host = req.get("host") || "localhost:5000";
  const protocol = req.protocol || "http";
  const defaultApkUrl = "https://billingapp-backend-hcan.onrender.com/api/download-apk";
  const fallbackApkUrl = `${protocol}://${host}/api/download-apk`;
  res.status(200).json({
    success: true,
    latestVersion: process.env.APP_LATEST_VERSION || "1.0.4",
    minSupportedVersion: process.env.APP_MIN_VERSION || "1.0.0",
    apkUrl: process.env.APP_APK_URL || defaultApkUrl || fallbackApkUrl,
    releaseNotes:
      process.env.APP_RELEASE_NOTES ||
      "Version 1.0.4: Increased PDF import & upload limit up to 100 MB, streaming binary PDF import, party list PDF import, food categories, and keyboard fixes.",
    forceUpdate: false,
    timestamp: new Date().toISOString(),
  });
});

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

app.use("/api/auth", authRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/reports", reportRoutes);

app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Billing API server running on port ${PORT} (0.0.0.0)`);
  });
}

export default app;