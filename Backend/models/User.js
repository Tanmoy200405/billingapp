import mongoose from "mongoose";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
      default: "My Business",
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
    },
    upiId: {
      type: String,
      trim: true,
    },
    businessType: {
      type: String,
      enum: ["restaurant", "salon", "retail", "general"],
      default: "restaurant",
    },
    googleMapLocation: {
      type: String,
      trim: true,
      default: "",
    },
    thermalPrinterSize: {
      type: String,
      enum: ["2inch", "3inch", "A4", "A5"],
      default: "3inch",
    },
    invoiceStyle: {
      type: String,
      default: "modern_zudio",
    },
    whatsappLinked: {
      type: Boolean,
      default: false,
    },
    whatsappLinkedNumber: {
      type: String,
      trim: true,
    },
    vipVisitThreshold: {
      type: Number,
      default: 3,
    },
    aggregatorConfig: {
      enabled: { type: Boolean, default: false },
      outletId: { type: String, trim: true, default: "" },
      webhookSecret: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true }
);
userSchema.index({ whatsappNumber: 1 });
const User = mongoose.model("User", userSchema);
export default User;