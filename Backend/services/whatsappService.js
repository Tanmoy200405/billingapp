import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import WhatsAppSession from "../models/WhatsAppSession.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_DIR = process.env.VERCEL
  ? path.join("/tmp", "whatsapp_session")
  : path.join(__dirname, "../whatsapp_session");

let sock = null;
let qrCodeData = null;
let connectionStatus = "disconnected";
let connectedNumber = null;
let isInitializing = false;
let reconnectAttempts = 0;
let keepAliveInterval = null;
let selfPingStarted = false;
let syncDebounceTimer = null;

const MAX_RECONNECT_DELAY = 15000;

function getReconnectDelay() {
  const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return delay;
}

async function restoreSessionFromMongo() {
  try {
    const credsDoc = await WhatsAppSession.findOne({ key: "creds.json" }).lean();
    if (!credsDoc || !credsDoc.data || !credsDoc.data.registered) {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      await WhatsAppSession.deleteMany({}).catch(() => {});
      return;
    }
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
    const records = await WhatsAppSession.find({}).lean();
    if (records && records.length > 0) {
      for (const rec of records) {
        if (rec.key && rec.data) {
          const filePath = path.join(SESSION_DIR, rec.key);
          fs.writeFileSync(filePath, JSON.stringify(rec.data), "utf-8");
        }
      }
    }
  } catch {}
}

async function syncSessionToMongo() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return;
    const files = fs.readdirSync(SESSION_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(SESSION_DIR, file);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw);
          await WhatsAppSession.findOneAndUpdate(
            { key: file },
            { key: file, data, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        } catch {}
      }
    }
  } catch {}
}

function triggerSessionSync() {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncSessionToMongo().catch(() => {});
  }, 800);
}

function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(async () => {
    if (sock && connectionStatus === "connected") {
      try {
        if (sock.ws && sock.ws.readyState === 1) {
          sock.ws.ping();
        }
        await sock.sendPresenceUpdate("available");
      } catch {}
    }
  }, 25000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function startServerSelfPing() {
  if (selfPingStarted) return;
  selfPingStarted = true;
  const backendUrl = process.env.BACKEND_PUBLIC_URL || "https://billingapi.duckdns.org";
  setInterval(async () => {
    try {
      await fetch(`${backendUrl}/api/whatsapp/status`);
    } catch {}
  }, 9 * 60 * 1000);
}

function safelyCloseSocket() {
  if (sock) {
    try {
      sock.ev?.removeAllListeners?.();
      sock.end?.();
      if (sock.ws) {
        sock.ws.close();
      }
    } catch {}
    sock = null;
  }
}

export const getWhatsAppStatus = () => ({
  status: connectionStatus,
  qrCode: qrCodeData,
  phoneNumber: connectedNumber,
  isShared: true,
  sessionPersisted: fs.existsSync(path.join(SESSION_DIR, "creds.json")),
});

export const waitForWhatsAppQrOrReady = async (timeoutMs = 12000) => {
  if (connectionStatus === "connected" || (connectionStatus === "scan_qr" && qrCodeData)) {
    return getWhatsAppStatus();
  }
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (connectionStatus === "connected" || (connectionStatus === "scan_qr" && qrCodeData)) {
      return getWhatsAppStatus();
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return getWhatsAppStatus();
};

export const initWhatsApp = async (forceRestart = false) => {
  if (connectionStatus === "connected") {
    return;
  }

  if (isInitializing) {
    return;
  }

  if (!forceRestart && connectionStatus === "scan_qr" && qrCodeData && sock) {
    return;
  }

  isInitializing = true;
  startServerSelfPing();

  try {
    if (forceRestart) {
      safelyCloseSocket();
    }

    await restoreSessionFromMongo();

    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    try {
      fs.watch(SESSION_DIR, (eventType, filename) => {
        if (filename && filename.endsWith(".json")) {
          triggerSessionSync();
        }
      });
    } catch {}

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    let waVersion = [2, 3000, 1015901307];
    try {
      const v = await fetchLatestWaWebVersion();
      if (v?.version) waVersion = v.version;
    } catch {}

    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      version: waVersion,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 90000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 90000,
      emitOwnEvents: false,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 5,
    });

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        triggerSessionSync();
      } catch {}
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        if (!messages || !messages.length) return;
        for (const msg of messages) {
          if (msg.key?.fromMe) continue;
          const remoteJid = msg.key?.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us")) continue;
          const text = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ""
          ).trim();
          if (["1", "2", "3", "4", "5"].includes(text)) {
            await sock.sendMessage(remoteJid, {
              text: "Thank you for your feedback! We appreciate your visit and are always striving to make your experience even better. Have a wonderful day!",
            });
          }
        }
      } catch {}
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeData = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          connectionStatus = "scan_qr";
          isInitializing = false;
        } catch {
          qrCodeData = null;
        }
      }

      if (connection === "open") {
        connectionStatus = "connected";
        qrCodeData = null;
        reconnectAttempts = 0;
        connectedNumber = sock.user?.id ? sock.user.id.split(":")[0].replace(/[^0-9]/g, "") : null;
        isInitializing = false;
        startKeepAlive();
        await syncSessionToMongo();
      }

      if (connection === "close") {
        stopKeepAlive();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        connectionStatus = "disconnected";
        connectedNumber = null;
        isInitializing = false;

        if (statusCode === DisconnectReason.loggedOut) {
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            await WhatsAppSession.deleteMany({});
          } catch {}
          const delay = getReconnectDelay();
          setTimeout(() => initWhatsApp(false), delay);
        } else if (statusCode === DisconnectReason.restartRequired) {
          reconnectAttempts = 0;
          initWhatsApp(false);
        } else {
          const delay = getReconnectDelay();
          setTimeout(() => initWhatsApp(false), delay);
        }
      }
    });
  } catch (err) {
    connectionStatus = "disconnected";
    isInitializing = false;
    const delay = getReconnectDelay();
    setTimeout(() => initWhatsApp(false), delay);
  }
};

export function normalizeWhatsAppNumber(phone) {
  if (!phone) return "";
  let digits = phone.toString().replace(/[^0-9]/g, "");
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export const requestPairingCodeForNumber = async (phoneNumber) => {
  const fullNumber = normalizeWhatsAppNumber(phoneNumber);
  if (!fullNumber || fullNumber.length < 10) {
    throw new Error("Invalid phone number. Please enter a valid 10-digit mobile number.");
  }

  await disconnectWhatsApp(false);
  await new Promise((r) => setTimeout(r, 500));

  await initWhatsApp(true);

  let waitedMs = 0;
  while ((!sock || !sock.requestPairingCode) && waitedMs < 16000) {
    await new Promise((r) => setTimeout(r, 350));
    waitedMs += 350;
  }

  if (!sock || !sock.requestPairingCode) {
    throw new Error("WhatsApp connection timeout. Please try again or use QR code scan.");
  }

  await new Promise((r) => setTimeout(r, 1200));

  const rawCode = await sock.requestPairingCode(fullNumber);

  const formattedCode =
    rawCode && rawCode.length === 8
      ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
      : rawCode;

  return formattedCode;
};

export const disconnectWhatsApp = async (autoRestart = true) => {
  stopKeepAlive();
  try {
    if (sock) await sock.logout();
  } catch {}
  safelyCloseSocket();
  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  } catch {}
  try {
    await WhatsAppSession.deleteMany({});
  } catch {}
  qrCodeData = null;
  connectionStatus = "disconnected";
  connectedNumber = null;
  isInitializing = false;
  reconnectAttempts = 0;
  if (autoRestart) {
    setTimeout(() => initWhatsApp(true), 1000);
  }
  return { success: true };
};

export const sendWhatsAppMessage = async (recipientPhone, textMessage) => {
  if (!sock || connectionStatus !== "connected") {
    return { success: false, message: "WhatsApp not linked via QR code" };
  }

  try {
    const fullNumber = normalizeWhatsAppNumber(recipientPhone);
    if (!fullNumber || fullNumber.length < 10) {
      return { success: false, message: "Invalid phone number" };
    }

    let jid = `${fullNumber}@s.whatsapp.net`;
    try {
      if (sock && typeof sock.onWhatsApp === "function") {
        const [waCheck] = await sock.onWhatsApp(fullNumber);
        if (waCheck?.exists && waCheck.jid) {
          jid = waCheck.jid;
        }
      }
    } catch {}

    await sock.sendMessage(jid, { text: textMessage });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const sendWhatsAppDocument = async (recipientPhone, documentBuffer, fileName = "Invoice.pdf", caption = "") => {
  if (!sock || connectionStatus !== "connected") {
    return { success: false, message: "WhatsApp not linked via QR code" };
  }

  try {
    const fullNumber = normalizeWhatsAppNumber(recipientPhone);
    if (!fullNumber || fullNumber.length < 10) {
      return { success: false, message: "Invalid phone number" };
    }

    let jid = `${fullNumber}@s.whatsapp.net`;
    try {
      if (sock && typeof sock.onWhatsApp === "function") {
        const [waCheck] = await sock.onWhatsApp(fullNumber);
        if (waCheck?.exists && waCheck.jid) {
          jid = waCheck.jid;
        }
      }
    } catch {}

    const finalBuffer = Buffer.isBuffer(documentBuffer) ? documentBuffer : Buffer.from(documentBuffer);

    await sock.sendMessage(jid, {
      document: finalBuffer,
      mimetype: "application/pdf",
      fileName: fileName || "Invoice.pdf",
      caption: caption || "",
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
