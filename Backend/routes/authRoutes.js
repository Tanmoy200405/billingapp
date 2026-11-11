import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Otp from "../models/Otp.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendSystemWhatsAppMessage } from "../services/whatsappService.js";
import { enqueueJob } from "../services/jobQueueService.js";
import {
  isSnsSmsEnabled,
  isSesConfigured,
  sendEmailViaSes,
} from "../services/awsMessagingService.js";
const router = express.Router();
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const otpRateStore = new Map();

function generateSecureOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function checkRateLimit(bucket, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = otpRateStore.get(bucket);
  if (!entry) return { allowed: true };
  if (now > entry.resetAt) {
    otpRateStore.delete(bucket);
    return { allowed: true };
  }
  if (entry.count >= maxAttempts) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true };
}

function recordRateAttempt(bucket, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  if (otpRateStore.size > 5000) {
    for (const [k, v] of otpRateStore.entries()) {
      if (now > v.resetAt) otpRateStore.delete(k);
    }
  }
  const entry = otpRateStore.get(bucket);
  if (!entry || now > entry.resetAt) {
    otpRateStore.set(bucket, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function clearRateLimit(bucket) {
  otpRateStore.delete(bucket);
}

function maskEmail(email) {
  const [local, domain] = (email || "").split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function maskPhone(phone10) {
  const p = (phone10 || "").slice(-10);
  if (p.length < 4) return p;
  return `******${p.slice(-4)}`;
}

async function findUserByIdentifier(rawInput, includePassword = false) {
  const trimmed = (rawInput || "").toString().trim();
  if (!trimmed) return null;
  const query = trimmed.includes("@")
    ? { email: trimmed.toLowerCase() }
    : (() => {
        const p10 = trimmed.replace(/[^0-9]/g, "").slice(-10);
        if (p10.length !== 10) return null;
        const variants = getPhoneVariants(p10);
        return { $or: [{ phone: { $in: variants } }, { whatsappNumber: { $in: variants } }] };
      })();
  if (!query) return null;
  const q = User.findOne(query);
  if (!includePassword) q.select("-password");
  return q;
}

async function sendOtpChannels({ cleanPhone, targetEmail, code, channel = "whatsapp", title, introText, smsText }) {
  let sentViaWhatsApp = false;
  let sentViaSms = false;
  let sentViaEmail = false;

  if (cleanPhone && cleanPhone.length === 10) {
    try {
      const fullNumber = `91${cleanPhone}`;
      const waMsg = `*${title}*\n\n${introText}: *${code}*\n\nValid for 10 minutes. Do not share this code with anyone.`;
      const waRes = await sendSystemWhatsAppMessage(fullNumber, waMsg);
      if (waRes && waRes.success) {
        sentViaWhatsApp = true;
      }
    } catch {}

    if ((!sentViaWhatsApp || channel === "sms") && isSnsSmsEnabled()) {
      await enqueueJob("SEND_SMS", {
        phone: cleanPhone,
        message: smsText || `Your ${title} OTP is ${code}. Valid for 10 minutes. Do not share.`,
      });
      sentViaSms = true;
    }
  }

  if (targetEmail && isSesConfigured()) {
    const emailRes = await sendEmailViaSes({
      to: targetEmail,
      subject: `${title} (OTP)`,
      text: `${introText}: ${code}. Valid for 10 minutes. Do not share this code.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
          <h2 style="color: #2563EB; margin-top: 0;">${title}</h2>
          <p style="color: #334155;">${introText}:</p>
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 14px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1E40AF;">
            ${code}
          </div>
          <p style="color: #64748B; font-size: 12px; margin-top: 16px;">Valid for 10 minutes. Do not share this code with anyone.</p>
        </div>
      `,
    }).catch(() => null);
    if (emailRes?.sent) sentViaEmail = true;
  }

  const channels = [];
  if (sentViaWhatsApp) channels.push(`WhatsApp (+91 ${maskPhone(cleanPhone)})`);
  if (sentViaSms) channels.push(`SMS (+91 ${maskPhone(cleanPhone)})`);
  if (sentViaEmail) channels.push(`Email (${maskEmail(targetEmail)})`);

  return { sentViaWhatsApp, sentViaSms, sentViaEmail, channels };
}
function getPhoneVariants(phone) {
  const raw = (phone || "").toString().replace(/[^0-9]/g, "");
  const p10 = raw.slice(-10);
  if (p10.length === 10) {
    return [p10, `91${p10}`, `+91${p10}`, `0${p10}`];
  }
  return [raw];
}
function formatIstLoginTime() {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

async function dispatchLoginNotifications(user) {
  if (!user) return;
  const loginTime = formatIstLoginTime();
  const targetPhone = user.whatsappNumber || user.phone;
  const storeName = user.businessName || "My Business";
  const ownerName = user.name || "Store Owner";

  if (targetPhone) {
    const waAlert =
      `*Billing App Login Alert*\n\n` +
      `Hi ${ownerName}, you logged into *${storeName}* at ${loginTime}.\n` +
      `If this wasn't you, please change your password immediately.`;
    enqueueJob("SEND_SYSTEM_WHATSAPP", {
      phone: targetPhone,
      message: waAlert,
    }).catch(() => {});
  }

  if (user.email && isSesConfigured()) {
    enqueueJob("SEND_EMAIL", {
      to: user.email,
      subject: `BillingApp Login Confirmation - ${storeName}`,
      text: `Hi ${ownerName}, your BillingApp account (${storeName}) just logged in at ${loginTime}. If this was not you, please reset your password immediately.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
          <h2 style="color: #2563EB; margin-top: 0;">BillingApp Login Alert</h2>
          <p style="color: #334155;">Hi <strong>${ownerName}</strong>,</p>
          <p style="color: #334155;">Your store account <strong>${storeName}</strong> was accessed on <strong>${loginTime}</strong>.</p>
          <p style="color: #64748B; font-size: 12px; margin-top: 20px;">If this wasn't you, please update your password immediately inside Settings.</p>
        </div>
      `,
    }).catch(() => {});
  }
}

router.post("/send-otp", async (req, res) => {
  try {
    const { phone, identifier, email, channel = "whatsapp", purpose = "login" } = req.body;
    const rawInput = (phone || identifier || email || "").toString().trim();
    if (!rawInput) {
      return res.status(400).json({
        success: false,
        message: "Phone, WhatsApp number, or Email is required",
      });
    }

    const inputIsEmail = rawInput.includes("@");
    let matchedUser = null;
    if (inputIsEmail) {
      matchedUser = await User.findOne({ email: rawInput.toLowerCase() }).select("-password").lean();
    } else {
      const digitsOnly = rawInput.replace(/[^0-9]/g, "");
      const p10 = digitsOnly.slice(-10);
      if (p10.length === 10) {
        const variants = getPhoneVariants(p10);
        matchedUser = await User.findOne({
          $or: [{ phone: { $in: variants } }, { whatsappNumber: { $in: variants } }],
        })
          .select("-password")
          .lean();
      }
    }

    const rawPhoneDigits = (
      (!inputIsEmail ? rawInput : "") ||
      matchedUser?.whatsappNumber ||
      matchedUser?.phone ||
      ""
    )
      .toString()
      .replace(/[^0-9]/g, "");
    const cleanPhone = rawPhoneDigits.slice(-10);
    const targetEmail = (email || (inputIsEmail ? rawInput : "") || matchedUser?.email || "")
      .toString()
      .trim()
      .toLowerCase();

    if (purpose === "register") {
      const dupOr = [];
      if (cleanPhone.length === 10) {
        const pVariants = getPhoneVariants(cleanPhone);
        dupOr.push({ phone: { $in: pVariants } }, { whatsappNumber: { $in: pVariants } });
      }
      if (targetEmail) dupOr.push({ email: targetEmail });
      if (dupOr.length) {
        const existingAccount = await User.findOne({ $or: dupOr }).select("_id").lean();
        if (existingAccount) {
          return res.status(400).json({
            success: false,
            message: "An account with this phone number or email already exists. Please login.",
          });
        }
      }
    }

    if (cleanPhone.length !== 10 && !targetEmail) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number or registered email address",
      });
    }

    const otpKey = cleanPhone.length === 10 ? cleanPhone : targetEmail;
    const sendBucket = `send:${otpKey}`;
    const sendLimit = checkRateLimit(sendBucket, 6, 10 * 60 * 1000);
    if (!sendLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please wait ${sendLimit.retryAfterSec}s before trying again.`,
      });
    }
    recordRateAttempt(sendBucket, 10 * 60 * 1000);

    const code = generateSecureOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const variants = cleanPhone.length === 10 ? getPhoneVariants(cleanPhone) : [targetEmail];
    await Otp.deleteMany({ phone: { $in: variants } });
    await Otp.create({
      phone: otpKey,
      code,
      channel,
      verified: false,
      expiresAt,
    });

    const isRegister = purpose === "register";
    const actionLabel = isRegister ? "Registration" : "Login";

    const { sentViaWhatsApp, sentViaSms, sentViaEmail, channels } = await sendOtpChannels({
      cleanPhone,
      targetEmail,
      code,
      channel,
      title: `BillingApp ${actionLabel} Verification`,
      introText: `Your 6-digit ${actionLabel.toLowerCase()} OTP is`,
      smsText: `Your BillingApp ${actionLabel.toLowerCase()} OTP is ${code}. Valid for 10 minutes. Do not share.`,
    });

    return res.status(200).json({
      success: true,
      message: channels.length
        ? `OTP code sent to your ${channels.join(" & ")}`
        : `Verification code generated for ${cleanPhone ? `+91 ${cleanPhone}` : targetEmail}`,
      ...(channels.length === 0 ? { code } : {}),
      phone: cleanPhone || undefined,
      email: targetEmail || undefined,
      sentViaWhatsApp,
      sentViaSms,
      sentViaEmail,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
});
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP code are required",
      });
    }
    const raw = phone.toString().trim().replace(/[^0-9]/g, "");
    const cleanPhone = raw.slice(-10);
    const variants = getPhoneVariants(cleanPhone);
    const verifyBucket = `verify:${cleanPhone || phone.toString().trim().toLowerCase()}`;
    const verifyLimit = checkRateLimit(verifyBucket, 5, 15 * 60 * 1000);
    if (!verifyLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many failed OTP attempts. Please try again in ${Math.ceil(verifyLimit.retryAfterSec / 60)} minutes.`,
      });
    }

    const otpDoc = await Otp.findOne({
      phone: { $in: variants },
      code: code.toString().trim(),
    });
    if (!otpDoc) {
      const fails = recordRateAttempt(verifyBucket, 15 * 60 * 1000);
      if (fails >= 5) {
        await Otp.deleteMany({ phone: { $in: variants } });
      }
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP code",
      });
    }
    if (new Date() > otpDoc.expiresAt) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }
    clearRateLimit(verifyBucket);
    await Otp.deleteOne({ _id: otpDoc._id });
    let existingUser = await User.findOne({
      $or: [
        { phone: { $in: variants } },
        { whatsappNumber: { $in: variants } },
      ],
    }).select("-password");
    if (!existingUser) {
      const salt = await bcrypt.genSalt(10);
      const defaultPassword = await bcrypt.hash(`wp_${cleanPhone}`, salt);
      existingUser = await User.create({
        name: "Store Owner",
        businessName: "My Business",
        phone: cleanPhone,
        whatsappNumber: cleanPhone,
        password: defaultPassword,
      });
    }
    const token = generateToken(existingUser._id);
    dispatchLoginNotifications(existingUser).catch(() => {});
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. Logged in!",
      token,
      user: existingUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error verifying OTP",
      error: error.message,
    });
  }
});
router.post("/register", async (req, res) => {
  try {
    const {
      name,
      businessName,
      phone,
      whatsappNumber,
      email,
      password,
      otpCode,
      gstin,
      address,
      upiId,
    } = req.body;
    if (!name || !businessName || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, Business Name, Phone, and Password are required",
      });
    }
    const rawPhone = phone.toString().trim().replace(/[^0-9]/g, "");
    const cleanPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : rawPhone;
    const variants = getPhoneVariants(cleanPhone);
    const cleanEmail = email ? email.trim().toLowerCase() : "";

    if (otpCode) {
      const otpLookup = [...variants, ...(cleanEmail ? [cleanEmail] : [])];
      const otpDoc = await Otp.findOne({
        phone: { $in: otpLookup },
        code: otpCode.toString().trim(),
      });
      if (!otpDoc || new Date() > otpDoc.expiresAt) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired registration OTP. Please request a new code.",
        });
      }
      await Otp.deleteOne({ _id: otpDoc._id });
    }

    const dupConditions = [{ phone: { $in: variants } }, { whatsappNumber: { $in: variants } }];
    if (cleanEmail) dupConditions.push({ email: cleanEmail });
    const userExists = await User.findOne({ $or: dupConditions });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "An account with this phone number or email already exists. Please login.",
      });
    }
    const rawWa = (whatsappNumber || "").toString().trim().replace(/[^0-9]/g, "");
    const cleanWa = rawWa.length >= 10 ? rawWa.slice(-10) : cleanPhone;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
      name: name.trim(),
      businessName: businessName.trim(),
      phone: cleanPhone,
      whatsappNumber: cleanWa,
      email: cleanEmail || undefined,
      password: hashedPassword,
      gstin: gstin ? gstin.trim().toUpperCase() : undefined,
      address: address ? address.trim() : undefined,
      upiId: upiId ? upiId.trim() : undefined,
    });
    const token = generateToken(user._id);

    // Send Welcome notification asynchronously from Company WhatsApp & Company Email
    enqueueJob("SEND_SYSTEM_WHATSAPP", {
      phone: cleanWa,
      message: `*Welcome to BillingApp!*\n\nHi ${user.name}, your store *${user.businessName}* is now registered.\n\nLink your own store WhatsApp anytime inside Settings → WhatsApp 24/7 to send bills automatically to your customers!`,
    }).catch(() => {});
    if (user.email && isSesConfigured()) {
      enqueueJob("SEND_EMAIL", {
        to: user.email,
        subject: `Welcome to BillingApp — ${user.businessName}`,
        text: `Hi ${user.name}, your BillingApp store (${user.businessName}) is registered and ready!`,
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: "Business account registered successfully!",
      token,
      user: {
        _id: user._id,
        name: user.name,
        businessName: user.businessName,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        email: user.email,
        gstin: user.gstin,
        address: user.address,
        logo: user.logo,
        upiId: user.upiId,
        thermalPrinterSize: user.thermalPrinterSize,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { identifier, phone, password, otpCode } = req.body;
    const loginId = (identifier || phone || "").toString().trim();
    if (!loginId) {
      return res.status(400).json({
        success: false,
        message: "Phone, WhatsApp number, or Email is required",
      });
    }
    const isEmail = loginId.includes("@");
    const rawPhone = loginId.replace(/[^0-9]/g, "");
    const variants = rawPhone.length >= 10 ? getPhoneVariants(rawPhone) : [rawPhone];
    if (otpCode) {
      const otpLookupKeys = isEmail
        ? [loginId.toLowerCase(), ...variants].filter(Boolean)
        : variants;
      const otpDoc = await Otp.findOne({
        phone: { $in: otpLookupKeys },
        code: otpCode.toString().trim(),
      });
      if (!otpDoc || new Date() > otpDoc.expiresAt) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP code. Please request a new code.",
        });
      }
      await Otp.deleteOne({ _id: otpDoc._id });
      let user = isEmail
        ? await User.findOne({ email: loginId.toLowerCase() })
        : await User.findOne({
            $or: [
              { phone: { $in: variants } },
              { whatsappNumber: { $in: variants } },
            ],
          });
      if (!user && !isEmail) {
        const p10 = rawPhone.slice(-10);
        const salt = await bcrypt.genSalt(10);
        const defaultPassword = await bcrypt.hash(`wp_${p10}`, salt);
        user = await User.create({
          name: "Store Owner",
          businessName: "My Business",
          phone: p10,
          whatsappNumber: p10,
          password: defaultPassword,
        });
      }
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "No account found with this email address.",
        });
      }
      const token = generateToken(user._id);
      dispatchLoginNotifications(user).catch(() => {});
      return res.status(200).json({
        success: true,
        message: "WhatsApp login successful!",
        token,
        user: {
          _id: user._id,
          name: user.name,
          businessName: user.businessName,
          phone: user.phone,
          whatsappNumber: user.whatsappNumber,
          email: user.email,
          gstin: user.gstin,
          address: user.address,
          logo: user.logo,
          upiId: user.upiId,
          thermalPrinterSize: user.thermalPrinterSize,
          invoiceStyle: user.invoiceStyle,
          vipVisitThreshold: user.vipVisitThreshold || 3,
        },
      });
    }
    let user = null;
    if (isEmail) {
      user = await User.findOne({ email: loginId.toLowerCase() });
    } else {
      user = await User.findOne({
        $or: [
          { phone: { $in: variants } },
          { whatsappNumber: { $in: variants } },
        ],
      });
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No account found with this phone number or email",
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your password or use WhatsApp OTP login",
      });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password",
      });
    }
    const token = generateToken(user._id);
    dispatchLoginNotifications(user).catch(() => {});
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        _id: user._id,
        name: user.name,
        businessName: user.businessName,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        email: user.email,
        gstin: user.gstin,
        address: user.address,
        logo: user.logo,
        upiId: user.upiId,
        thermalPrinterSize: user.thermalPrinterSize,
        invoiceStyle: user.invoiceStyle,
        vipVisitThreshold: user.vipVisitThreshold || 3,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
});
router.get("/me", protect, async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});
router.put("/profile", protect, async (req, res) => {
  try {
    const {
      name,
      businessName,
      whatsappNumber,
      email,
      gstin,
      address,
      logo,
      upiId,
      thermalPrinterSize,
      invoiceStyle,
      vipVisitThreshold,
    } = req.body;

    const currentUser = await User.findById(req.user._id).select("-password");
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let safeEmailUpdate;
    if (email !== undefined) {
      const normalizedEmail = email.toString().trim().toLowerCase();
      const existingEmail = (currentUser.email || "").toLowerCase();
      if (normalizedEmail !== existingEmail) {
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message:
              "To change an existing email, use 'Change / Reset Email' in Account Security (requires password & OTP verification).",
          });
        }
        if (normalizedEmail) {
          if (!EMAIL_REGEX.test(normalizedEmail)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address" });
          }
          const dupEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user._id } })
            .select("_id")
            .lean();
          if (dupEmail) {
            return res.status(400).json({ success: false, message: "Email address is already in use" });
          }
          safeEmailUpdate = normalizedEmail;
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...(name && { name: name.trim() }),
        ...(businessName && { businessName: businessName.trim() }),
        ...(whatsappNumber && { whatsappNumber: whatsappNumber.trim() }),
        ...(safeEmailUpdate !== undefined && { email: safeEmailUpdate }),
        ...(gstin !== undefined && { gstin: gstin.trim().toUpperCase() }),
        ...(address !== undefined && { address: address.trim() }),
        ...(logo !== undefined && { logo }),
        ...(upiId !== undefined && { upiId: upiId.trim() }),
        ...(thermalPrinterSize && { thermalPrinterSize }),
        ...(invoiceStyle && { invoiceStyle }),
        ...(vipVisitThreshold !== undefined && { vipVisitThreshold: Number(vipVisitThreshold) || 3 }),
      },
      { new: true, runValidators: true }
    ).select("-password");
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const { identifier } = req.body;
    const rawId = (identifier || "").toString().trim();
    if (!rawId) {
      return res.status(400).json({
        success: false,
        message: "Please enter your registered mobile number or email",
      });
    }

    const sendBucket = `forgot_send:${rawId.toLowerCase()}`;
    const limit = checkRateLimit(sendBucket, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many reset attempts. Try again in ${limit.retryAfterSec}s.`,
      });
    }
    recordRateAttempt(sendBucket, 15 * 60 * 1000);

    const user = await findUserByIdentifier(rawId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found matching that phone number or email",
      });
    }

    const rawDigits = (user.whatsappNumber || user.phone || "").toString().replace(/[^0-9]/g, "");
    const cleanPhone = rawDigits.slice(-10);
    const targetEmail = (user.email || "").toString().trim().toLowerCase();

    const otpKey = `reset_pwd:${user._id}`;
    const code = generateSecureOtp();
    await Otp.deleteMany({ phone: otpKey });
    await Otp.create({
      phone: otpKey,
      code,
      channel: "whatsapp",
      verified: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const { sentViaWhatsApp, sentViaSms, sentViaEmail, channels } = await sendOtpChannels({
      cleanPhone,
      targetEmail,
      code,
      channel: "whatsapp",
      title: "BillingApp Password Reset",
      introText: "Your 6-digit password reset code is",
      smsText: `Your BillingApp password reset OTP is ${code}. Valid for 10 minutes. Ignore if not requested.`,
    });

    if (channels.length === 0) {
      await Otp.deleteMany({ phone: otpKey });
      return res.status(503).json({
        success: false,
        message:
          "Unable to deliver reset OTP right now (Company WhatsApp / Email not connected). Try Quick Login with WhatsApp or contact admin.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Password reset OTP sent to ${channels.join(" & ")}`,
      sentViaWhatsApp,
      sentViaSms,
      sentViaEmail,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to initiate password reset",
      error: error.message,
    });
  }
});

router.post("/forgot-password/verify", async (req, res) => {
  try {
    const { identifier, otpCode, newPassword } = req.body;
    if (!identifier || !otpCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Account identifier, OTP code, and new password are required",
      });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await findUserByIdentifier(identifier, true);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No matching account found",
      });
    }

    const verifyBucket = `forgot_verify:${user._id}`;
    const limit = checkRateLimit(verifyBucket, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many invalid attempts. Locked for ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
      });
    }

    const otpKey = `reset_pwd:${user._id}`;
    const otpDoc = await Otp.findOne({
      phone: otpKey,
      code: otpCode.toString().trim(),
    });

    if (!otpDoc) {
      const fails = recordRateAttempt(verifyBucket, 15 * 60 * 1000);
      if (fails >= 5) {
        await Otp.deleteMany({ phone: otpKey });
      }
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset OTP code",
      });
    }

    if (new Date() > otpDoc.expiresAt) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({
        success: false,
        message: "Reset OTP has expired. Please request a new one.",
      });
    }

    clearRateLimit(verifyBucket);
    await Otp.deleteMany({ phone: otpKey });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(newPassword), salt);
    await user.save();

    const targetPhone = user.whatsappNumber || user.phone;
    const alertTime = formatIstLoginTime();
    if (targetPhone) {
      enqueueJob("SEND_SYSTEM_WHATSAPP", {
        phone: targetPhone,
        message: `*BillingApp Security Alert*\n\nYour password for *${user.businessName || "your account"}* was reset on ${alertTime}.\nIf you did not do this, contact support immediately.`,
      }).catch(() => {});
    }
    if (user.email && isSesConfigured()) {
      enqueueJob("SEND_EMAIL", {
        to: user.email,
        subject: "BillingApp Security Alert: Password Reset",
        text: `Your BillingApp password was reset on ${alertTime}. If this was not you, secure your account immediately.`,
      }).catch(() => {});
    }

    const safeUser = user.toObject();
    delete safeUser.password;

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      token: generateToken(user._id),
      user: safeUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
      error: error.message,
    });
  }
});

router.post("/email-change/request", protect, async (req, res) => {
  try {
    const { currentPassword, newEmail } = req.body;
    const normalizedNewEmail = (newEmail || "").toString().trim().toLowerCase();

    if (!normalizedNewEmail || !EMAIL_REGEX.test(normalizedNewEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid new email address",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if ((user.email || "").toLowerCase() === normalizedNewEmail) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from your current email",
      });
    }

    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to change your email",
        });
      }
      const isMatch = await bcrypt.compare(String(currentPassword), user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Incorrect current password",
        });
      }
    }

    const existingOwner = await User.findOne({
      email: normalizedNewEmail,
      _id: { $ne: user._id },
    })
      .select("_id")
      .lean();
    if (existingOwner) {
      return res.status(400).json({
        success: false,
        message: "This email address is already registered to another account",
      });
    }

    const sendBucket = `email_chg_send:${user._id}`;
    const limit = checkRateLimit(sendBucket, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many email change requests. Try again in ${limit.retryAfterSec}s.`,
      });
    }
    recordRateAttempt(sendBucket, 15 * 60 * 1000);

    const otpKey = `email_chg:${user._id}:${normalizedNewEmail}`;
    const code = generateSecureOtp();
    await Otp.deleteMany({ phone: { $regex: `^email_chg:${user._id}:` } });
    await Otp.create({
      phone: otpKey,
      code,
      channel: "whatsapp",
      verified: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const rawDigits = (user.whatsappNumber || user.phone || "").toString().replace(/[^0-9]/g, "");
    const cleanPhone = rawDigits.slice(-10);

    const { sentViaWhatsApp, sentViaSms, sentViaEmail, channels } = await sendOtpChannels({
      cleanPhone,
      targetEmail: normalizedNewEmail,
      code,
      channel: "whatsapp",
      title: "BillingApp Email Change Verification",
      introText: `Confirm changing your store email to ${normalizedNewEmail}. Your 6-digit verification code is`,
      smsText: `BillingApp email change to ${normalizedNewEmail}. OTP: ${code}. Valid 10 mins.`,
    });

    if (channels.length === 0) {
      await Otp.deleteMany({ phone: otpKey });
      return res.status(503).json({
        success: false,
        message: "Unable to send verification OTP via Email or WhatsApp right now.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Verification code sent to ${channels.join(" & ")}`,
      sentViaWhatsApp,
      sentViaSms,
      sentViaEmail,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to request email change",
      error: error.message,
    });
  }
});

router.post("/email-change/confirm", protect, async (req, res) => {
  try {
    const { newEmail, otpCode } = req.body;
    const normalizedNewEmail = (newEmail || "").toString().trim().toLowerCase();

    if (!normalizedNewEmail || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "New email and 6-digit OTP code are required",
      });
    }

    const verifyBucket = `email_chg_verify:${req.user._id}`;
    const limit = checkRateLimit(verifyBucket, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many wrong OTP attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
      });
    }

    const otpKey = `email_chg:${req.user._id}:${normalizedNewEmail}`;
    const otpDoc = await Otp.findOne({
      phone: otpKey,
      code: otpCode.toString().trim(),
    });

    if (!otpDoc) {
      const fails = recordRateAttempt(verifyBucket, 15 * 60 * 1000);
      if (fails >= 5) {
        await Otp.deleteMany({ phone: otpKey });
      }
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code",
      });
    }

    if (new Date() > otpDoc.expiresAt) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({
        success: false,
        message: "Verification code expired. Please request a new one.",
      });
    }

    const duplicate = await User.findOne({
      email: normalizedNewEmail,
      _id: { $ne: req.user._id },
    })
      .select("_id")
      .lean();
    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Email is already registered to another account",
      });
    }

    clearRateLimit(verifyBucket);
    await Otp.deleteMany({ phone: otpKey });

    const user = await User.findById(req.user._id).select("-password");
    const oldEmail = user.email;
    user.email = normalizedNewEmail;
    await user.save();

    const alertTime = formatIstLoginTime();
    const targetPhone = user.whatsappNumber || user.phone;
    if (targetPhone) {
      enqueueJob("SEND_SYSTEM_WHATSAPP", {
        phone: targetPhone,
        message: `*BillingApp Security Alert*\n\nYour store email was changed to *${normalizedNewEmail}* on ${alertTime}.\nIf this wasn't you, contact support immediately.`,
      }).catch(() => {});
    }
    if (oldEmail && oldEmail !== normalizedNewEmail && isSesConfigured()) {
      enqueueJob("SEND_EMAIL", {
        to: oldEmail,
        subject: "BillingApp Security Alert: Email Address Changed",
        text: `Your BillingApp store email was changed from ${oldEmail} to ${normalizedNewEmail} on ${alertTime}. If this wasn't you, please contact support immediately.`,
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Email address verified and updated successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to verify email change",
      error: error.message,
    });
  }
});

router.post("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required",
        });
      }
      const isMatch = await bcrypt.compare(String(currentPassword), user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Incorrect current password",
        });
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(newPassword), salt);
    await user.save();

    const alertTime = formatIstLoginTime();
    const targetPhone = user.whatsappNumber || user.phone;
    if (targetPhone) {
      enqueueJob("SEND_SYSTEM_WHATSAPP", {
        phone: targetPhone,
        message: `*BillingApp Security Alert*\n\nYour password for *${user.businessName || "your account"}* was updated on ${alertTime}.`,
      }).catch(() => {});
    }
    if (user.email && isSesConfigured()) {
      enqueueJob("SEND_EMAIL", {
        to: user.email,
        subject: "BillingApp Security Alert: Password Changed",
        text: `Your BillingApp account password was updated on ${alertTime}.`,
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update password",
      error: error.message,
    });
  }
});
export default router;