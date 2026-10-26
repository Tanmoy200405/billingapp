import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
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
    barcode: {
      type: String,
      trim: true,
      index: true,
    },
    hsnCode: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
      index: true,
    },
    costPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      default: "PCS",
      enum: ["PCS", "KG", "GM", "LTR", "ML", "BOX", "PACK", "MTR", "DOZEN"],
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    imageUrl: {
      type: String,
    },
  },
  { timestamps: true }
);

itemSchema.index({ userId: 1, barcode: 1 });
itemSchema.index({ userId: 1, name: 1 });
itemSchema.index({ userId: 1, category: 1 });

const Item = mongoose.model("Item", itemSchema);
export default Item;
