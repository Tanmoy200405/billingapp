import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
  },
  name: {
    type: String,
    required: true,
  },
  barcode: String,
  sellingPrice: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0.01,
  },
  unit: {
    type: String,
    default: "PCS",
  },
  taxRate: {
    type: Number,
    default: 0,
  },
  discountPercent: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  },
});

const invoiceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      index: true,
    },
    partyName: {
      type: String,
      default: "Cash Customer",
      trim: true,
    },
    partyPhone: {
      type: String,
      trim: true,
    },
    isRegularCustomer: {
      type: Boolean,
      default: false,
    },
    items: [invoiceItemSchema],
    regularDiscountAppliedPercent: {
      type: Number,
      default: 0,
    },
    regularDiscountAmount: {
      type: Number,
      default: 0,
    },
    freebieItemGiven: {
      type: String,
      default: "",
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    taxTotal: {
      type: Number,
      default: 0,
    },
    discountTotal: {
      type: Number,
      default: 0,
    },
    roundOff: {
      type: Number,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    paymentMode: {
      type: String,
      enum: ["CASH", "UPI", "UPI/CASH", "BANK", "CHEQUE", "CREDIT"],
      default: "CASH",
      index: true,
    },
    cashAmount: {
      type: Number,
      default: 0,
    },
    upiAmount: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["PAID", "PARTIAL", "UNPAID"],
      default: "PAID",
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    whatsappSent: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ userId: 1, invoiceDate: -1 });
invoiceSchema.index({ userId: 1, invoiceNumber: 1 });
invoiceSchema.index({ userId: 1, paymentMode: 1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;
