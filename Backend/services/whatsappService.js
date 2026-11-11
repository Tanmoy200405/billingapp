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
import mongoose from "mongoose";
import WhatsAppSession from "../models/WhatsAppSession.js";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_SESSION_DIR = process.env.VERCEL
  ? path.join("/tmp", "whatsapp_sessions")
  : path.join(__dirname, "../whatsapp_session");

const MAX_RECONNECT_DELAY = 15000;
const sessions = new Map();
let selfPingStarted = false;

function normalizeUserKey(userId) {
  if (!userId) return null;
  const raw = userId.toString().trim();
  if (!raw) return null;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getOrCreateSession(userId) {
  const userKey = normalizeUserKey(userId);
  if (!userKey) return null;

  let state = sessions.get(userKey);
  if (!state) {
    state = {
      userId: userKey,
      sessionDir: path.join(BASE_SESSION_DIR, userKey),
      sock: null,
      qrCodeData: null,
      connectionStatus: "disconnected",
      connectedNumber: null,
      isInitializing: false,
      reconnectAttempts: 0,
      keepAliveInterval: null,
      syncDebounceTimer: null,
      reconnectTimer: null,
      watcher: null,
    };
    sessions.set(userKey, state);
  }
  return state;
}

function getReconnectDelay(state) {
  const delay = Math.min(2000 * Math.pow(1.3, state.reconnectAttempts), MAX_RECONNECT_DELAY);
  state.reconnectAttempts += 1;
  return delay;
}

function clearTimers(state) {
  if (state.keepAliveInterval) {
    clearInterval(state.keepAliveInterval);
    state.keepAliveInterval = null;
  }
  if (state.syncDebounceTimer) {
    clearTimeout(state.syncDebounceTimer);
    state.syncDebounceTimer = null;
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

async function updateUserLinkStatus(userKey, linked, phoneNumber = "") {
  if (!mongoose.Types.ObjectId.isValid(userKey)) return;
  await User.findByIdAndUpdate(userKey, {
    whatsappLinked: Boolean(linked),
    whatsappLinkedNumber: linked ? phoneNumber || "" : "",
  }).catch(() => {});
}

async function restoreSessionFromMongo(state) {
  try {
    const records = await WhatsAppSession.find({ userId: state.userId }).lean();
    const credsDoc = records.find(
      (r) => (r.fileName || r.key) === "creds.json" || r.key === `${state.userId}:creds.json`
    );

    if (!credsDoc || !credsDoc.data || !credsDoc.data.registered) {
      if (fs.existsSync(state.sessionDir)) {
        const localCredsPath = path.join(state.sessionDir, "creds.json");
        if (!fs.existsSync(localCredsPath)) {
          fs.rmSync(state.sessionDir, { recursive: true, force: true });
          fs.mkdirSync(state.sessionDir, { recursive: true });
        }
      } else {
        fs.mkdirSync(state.sessionDir, { recursive: true });
      }
      if (records.length > 0 && !credsDoc?.data?.registered) {
        await WhatsAppSession.deleteMany({ userId: state.userId }).catch(() => {});
      }
      return;
    }

    if (!fs.existsSync(state.sessionDir)) {
      fs.mkdirSync(state.sessionDir, { recursive: true });
    }

    for (const rec of records) {
      const fileName =
        rec.fileName ||
        (rec.key?.startsWith(`${state.userId}:`)
          ? rec.key.slice(state.userId.length + 1)
          : rec.key);
      if (fileName && rec.data) {
        const filePath = path.join(state.sessionDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(rec.data), "utf-8");
      }
    }
  } catch {}
}

async function syncSessionToMongo(state) {
  try {
    if (!fs.existsSync(state.sessionDir)) return;
    const entries = fs.readdirSync(state.sessionDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const filePath = path.join(state.sessionDir, entry.name);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw);
          const scopedKey = `${state.userId}:${entry.name}`;
          await WhatsAppSession.findOneAndUpdate(
            { key: scopedKey },
            {
              key: scopedKey,
              userId: state.userId,
              fileName: entry.name,
              data,
              updatedAt: new Date(),
            },
            { upsert: true, new: true }
          );
        } catch {}
      }
    }
  } catch {}
}

function triggerSessionSync(state) {
  if (state.syncDebounceTimer) clearTimeout(state.syncDebounceTimer);
  state.syncDebounceTimer = setTimeout(() => {
    syncSessionToMongo(state).catch(() => {});
  }, 800);
}

function startKeepAlive(state) {
  if (state.keepAliveInterval) return;
  state.keepAliveInterval = setInterval(async () => {
    if (state.sock && state.connectionStatus === "connected") {
      try {
        if (state.sock.ws && state.sock.ws.readyState === 1) {
          state.sock.ws.ping();
        }
        await state.sock.sendPresenceUpdate("available");
      } catch {}
    }
  }, 25000);
}

function stopKeepAlive(state) {
  if (state.keepAliveInterval) {
    clearInterval(state.keepAliveInterval);
    state.keepAliveInterval = null;
  }
}

function startServerSelfPing() {
  if (selfPingStarted || process.env.VERCEL) return;
  selfPingStarted = true;
  const backendUrl = process.env.BACKEND_PUBLIC_URL || "https://billingapi.duckdns.org";
  setInterval(async () => {
    try {
      await fetch(`${backendUrl}/api/health`);
    } catch {}
  }, 9 * 60 * 1000);
}

function safelyCloseSocket(state) {
  if (state.watcher) {
    try {
      state.watcher.close();
    } catch {}
    state.watcher = null;
  }
  if (state.sock) {
    try {
      state.sock.ev?.removeAllListeners?.();
      state.sock.end?.();
      if (state.sock.ws) {
        state.sock.ws.close();
      }
    } catch {}
    state.sock = null;
  }
}

/**
 * Migrate any legacy single-tenant WhatsApp session files/documents
 * into the owning user's scoped session namespace on startup.
 */
async function migrateLegacySingleSessionIfNeeded() {
  try {
    const legacyDocs = await WhatsAppSession.find({
      $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
    }).lean();

    const rootEntries = fs.existsSync(BASE_SESSION_DIR)
      ? fs.readdirSync(BASE_SESSION_DIR, { withFileTypes: true })
      : [];
    const rootJsonFiles = rootEntries.filter((e) => e.isFile() && e.name.endsWith(".json"));

    if (!legacyDocs.length && !rootJsonFiles.length) return;

    const owner =
      (await User.findOne({ whatsappLinked: true }).select("_id").lean()) ||
      (await User.findOne().sort({ updatedAt: -1 }).select("_id").lean());

    const targetUid = owner?._id ? owner._id.toString() : "default";
    const targetDir = path.join(BASE_SESSION_DIR, targetUid);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const fileEntry of rootJsonFiles) {
      const oldPath = path.join(BASE_SESSION_DIR, fileEntry.name);
      const newPath = path.join(targetDir, fileEntry.name);
      if (!fs.existsSync(newPath)) {
        fs.renameSync(oldPath, newPath);
      } else {
        fs.rmSync(oldPath, { force: true });
      }
    }

    for (const doc of legacyDocs) {
      const fileName = doc.fileName || doc.key;
      if (!fileName) continue;
      const scopedKey = `${targetUid}:${fileName}`;
      await WhatsAppSession.findOneAndUpdate(
        { key: scopedKey },
        {
          key: scopedKey,
          userId: targetUid,
          fileName,
          data: doc.data,
          updatedAt: doc.updatedAt || new Date(),
        },
        { upsert: true }
      ).catch(() => {});
      await WhatsAppSession.deleteOne({ _id: doc._id }).catch(() => {});
    }
  } catch (err) {
    console.warn("[WhatsApp] Legacy session migration notice:", err.message);
  }
}

/**
 * Restore and connect all saved per-user WhatsApp sessions at server boot.
 */
export const initAllWhatsAppSessions = async () => {
  startServerSelfPing();
  await migrateLegacySingleSessionIfNeeded();

  const userIds = new Set();

  try {
    const dbUsers = await WhatsAppSession.distinct("userId", {
      userId: { $nin: [null, ""] },
      fileName: "creds.json",
    });
    for (const uid of dbUsers) {
      if (uid) userIds.add(String(uid));
    }
  } catch {}

  try {
    if (fs.existsSync(BASE_SESSION_DIR)) {
      const dirs = fs.readdirSync(BASE_SESSION_DIR, { withFileTypes: true });
      for (const entry of dirs) {
        if (entry.isDirectory()) {
          const credsFile = path.join(BASE_SESSION_DIR, entry.name, "creds.json");
          if (fs.existsSync(credsFile)) {
            userIds.add(entry.name);
          }
        }
      }
    }
  } catch {}

  let idx = 0;
  for (const uid of userIds) {
    const delay = idx * 250;
    idx += 1;
    setTimeout(() => {
      initWhatsApp(false, uid).catch((err) =>
        console.warn(`[WhatsApp] Boot init notice for user ${uid}:`, err.message)
      );
    }, delay);
  }

  return Array.from(userIds);
};

export const getWhatsAppStatus = (userId = null) => {
  const userKey = normalizeUserKey(userId);
  if (!userKey) {
    return {
      status: "disconnected",
      qrCode: null,
      phoneNumber: null,
      isShared: false,
      sessionPersisted: false,
    };
  }

  const state = sessions.get(userKey);
  const sessionDir = state?.sessionDir || path.join(BASE_SESSION_DIR, userKey);
  return {
    status: state?.connectionStatus || "disconnected",
    qrCode: state?.qrCodeData || null,
    phoneNumber: state?.connectedNumber || null,
    isShared: false,
    sessionPersisted: fs.existsSync(path.join(sessionDir, "creds.json")),
  };
};

export const waitForWhatsAppQrOrReady = async (timeoutMs = 12000, userId = null) => {
  const current = getWhatsAppStatus(userId);
  if (current.status === "connected" || (current.status === "scan_qr" && current.qrCode)) {
    return current;
  }
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const nextStatus = getWhatsAppStatus(userId);
    if (nextStatus.status === "connected" || (nextStatus.status === "scan_qr" && nextStatus.qrCode)) {
      return nextStatus;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return getWhatsAppStatus(userId);
};

export const initWhatsApp = async (forceRestart = false, userId = null) => {
  const state = getOrCreateSession(userId);
  if (!state) return;

  if (!forceRestart && state.connectionStatus === "connected" && state.sock) {
    return;
  }

  if (!forceRestart && state.isInitializing) {
    return;
  }

  if (!forceRestart && state.connectionStatus === "scan_qr" && state.qrCodeData && state.sock) {
    return;
  }

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  state.isInitializing = true;
  startServerSelfPing();

  try {
    if (forceRestart) {
      stopKeepAlive(state);
      safelyCloseSocket(state);
      state.qrCodeData = null;
      state.connectionStatus = "disconnected";
      state.connectedNumber = null;
    }

    await restoreSessionFromMongo(state);

    if (!fs.existsSync(state.sessionDir)) {
      fs.mkdirSync(state.sessionDir, { recursive: true });
    }

    if (!state.watcher) {
      try {
        state.watcher = fs.watch(state.sessionDir, (eventType, filename) => {
          if (filename && filename.endsWith(".json")) {
            triggerSessionSync(state);
          }
        });
      } catch {}
    }

    const { state: authState, saveCreds } = await useMultiFileAuthState(state.sessionDir);

    let waVersion = [2, 3000, 1015901307];
    try {
      const v = await fetchLatestWaWebVersion();
      if (v?.version) waVersion = v.version;
    } catch {}

    const logger = pino({ level: "silent" });

    const sock = makeWASocket({
      version: waVersion,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
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

    state.sock = sock;

    sock.ev.on("creds.update", async () => {
      if (state.sock !== sock) return;
      try {
        await saveCreds();
        triggerSessionSync(state);
      } catch {}
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      if (state.sock !== sock) return;
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
      if (state.sock !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          state.qrCodeData = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          state.connectionStatus = "scan_qr";
          state.isInitializing = false;
        } catch {
          state.qrCodeData = null;
        }
      }

      if (connection === "open") {
        state.connectionStatus = "connected";
        state.qrCodeData = null;
        state.reconnectAttempts = 0;
        state.connectedNumber = sock.user?.id
          ? sock.user.id.split(":")[0].replace(/[^0-9]/g, "")
          : null;
        state.isInitializing = false;
        startKeepAlive(state);
        await syncSessionToMongo(state);
        await updateUserLinkStatus(state.userId, true, state.connectedNumber);
      }

      if (connection === "close") {
        stopKeepAlive(state);
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        state.connectionStatus = "disconnected";
        state.connectedNumber = null;
        state.isInitializing = false;

        if (statusCode === DisconnectReason.loggedOut) {
          clearTimers(state);
          safelyCloseSocket(state);
          state.qrCodeData = null;
          try {
            fs.rmSync(state.sessionDir, { recursive: true, force: true });
            await WhatsAppSession.deleteMany({ userId: state.userId });
          } catch {}
          await updateUserLinkStatus(state.userId, false, "");
        } else if (statusCode === DisconnectReason.restartRequired) {
          state.reconnectAttempts = 0;
          initWhatsApp(false, state.userId).catch(() => {});
        } else {
          const delay = getReconnectDelay(state);
          state.reconnectTimer = setTimeout(() => {
            initWhatsApp(false, state.userId).catch(() => {});
          }, delay);
        }
      }
    });
  } catch {
    state.connectionStatus = "disconnected";
    state.isInitializing = false;
    const delay = getReconnectDelay(state);
    state.reconnectTimer = setTimeout(() => {
      initWhatsApp(false, state.userId).catch(() => {});
    }, delay);
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

export const requestPairingCodeForNumber = async (phoneNumber, userId = null) => {
  const state = getOrCreateSession(userId);
  if (!state) {
    throw new Error("User authentication required to link WhatsApp.");
  }

  const fullNumber = normalizeWhatsAppNumber(phoneNumber);
  if (!fullNumber || fullNumber.length < 10) {
    throw new Error("Invalid phone number. Please enter a valid 10-digit mobile number.");
  }

  await disconnectWhatsApp(false, state.userId);
  await new Promise((r) => setTimeout(r, 500));

  await initWhatsApp(true, state.userId);

  let waitedMs = 0;
  while ((!state.sock || !state.sock.requestPairingCode) && waitedMs < 16000) {
    await new Promise((r) => setTimeout(r, 350));
    waitedMs += 350;
  }

  if (!state.sock || !state.sock.requestPairingCode) {
    throw new Error("WhatsApp connection timeout. Please try again or use QR code scan.");
  }

  await new Promise((r) => setTimeout(r, 1200));

  const rawCode = await state.sock.requestPairingCode(fullNumber);

  const formattedCode =
    rawCode && rawCode.length === 8
      ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
      : rawCode;

  return formattedCode;
};

export const disconnectWhatsApp = async (autoRestart = false, userId = null) => {
  const state = getOrCreateSession(userId);
  if (!state) return { success: false };

  clearTimers(state);
  try {
    if (state.sock) await state.sock.logout();
  } catch {}
  safelyCloseSocket(state);

  try {
    fs.rmSync(state.sessionDir, { recursive: true, force: true });
  } catch {}
  try {
    await WhatsAppSession.deleteMany({ userId: state.userId });
  } catch {}

  state.qrCodeData = null;
  state.connectionStatus = "disconnected";
  state.connectedNumber = null;
  state.isInitializing = false;
  state.reconnectAttempts = 0;

  await updateUserLinkStatus(state.userId, false, "");

  if (autoRestart) {
    state.reconnectTimer = setTimeout(() => {
      initWhatsApp(true, state.userId).catch(() => {});
    }, 1000);
  }
  return { success: true };
};

function shouldForwardToMessagingService() {
  return process.env.MICROSERVICES_MODE === "true" && process.env.IS_MESSAGING_SERVICE !== "true";
}

function getMessagingServiceBaseUrl() {
  return process.env.MESSAGING_SERVICE_URL || "http://127.0.0.1:5004";
}

async function ensureConnectedForUser(userKey) {
  let state = userKey ? sessions.get(userKey) : null;
  if (state?.sock && state.connectionStatus === "connected") {
    return state;
  }
  const sessionDir = state?.sessionDir || (userKey ? path.join(BASE_SESSION_DIR, userKey) : null);
  const hasCreds = sessionDir && fs.existsSync(path.join(sessionDir, "creds.json"));
  if (userKey && (hasCreds || state?.isInitializing)) {
    await initWhatsApp(false, userKey);
    await waitForWhatsAppQrOrReady(5000, userKey);
    state = sessions.get(userKey);
  }
  return state;
}

export const sendWhatsAppMessage = async (recipientPhone, textMessage, userId = null) => {
  if (shouldForwardToMessagingService()) {
    try {
      const resp = await fetch(`${getMessagingServiceBaseUrl()}/internal/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: recipientPhone,
          message: textMessage,
          userId: userId ? userId.toString() : null,
        }),
      });
      if (resp.ok) return await resp.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  const userKey = normalizeUserKey(userId);
  const state = await ensureConnectedForUser(userKey);

  if (!state?.sock || state.connectionStatus !== "connected") {
    return { success: false, message: "WhatsApp not linked for this store account" };
  }

  try {
    const fullNumber = normalizeWhatsAppNumber(recipientPhone);
    if (!fullNumber || fullNumber.length < 10) {
      return { success: false, message: "Invalid phone number" };
    }

    let jid = `${fullNumber}@s.whatsapp.net`;
    try {
      if (typeof state.sock.onWhatsApp === "function") {
        const [waCheck] = await state.sock.onWhatsApp(fullNumber);
        if (waCheck?.exists && waCheck.jid) {
          jid = waCheck.jid;
        }
      }
    } catch {}

    await state.sock.sendMessage(jid, { text: textMessage });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

/**
 * Send platform-level WhatsApp messages (e.g. pre-login OTP) without attributing to a specific customer store
 * unless a system/default session is connected.
 */
export const sendSystemWhatsAppMessage = async (recipientPhone, textMessage) => {
  if (shouldForwardToMessagingService()) {
    try {
      const resp = await fetch(`${getMessagingServiceBaseUrl()}/internal/whatsapp/send-system`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: recipientPhone, message: textMessage }),
      });
      if (resp.ok) return await resp.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  const preferredKeys = ["system", "default"];
  for (const key of preferredKeys) {
    const state = sessions.get(key);
    if (state?.sock && state.connectionStatus === "connected") {
      return sendWhatsAppMessage(recipientPhone, textMessage, key);
    }
  }

  for (const [key, state] of sessions.entries()) {
    if (state?.sock && state.connectionStatus === "connected") {
      return sendWhatsAppMessage(recipientPhone, textMessage, key);
    }
  }

  return { success: false, message: "No active WhatsApp session on server" };
};

export const sendWhatsAppDocument = async (
  recipientPhone,
  documentBuffer,
  fileName = "Invoice.pdf",
  caption = "",
  userId = null
) => {
  if (shouldForwardToMessagingService()) {
    try {
      const finalBuffer = Buffer.isBuffer(documentBuffer)
        ? documentBuffer
        : Buffer.from(documentBuffer);
      const resp = await fetch(`${getMessagingServiceBaseUrl()}/internal/whatsapp/send-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: recipientPhone,
          base64Buffer: finalBuffer.toString("base64"),
          fileName,
          caption,
          userId: userId ? userId.toString() : null,
        }),
      });
      if (resp.ok) return await resp.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  const userKey = normalizeUserKey(userId);
  const state = await ensureConnectedForUser(userKey);

  if (!state?.sock || state.connectionStatus !== "connected") {
    return { success: false, message: "WhatsApp not linked for this store account" };
  }

  try {
    const fullNumber = normalizeWhatsAppNumber(recipientPhone);
    if (!fullNumber || fullNumber.length < 10) {
      return { success: false, message: "Invalid phone number" };
    }

    let jid = `${fullNumber}@s.whatsapp.net`;
    try {
      if (typeof state.sock.onWhatsApp === "function") {
        const [waCheck] = await state.sock.onWhatsApp(fullNumber);
        if (waCheck?.exists && waCheck.jid) {
          jid = waCheck.jid;
        }
      }
    } catch {}

    const finalBuffer = Buffer.isBuffer(documentBuffer)
      ? documentBuffer
      : Buffer.from(documentBuffer);

    await state.sock.sendMessage(jid, {
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
