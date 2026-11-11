import mongoose from "mongoose";

const WhatsAppSessionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    userId: { type: String, index: true },
    fileName: { type: String },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

WhatsAppSessionSchema.index({ userId: 1, fileName: 1 });

export default mongoose.model("WhatsAppSession", WhatsAppSessionSchema);
