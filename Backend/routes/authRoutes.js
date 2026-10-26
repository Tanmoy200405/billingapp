import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Otp from "../models/Otp.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

router.post("/send-otp", async (req, res) => {
  try {
    const { phone, channel = "whatsapp" } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone or WhatsApp number is required",
      });
    }

    const cleanPhone = phone.toString().trim().replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit phone number",
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { phone: cleanPhone },
      { code, channel, verified: false, expiresAt },
      { upsert: true, new: true }
    );

    console.log(`[OTP SERVICE] Code for ${cleanPhone} via ${channel}: ${code}`);

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${cleanPhone} via ${channel}`,
      code,
      phone: cleanPhone,
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

    const cleanPhone = phone.toString().trim().replace(/[^0-9]/g, "");
    const otpDoc = await Otp.findOne({
      phone: cleanPhone,
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

    otpDoc.verified = true;
    await otpDoc.save();

    const existingUser = await User.findOne({
      $or: [{ phone: cleanPhone }, { whatsappNumber: cleanPhone }],
    }).select("-password");

    if (existingUser) {
      const token = generateToken(existingUser._id);
      return res.status(200).json({
        success: true,
        message: "OTP verified successfully. Logged in!",
        isNewUser: false,
        token,
        user: existingUser,
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified. Proceed to register account.",
      isNewUser: true,
      phone: cleanPhone,
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

    const cleanPhone = phone.toString().trim().replace(/[^0-9]/g, "");

    const userExists = await User.findOne({ phone: cleanPhone });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "An account with this phone number already exists. Please login.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      businessName: businessName.trim(),
      phone: cleanPhone,
      whatsappNumber: whatsappNumber
        ? whatsappNumber.toString().trim().replace(/[^0-9]/g, "")
        : cleanPhone,
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

    const cleanPhone = loginId.replace(/[^0-9]/g, "");

    const user = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { whatsappNumber: cleanPhone },
        { email: loginId.toLowerCase() },
      ],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No account found with this phone number or email",
      });
    }

    if (otpCode) {
      const otpDoc = await Otp.findOne({
        phone: cleanPhone,
        code: otpCode.toString().trim(),
      });
      if (!otpDoc || new Date() > otpDoc.expiresAt) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP code",
        });
      }
      await Otp.deleteOne({ _id: otpDoc._id });
    } else if (password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Incorrect password",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Please provide either password or OTP code",
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
