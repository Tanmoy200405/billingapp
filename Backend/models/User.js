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
    showGoogleMapOnBill: {
      type: Boolean,
      default: true,
    },
    fssaiNumber: {
      type: String,
      trim: true,
      default: "",
    },
    printRestaurantLogo: {
      type: Boolean,
      default: true,
    },
    showDynamicUpiQr: {
      type: Boolean,
      default: true,
    },
    billFooterMessage: {
      type: String,
      default: "Thank you for dining with us! Visit again.",
    },
    defaultServiceTaxRate: {
      type: Number,
      default: 0,
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
    vipSchemeEnabled: {
      type: Boolean,
      default: true,
    },
    vipVisitThreshold: {
      type: Number,
      default: 3,
    },
    vipOffer: {
      enabled: { type: Boolean, default: true },
      discountPercent: { type: Number, default: 10 },
      freebieItem: { type: String, default: "" },
      minBillAmount: { type: Number, default: 0 },
      customMessage: { type: String, default: "Special VIP Diner Club Offer" },
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