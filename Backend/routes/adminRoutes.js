import express from "express";
import crypto from "crypto";
import {
  SYSTEM_SESSION_ID,
  getWhatsAppStatus,
  waitForWhatsAppQrOrReady,
  initWhatsApp,
  disconnectWhatsApp,
  requestPairingCodeForNumber,
  sendSystemWhatsAppMessage,
} from "../services/whatsappService.js";
import {
  getAwsMessagingStatus,
  getEmailProviderDetails,
  isSesConfigured,
  sendEmailViaSes,
} from "../services/awsMessagingService.js";

const router = express.Router();

function getAdminSecret() {
  return process.env.ADMIN_SETUP_KEY || process.env.JWT_SECRET || "";
}

function constantTimeMatch(a = "", b = "") {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (!bufA.length || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdminKey(req, res, next) {
  const expected = getAdminSecret();
  if (!expected) {
    return res.status(500).json({ success: false, message: "ADMIN_SETUP_KEY not configured" });
  }
  const provided =
    req.headers["x-admin-key"] ||
    req.query?.key ||
    req.body?.adminKey ||
    "";

  if (!constantTimeMatch(provided, expected)) {
    return res.status(401).json({ success: false, message: "Invalid admin key" });
  }
  next();
}

/**
 * Self-contained Admin Portal UI to link the Company/Admin WhatsApp ('system')
 * and verify Company Email (AWS SES) independently of any store user.
 */
router.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BillingApp Company Admin — WhatsApp & Email Setup</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F8FAFC; color: #0F172A; margin: 0; padding: 24px; }
    .container { max-width: 760px; margin: 0 auto; }
    .header { background: #2563EB; color: #FFFFFF; border-radius: 16px; padding: 20px 24px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #DBEAFE; }
    .card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    input { padding: 10px 12px; border: 1px solid #CBD5E1; border-radius: 10px; font-size: 14px; flex: 1; min-width: 200px; }
    button { background: #2563EB; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; cursor: pointer; font-size: 13px; }
    button.green { background: #059669; }
    button.red { background: #DC2626; }
    button.gray { background: #475569; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .ok { background: #ECFDF5; color: #059669; }
    .warn { background: #FEF3C7; color: #D97706; }
    .err { background: #FEF2F2; color: #DC2626; }
    .qr-box { text-align: center; padding: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; margin-top: 12px; }
    .code { font-family: monospace; font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #065F46; background: #ECFDF5; padding: 10px 18px; border-radius: 10px; display: inline-block; margin: 10px 0; }
    .hidden { display: none; }
    .msg { margin-top: 10px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BillingApp Company Admin Messaging</h1>
      <p>Link your official Company WhatsApp &amp; Email (separate from all store users) for Login OTP, Register OTP &amp; Alerts</p>
    </div>

    <div id="authCard" class="card">
      <h3 style="margin-top:0">Admin Access</h3>
      <p style="font-size:13px;color:#475569">Enter <code>ADMIN_SETUP_KEY</code> from your Backend <code>.env</code>:</p>
      <div class="row">
        <input id="adminKeyInput" type="password" placeholder="Enter ADMIN_SETUP_KEY" />
        <button onclick="unlockAdmin()">Unlock Portal</button>
      </div>
      <div id="authMsg" class="msg"></div>
    </div>

    <div id="portalBody" class="hidden">
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <h3 style="margin:0">1. Company WhatsApp Number (<code>system</code> session)</h3>
            <p style="font-size:12px;color:#64748B;margin:4px 0 0">Used for sending Register OTP, Login OTP, and Login Alerts to all app users.</p>
          </div>
          <span id="waBadge" class="badge err">Disconnected</span>
        </div>

        <div id="waConnectedBox" class="hidden" style="margin-top:14px;padding:12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px">
          <div class="row" style="justify-content:space-between">
            <div>
              <strong id="waPhoneText">Connected: --</strong>
              <div style="font-size:12px;color:#065F46">24/7 Company OTP &amp; Login Alert delivery is active.</div>
            </div>
            <button class="red" onclick="unlinkWa()">Unlink</button>
          </div>
        </div>

        <div id="waLinkControls" style="margin-top:14px">
          <div class="row">
            <button class="green" onclick="initQr()">Generate QR Code</button>
            <input id="pairPhone" placeholder="Or enter 10-digit company mobile (e.g. 9876543210)" />
            <button onclick="getPairCode()">Get Pairing Code</button>
          </div>
          <div id="qrBox" class="qr-box hidden">
            <p style="margin:0 0 8px;font-weight:700;font-size:13px">Scan with WhatsApp → Linked Devices → Link a Device</p>
            <img id="qrImg" style="width:220px;height:220px;border-radius:10px;background:#fff" />
          </div>
          <div id="pairBox" class="qr-box hidden">
            <p style="margin:0;font-weight:700;font-size:13px">Enter this code in WhatsApp → Link with phone number instead:</p>
            <div id="pairCodeText" class="code">----</div>
          </div>
        </div>

        <div style="margin-top:14px;border-top:1px solid #E2E8F0;padding-top:12px">
          <div class="row">
            <input id="testWaPhone" placeholder="Test recipient 10-digit phone" />
            <button class="gray" onclick="sendTestWa()">Send Test WhatsApp</button>
          </div>
          <div id="waMsg" class="msg"></div>
        </div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <h3 style="margin:0">2. Company Email Address (Gmail SMTP / AWS SES)</h3>
            <p id="emailInfo" style="font-size:12px;color:#64748B;margin:4px 0 0">Loading email configuration...</p>
          </div>
          <span id="emailBadge" class="badge warn">Not Configured</span>
        </div>
        <div style="margin-top:14px">
          <div class="row">
            <input id="testEmailInput" type="email" placeholder="Recipient email to test" />
            <button class="gray" onclick="sendTestEmail()">Send Test Email</button>
          </div>
          <div id="emailMsg" class="msg"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let adminKey = localStorage.getItem('billing_admin_key') || '';
    let pollTimer = null;

    async function apiCall(path, method = 'GET', body = null) {
      const res = await fetch('/api/admin' + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    }

    async function unlockAdmin() {
      const val = document.getElementById('adminKeyInput').value.trim() || adminKey;
      if (!val) return;
      adminKey = val;
      const data = await apiCall('/status');
      if (data.success) {
        localStorage.setItem('billing_admin_key', adminKey);
        document.getElementById('authCard').classList.add('hidden');
        document.getElementById('portalBody').classList.remove('hidden');
        renderStatus(data);
        if (!pollTimer) pollTimer = setInterval(refreshStatus, 3000);
      } else {
        document.getElementById('authMsg').innerText = data.message || 'Invalid admin key';
        localStorage.removeItem('billing_admin_key');
      }
    }

    async function refreshStatus() {
      if (!adminKey) return;
      const data = await apiCall('/status').catch(() => null);
      if (data && data.success) renderStatus(data);
    }

    function renderStatus(data) {
      const wa = data.whatsapp || {};
      const badge = document.getElementById('waBadge');
      const connBox = document.getElementById('waConnectedBox');
      const linkBox = document.getElementById('waLinkControls');
      const qrBox = document.getElementById('qrBox');

      if (wa.status === 'connected') {
        badge.className = 'badge ok';
        badge.innerText = 'Connected';
        connBox.classList.remove('hidden');
        linkBox.classList.add('hidden');
        document.getElementById('waPhoneText').innerText = 'Connected Company WhatsApp: +' + (wa.phoneNumber || 'linked');
      } else {
        connBox.classList.add('hidden');
        linkBox.classList.remove('hidden');
        if (wa.status === 'scan_qr' && wa.qrCode) {
          badge.className = 'badge warn';
          badge.innerText = 'Scan QR';
          qrBox.classList.remove('hidden');
          document.getElementById('qrImg').src = wa.qrCode;
        } else {
          badge.className = 'badge err';
          badge.innerText = wa.status || 'Disconnected';
        }
      }

      const emailBadge = document.getElementById('emailBadge');
      const emailInfo = document.getElementById('emailInfo');
      if (data.email?.configured) {
        if (data.email.provider === 'gmail_smtp') {
          emailBadge.className = 'badge ok';
          emailBadge.innerText = 'Gmail SMTP Ready';
          emailInfo.innerText = 'Sender: ' + data.email.fromEmail + ' (via Gmail / SMTP)';
        } else if (data.email.hasAwsKeys) {
          emailBadge.className = 'badge ok';
          emailBadge.innerText = 'AWS SES Ready';
          emailInfo.innerText = 'Sender: ' + data.email.fromEmail + ' (Region: ' + data.email.region + ')';
        } else {
          emailBadge.className = 'badge warn';
          emailBadge.innerText = 'Needs Password / IAM Keys';
          emailInfo.innerText = 'Sender: ' + data.email.fromEmail + ' — Add GMAIL_APP_PASSWORD or AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY (or EC2 IAM role) in Backend/.env.';
        }
      } else {
        emailBadge.className = 'badge warn';
        emailBadge.innerText = 'Not Configured';
        emailInfo.innerText = 'Set GMAIL_USER + GMAIL_APP_PASSWORD or AWS_SES_FROM_EMAIL in Backend/.env.';
      }
    }

    async function initQr() {
      document.getElementById('waMsg').innerText = 'Generating QR code...';
      document.getElementById('pairBox').classList.add('hidden');
      const data = await apiCall('/whatsapp/init', 'POST', { force: true });
      if (data.success) {
        document.getElementById('waMsg').innerText = data.qrCode ? 'Scan QR below with your company phone.' : (data.lastError || 'Connecting...');
        refreshStatus();
      } else {
        document.getElementById('waMsg').innerText = data.message || 'Failed to generate QR';
      }
    }

    async function getPairCode() {
      const phone = document.getElementById('pairPhone').value.trim();
      if (!phone) return alert('Enter 10-digit company phone number');
      document.getElementById('waMsg').innerText = 'Requesting pairing code...';
      document.getElementById('qrBox').classList.add('hidden');
      const data = await apiCall('/whatsapp/pairing-code', 'POST', { phone });
      if (data.success && data.code) {
        document.getElementById('pairBox').classList.remove('hidden');
        document.getElementById('pairCodeText').innerText = data.code;
        document.getElementById('waMsg').innerText = 'Enter code on your company phone WhatsApp.';
      } else {
        document.getElementById('waMsg').innerText = data.message || 'Failed to generate pairing code';
      }
    }

    async function unlinkWa() {
      if (!confirm('Unlink Company WhatsApp?')) return;
      await apiCall('/whatsapp/disconnect', 'POST');
      document.getElementById('qrBox').classList.add('hidden');
      document.getElementById('pairBox').classList.add('hidden');
      refreshStatus();
    }

    async function sendTestWa() {
      const phone = document.getElementById('testWaPhone').value.trim();
      const data = await apiCall('/whatsapp/test', 'POST', { phone });
      document.getElementById('waMsg').innerText = data.success ? 'Test WhatsApp sent!' : (data.message || 'Failed');
    }

    async function sendTestEmail() {
      const to = document.getElementById('testEmailInput').value.trim();
      const data = await apiCall('/email/test', 'POST', { to });
      document.getElementById('emailMsg').innerText = data.sent
        ? 'Test Email sent via ' + (data.provider === 'gmail_smtp' ? 'Gmail SMTP' : 'AWS SES') + '!'
        : (data.reason || data.message || 'Failed');
    }

    if (adminKey) unlockAdmin();
  </script>
</body>
</html>`);
});

router.use(requireAdminKey);

router.get("/status", (req, res) => {
  const wa = getWhatsAppStatus(SYSTEM_SESSION_ID);
  const aws = getAwsMessagingStatus();
  const emailDetails = getEmailProviderDetails();
  return res.status(200).json({
    success: true,
    whatsapp: wa,
    email: emailDetails,
    awsMessaging: aws,
  });
});

router.post("/whatsapp/init", async (req, res) => {
  const force = req.body?.force !== false;
  await initWhatsApp(force, SYSTEM_SESSION_ID, { cleanUnregistered: force });
  const status = await waitForWhatsAppQrOrReady(18000, SYSTEM_SESSION_ID);
  return res.status(200).json({ success: true, ...status });
});

router.post("/whatsapp/pairing-code", async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }
  try {
    const code = await requestPairingCodeForNumber(phone, SYSTEM_SESSION_ID);
    return res.status(200).json({ success: true, code });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/whatsapp/disconnect", async (req, res) => {
  await disconnectWhatsApp(false, SYSTEM_SESSION_ID);
  return res.status(200).json({ success: true, status: "disconnected" });
});

router.post("/whatsapp/test", async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ success: false, message: "Recipient phone required" });
  const result = await sendSystemWhatsAppMessage(
    phone,
    message || "BillingApp Company WhatsApp test message — your system OTP sender is active!"
  );
  return res.status(result.success ? 200 : 400).json(result);
});

router.post("/email/test", async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ success: false, message: "Recipient email required" });
  try {
    const result = await sendEmailViaSes({
      to,
      subject: "BillingApp Company Email Test",
      text: "Your BillingApp AWS SES company email configuration is working!",
    });
    return res.status(result.sent ? 200 : 400).json({ success: result.sent, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

