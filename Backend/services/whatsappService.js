import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

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

export const getWhatsAppStatus = () => {
  return {
    status: connectionStatus,
    qrCode: qrCodeData,
    phoneNumber: connectedNumber,
  };
};

export const initWhatsApp = async () => {
  if (isInitializing || connectionStatus === "connected") return;
  isInitializing = true;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["Billing App", "Chrome", "1.0.0"],
      syncFullHistory: false,
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
        connectedNumber = sock.user?.id ? sock.user.id.split(":")[0] : null;
        isInitializing = false;
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectionStatus = "disconnected";
        connectedNumber = null;
        isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsApp();
          }, 3000);
        } else {
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          } catch {}
          setTimeout(() => {
            initWhatsApp();
          }, 2000);
        }
      }
    });
  } catch {
    connectionStatus = "disconnected";
    isInitializing = false;
  }
};

export const disconnectWhatsApp = async () => {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch {}
  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  } catch {}
  sock = null;
  qrCodeData = null;
  connectionStatus = "disconnected";
  connectedNumber = null;
  isInitializing = false;
  setTimeout(() => {
    initWhatsApp();
  }, 1000);
  return { success: true };
};

export const sendWhatsAppMessage = async (recipientPhone, textMessage) => {
  if (!sock || connectionStatus !== "connected") {
    return { success: false, message: "WhatsApp not linked via QR code" };
  }

  try {
    const clean = recipientPhone.toString().replace(/[^0-9]/g, "");
    if (!clean) {
      return { success: false, message: "Invalid phone number" };
    }

    const fullNumber = clean.length === 10 ? `91${clean}` : clean;
    const jid = `${fullNumber}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: textMessage });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
