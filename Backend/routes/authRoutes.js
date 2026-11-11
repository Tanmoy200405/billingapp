import express from "express";
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
    const { phone, identifier, email, channel = "whatsapp" } = req.body;
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

    if (cleanPhone.length !== 10 && !targetEmail) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number or registered email address",
      });
    }

    const otpKey = cleanPhone.length === 10 ? cleanPhone : targetEmail;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
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

    let sentViaWhatsApp = false;
    let sentViaSms = false;
    let sentViaEmail = false;

    if (cleanPhone.length === 10) {
      try {
        const fullNumber = `91${cleanPhone}`;
        const waMsg = `*Billing App Verification Code*\n\nYour 6-digit login OTP is: *${code}*\n\nValid for 10 minutes. Do not share this code with anyone.`;
        const waRes = await sendSystemWhatsAppMessage(fullNumber, waMsg);
        if (waRes && waRes.success) {
          sentViaWhatsApp = true;
        }
      } catch {}

      if ((!sentViaWhatsApp || channel === "sms") && isSnsSmsEnabled()) {
        await enqueueJob("SEND_SMS", {
          phone: cleanPhone,
          message: `Your Billing App login OTP is ${code}. Valid for 10 minutes. Do not share.`,
        });
        sentViaSms = true;
      }
    }

    if (targetEmail && isSesConfigured()) {
      const emailRes = await sendEmailViaSes({
        to: targetEmail,
        subject: "BillingApp Login Verification Code (OTP)",
        text: `Your 6-digit BillingApp login OTP is: ${code}. Valid for 10 minutes. Do not share this code.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
            <h2 style="color: #2563EB; margin-top: 0;">BillingApp Login OTP</h2>
            <p style="color: #334155;">Use this 6-digit verification code to sign in:</p>
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
    if (sentViaWhatsApp) channels.push(`WhatsApp (+91 ${cleanPhone})`);
    if (sentViaSms) channels.push(`SMS (+91 ${cleanPhone})`);
    if (sentViaEmail) channels.push(`Email (${targetEmail})`);

    return res.status(200).json({
      success: true,
      message: channels.length
        ? `OTP code sent to your ${channels.join(" & ")}`
        : `Verification code generated for ${cleanPhone ? `+91 ${cleanPhone}` : targetEmail}`,
      code,
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
    const otpDoc = await Otp.findOne({
      phone: { $in: variants },
      code: code.toString().trim(),
    });
    if (!otpDoc) {
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
    const userExists = await User.findOne({
      $or: [{ phone: { $in: variants } }, { whatsappNumber: { $in: variants } }],
    });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "An account with this phone number already exists. Please login.",
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
      email: email ? email.trim().toLowerCase() : undefined,
      password: hashedPassword,
      gstin: gstin ? gstin.trim().toUpperCase() : undefined,
      address: address ? address.trim() : undefined,
      upiId: upiId ? upiId.trim() : undefined,
    });
    const token = generateToken(user._id);
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
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...(name && { name: name.trim() }),
        ...(businessName && { businessName: businessName.trim() }),
        ...(whatsappNumber && { whatsappNumber: whatsappNumber.trim() }),
        ...(email !== undefined && { email: email.trim().toLowerCase() }),
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
export default router;