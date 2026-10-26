import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

dotenv.config();

import mongoose from "mongoose";
import connectDB from "./config/dbConnect.js";
import authRoutes from "./routes/authRoutes.js";
import partyRoutes from "./routes/partyRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import { initWhatsApp } from "./services/whatsappService.js";

// Attempt initial connection in background
connectDB().catch((err) =>
  console.warn("Initial DB connection attempt notice:", err.message)
);

// Auto-init WhatsApp on startup to keep session alive (on persistent servers)
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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Ezo Billing System API",
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

app.get("/api/app-version", (req, res) => {
  res.status(200).json({
    success: true,
    latestVersion: process.env.APP_LATEST_VERSION || "1.0.0",
    minSupportedVersion: process.env.APP_MIN_VERSION || "1.0.0",
    apkUrl:
      process.env.APP_APK_URL ||
      "https://github.com/Tanmoy200405/billingapp/releases/latest",
    releaseNotes:
      process.env.APP_RELEASE_NOTES ||
      "Updated with latest improvements, faster billing, and fixes.",
    forceUpdate: false,
    timestamp: new Date().toISOString(),
  });
});

// Database connection middleware for all API data routes
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

app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Ezo Billing API server running on port ${PORT}`);
  });
}

export default app;