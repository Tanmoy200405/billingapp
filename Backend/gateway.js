import http from "http";
import dotenv from "dotenv";
import { getAwsMessagingStatus } from "./services/awsMessagingService.js";

dotenv.config();

const PORT = Number(process.env.PORT || 5000);

const SERVICE_TARGETS = {
  core: process.env.CORE_SERVICE_URL || "http://127.0.0.1:5001",
  billing: process.env.BILLING_SERVICE_URL || "http://127.0.0.1:5002",
  reports: process.env.REPORTS_SERVICE_URL || "http://127.0.0.1:5003",
  messaging: process.env.MESSAGING_SERVICE_URL || "http://127.0.0.1:5004",
};

const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 128,
  keepAliveMsecs: 30000,
});

function resolveTarget(urlPath = "/") {
  if (urlPath.startsWith("/api/invoices")) return SERVICE_TARGETS.billing;
  if (urlPath.startsWith("/api/reports")) return SERVICE_TARGETS.reports;
  if (urlPath.startsWith("/api/whatsapp")) return SERVICE_TARGETS.messaging;
  return SERVICE_TARGETS.core;
}

async function checkServiceHealth(name, baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return {
      name,
      healthy: res.ok && data?.status === "healthy",
      status: res.ok ? data?.status || "ok" : `http_${res.status}`,
      uptime: data?.uptime,
      database: data?.database?.status,
    };
  } catch (err) {
    return { name, healthy: false, status: "unreachable", error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url || "/";

  if (urlPath.startsWith("/internal")) {
    return sendJson(res, 403, { success: false, message: "Forbidden: internal endpoint" });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    return res.end();
  }

  if (urlPath === "/" && req.method === "GET") {
    return sendJson(res, 200, {
      status: "online",
      service: "Billing System API Gateway",
      architecture: "microservices",
      timestamp: new Date().toISOString(),
    });
  }

  if (urlPath === "/api/health" && req.method === "GET") {
    const checks = await Promise.all(
      Object.entries(SERVICE_TARGETS).map(([name, baseUrl]) => checkServiceHealth(name, baseUrl))
    );
    const services = Object.fromEntries(checks.map((c) => [c.name, c]));
    const allHealthy = checks.every((c) => c.healthy);

    return sendJson(res, 200, {
      status: allHealthy ? "healthy" : "degraded",
      architecture: "microservices",
      services,
      awsMessaging: getAwsMessagingStatus(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  if (urlPath === "/api/download-apk" && req.method === "GET") {
    const githubApkUrl =
      process.env.APP_APK_URL ||
      "https://github.com/jayeetamajumdar15-dev/billingapp/raw/main/BillingApp-release.apk";
    res.writeHead(302, { Location: githubApkUrl });
    return res.end();
  }

  if (urlPath === "/api/app-version" && req.method === "GET") {
    const defaultApkUrl =
      "https://github.com/jayeetamajumdar15-dev/billingapp/raw/main/BillingApp-release.apk";
    return sendJson(res, 200, {
      success: true,
      latestVersion: process.env.APP_LATEST_VERSION || "1.0.9",
      minSupportedVersion: process.env.APP_MIN_VERSION || "1.0.0",
      apkUrl: process.env.APP_APK_URL || defaultApkUrl,
      releaseNotes:
        process.env.APP_RELEASE_NOTES ||
        "Version 1.0.9: Microservices API gateway, AWS SQS/SNS/SES messaging, multi-user WhatsApp linking, and instant responsive Web/Tablet UI.",
      forceUpdate: false,
      timestamp: new Date().toISOString(),
    });
  }

  const targetBase = resolveTarget(urlPath);
  let parsedTarget;
  try {
    parsedTarget = new URL(urlPath, targetBase);
  } catch {
    return sendJson(res, 400, { success: false, message: "Invalid request URL" });
  }

  const proxyReq = http.request(
    {
      protocol: parsedTarget.protocol,
      hostname: parsedTarget.hostname,
      port: parsedTarget.port,
      path: `${parsedTarget.pathname}${parsedTarget.search}`,
      method: req.method,
      headers: {
        ...req.headers,
        host: parsedTarget.host,
        "x-forwarded-for": req.socket?.remoteAddress || "",
      },
      agent: keepAliveAgent,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        success: false,
        message: "Upstream microservice unavailable",
        target: targetBase,
        error: err.message,
      });
    }
  });

  req.pipe(proxyReq, { end: true });
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[API Gateway] Microservices router active on 0.0.0.0:${PORT}`, SERVICE_TARGETS);
  });
}

export default server;
