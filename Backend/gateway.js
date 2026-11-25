import http from "http";
import config from "./config/env.js";
import app from "./app.js";
import { getAwsMessagingStatus } from "./services/awsMessagingService.js";

const PORT = config.port;

const SERVICE_TARGETS = {
  core: config.microservices.coreUrl,
  billing: config.microservices.billingUrl,
  reports: config.microservices.reportsUrl,
  messaging: config.microservices.messagingUrl,
};

const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 128,
  keepAliveMsecs: 30000,
});

function resolveTarget(urlPath = "/") {
  if (urlPath.startsWith("/api/invoices")) return SERVICE_TARGETS.billing;
  if (urlPath.startsWith("/api/reports")) return SERVICE_TARGETS.reports;
  if (urlPath.startsWith("/api/whatsapp") || urlPath.startsWith("/api/admin")) return SERVICE_TARGETS.messaging;
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
      architecture: "resilient-microservices",
      timestamp: new Date().toISOString(),
    });
  }

  if (urlPath === "/api/health" && req.method === "GET") {
    const [core, billing, reports, messaging] = await Promise.all([
      checkServiceHealth("core", SERVICE_TARGETS.core),
      checkServiceHealth("billing", SERVICE_TARGETS.billing),
      checkServiceHealth("reports", SERVICE_TARGETS.reports),
      checkServiceHealth("messaging", SERVICE_TARGETS.messaging),
    ]);

    const allHealthy = core.healthy && billing.healthy && reports.healthy && messaging.healthy;
    return sendJson(res, 200, {
      status: allHealthy ? "healthy" : "operational_standalone_fallback",
      architecture: "resilient-gateway",
      services: { core, billing, reports, messaging },
      awsMessaging: getAwsMessagingStatus(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  if (urlPath === "/api/download-apk" && req.method === "GET") {
    res.writeHead(302, { Location: config.appRelease.apkUrl });
    return res.end();
  }

  if (urlPath === "/api/app-version" && req.method === "GET") {
    return sendJson(res, 200, {
      success: true,
      latestVersion: config.appRelease.latestVersion,
      minSupportedVersion: config.appRelease.minSupportedVersion,
      apkUrl: config.appRelease.apkUrl,
      releaseNotes: config.appRelease.releaseNotes,
      forceUpdate: false,
      timestamp: new Date().toISOString(),
    });
  }

  // Check if target microservice is reachable
  const targetBase = resolveTarget(urlPath);
  let parsedTarget;
  try {
    parsedTarget = new URL(urlPath, targetBase);
  } catch {
    return sendJson(res, 400, { success: false, message: "Invalid request URL" });
  }

  // Attempt proxying to microservice
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
      timeout: 25000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on("timeout", () => {
    proxyReq.destroy(new Error("Gateway timeout"));
  });

  proxyReq.on("error", (err) => {
    // Self-healing fallback: If upstream microservice fails, route seamlessly through in-process app!
    if (!res.headersSent) {
      console.warn(`[Gateway Notice] Upstream at ${targetBase} unreachable (${err.message}). Seamlessly serving via unified core app.`);
      return app(req, res);
    }
  });

  req.pipe(proxyReq, { end: true });
});

if (config.nodeEnv !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[API Gateway] Resilient router active on 0.0.0.0:${PORT}`);
  });
}

export default server;
