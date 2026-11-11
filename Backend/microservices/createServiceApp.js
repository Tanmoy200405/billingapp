import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import connectDB from "../config/dbConnect.js";
import { getAwsMessagingStatus } from "../services/awsMessagingService.js";

dotenv.config();

/**
 * Shared microservice bootstrap factory.
 * Mounts compression, CORS, DB middleware, and /api/health consistently across services.
 */
export function createServiceApp({ serviceName, defaultPort, mountRoutes, onBoot }) {
  connectDB().catch((err) =>
    console.warn(`[${serviceName}] Initial DB connect notice:`, err.message)
  );

  if (typeof onBoot === "function") {
    Promise.resolve(onBoot()).catch((err) =>
      console.warn(`[${serviceName}] Boot hook notice:`, err.message)
    );
  }

  const app = express();
  const port = Number(process.env.PORT || defaultPort);

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

  app.get("/api/health", (req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    res.status(200).json({
      status: "healthy",
      service: serviceName,
      port,
      database: {
        status: states[mongoose.connection.readyState] || "unknown",
        readyState: mongoose.connection.readyState,
      },
      awsMessaging: getAwsMessagingStatus(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use(async (req, res, next) => {
    try {
      await connectDB();
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Database connection failed",
        error: error.message,
      });
    }
  });

  if (typeof mountRoutes === "function") {
    mountRoutes(app);
  }

  app.use((err, req, res, next) => {
    console.error(`[${serviceName}] Error:`, err.stack || err.message);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  });

  if (process.env.NODE_ENV !== "test") {
    app.listen(port, "0.0.0.0", () => {
      console.log(`[${serviceName}] listening on 0.0.0.0:${port}`);
    });
  }

  return app;
}
