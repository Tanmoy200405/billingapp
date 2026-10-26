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
    thermalPrinterSize: {
      type: String,
      enum: ["2inch", "3inch", "A4", "A5"],
      default: "3inch",
    },
  },
  { timestamps: true }
);

userSchema.index({ whatsappNumber: 1 });

const User = mongoose.model("User", userSchema);
export default User;
