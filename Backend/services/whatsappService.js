import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always use /tmp on Vercel, local folder otherwise
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

const MAX_RECONNECT_DELAY = 30000;

function getReconnectDelay() {
  const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return delay;
}

function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(async () => {
    if (sock && connectionStatus === "connected") {
      try {
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

export const getWhatsAppStatus = () => ({
  status: connectionStatus,
  qrCode: qrCodeData,
  phoneNumber: connectedNumber,
});

export const initWhatsApp = async () => {
  if (isInitializing || connectionStatus === "connected") return;
  isInitializing = true;
  qrCodeData = null;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["Billing App", "Chrome", "125.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeData = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          connectionStatus = "scan_qr";
        } catch {
          qrCodeData = null;
        }
      }

      if (connection === "open") {
        connectionStatus = "connected";
        qrCodeData = null;
        reconnectAttempts = 0;
        connectedNumber = sock.user?.id ? sock.user.id.split(":")[0] : null;
        isInitializing = false;
        startKeepAlive();
        console.log(`[WhatsApp] Connected: +${connectedNumber}`);
      }

      if (connection === "close") {
        stopKeepAlive();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        connectionStatus = "disconnected";
        connectedNumber = null;
        isInitializing = false;

        if (isLoggedOut) {
          console.log("[WhatsApp] Logged out remotely. Clearing session...");
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
          reconnectAttempts = 0;
          setTimeout(() => initWhatsApp(), 2000);
        } else {
          const delay = getReconnectDelay();
          console.log(`[WhatsApp] Reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts})...`);
          setTimeout(() => initWhatsApp(), delay);
        }
      }
    });
  } catch (err) {
    console.error("[WhatsApp] Init error:", err.message);
    connectionStatus = "disconnected";
    isInitializing = false;
    const delay = getReconnectDelay();
    setTimeout(() => initWhatsApp(), delay);
  }
};

export const disconnectWhatsApp = async () => {
  stopKeepAlive();
  try { if (sock) await sock.logout(); } catch {}
  try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
  sock = null;
  qrCodeData = null;
  connectionStatus = "disconnected";
  connectedNumber = null;
  isInitializing = false;
  reconnectAttempts = 0;
  setTimeout(() => initWhatsApp(), 1000);
  return { success: true };
};

export const sendWhatsAppMessage = async (recipientPhone, textMessage) => {
  if (!sock || connectionStatus !== "connected") {
    return { success: false, message: "WhatsApp not linked via QR code" };
  }
  try {
    const clean = recipientPhone.toString().replace(/[^0-9]/g, "");
    if (!clean) return { success: false, message: "Invalid phone number" };
    const fullNumber = clean.length === 10 ? `91${clean}` : clean;
    const jid = `${fullNumber}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: textMessage });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
