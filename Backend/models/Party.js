import mongoose from "mongoose";

const partySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["customer", "supplier"],
      default: "customer",
      index: true,
    },
    billingAddress: {
      type: String,
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    isRegular: {
      type: Boolean,
      default: false,
      index: true,
    },
    visitCount: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    lastVisitDate: {
      type: Date,
    },
    customDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    assignedFreebie: {
      type: String,
      trim: true,
      default: "",
    },
    loyaltyNotes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

partySchema.index({ userId: 1, phone: 1 });
partySchema.index({ userId: 1, type: 1, isRegular: 1 });
partySchema.index({ userId: 1, name: "text" });

const Party = mongoose.model("Party", partySchema);
export default Party;
