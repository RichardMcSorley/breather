import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOcrText extends Document {
  userId: string;
  ocrText: string;
  screenshot?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OcrTextSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    ocrText: {
      type: String,
      required: true,
    },
    screenshot: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

OcrTextSchema.index({ userId: 1, createdAt: -1 });

const OcrText: Model<IOcrText> =
  mongoose.models.OcrText || mongoose.model<IOcrText>("OcrText", OcrTextSchema);

export default OcrText;

