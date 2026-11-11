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
router.post("/send-otp", async (req, res) => {
  try {
    const { phone, channel = "whatsapp" } = req.body;
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone or WhatsApp number is required",
      });
    }
    const raw = phone.toString().trim().replace(/[^0-9]/g, "");
    const cleanPhone = raw.slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number",
      });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const variants = getPhoneVariants(cleanPhone);
    await Otp.deleteMany({ phone: { $in: variants } });
    await Otp.create({
      phone: cleanPhone,
      code,
      channel,
      verified: false,
      expiresAt,
    });
    let sentViaWhatsApp = false;
    let sentViaSms = false;
    let sentViaEmail = false;
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
    if (channel === "email" && req.body.email && isSesConfigured()) {
      const emailRes = await sendEmailViaSes({
        to: req.body.email,
        subject: "Billing App Login OTP",
        text: `Your 6-digit login OTP is: ${code}. Valid for 10 minutes.`,
      }).catch(() => null);
      if (emailRes?.sent) sentViaEmail = true;
    }
    return res.status(200).json({
      success: true,
      message: sentViaWhatsApp
        ? `OTP code sent to your WhatsApp (+91 ${cleanPhone})`
        : sentViaSms
        ? `OTP code sent via SMS (+91 ${cleanPhone})`
        : `Verification code generated for +91 ${cleanPhone}`,
      code,
      phone: cleanPhone,
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
      const otpDoc = await Otp.findOne({
        phone: { $in: variants },
        code: otpCode.toString().trim(),
      });
      if (!otpDoc || new Date() > otpDoc.expiresAt) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP code. Please request a new code.",
        });
      }
      await Otp.deleteOne({ _id: otpDoc._id });
      let user = await User.findOne({
        $or: [
          { phone: { $in: variants } },
          { whatsappNumber: { $in: variants } },
        ],
      });
      if (!user) {
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
      const token = generateToken(user._id);
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