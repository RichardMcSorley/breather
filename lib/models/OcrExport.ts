import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOcrExport extends Document {
  entryId: string;
  userId: string;
  appName?: string;
  customerName: string;
  customerAddress: string;
  rawResponse?: string;
  lat?: number;
  lon?: number;
  geocodeDisplayName?: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OcrExportSchema: Schema = new Schema(
  {
    entryId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    appName: {
      type: String,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerAddress: {
      type: String,
      required: true,
    },
    rawResponse: {
      type: String,
    },
    lat: {
      type: Number,
    },
    lon: {
      type: Number,
    },
    geocodeDisplayName: {
      type: String,
    },
    processedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

OcrExportSchema.index({ userId: 1, processedAt: -1 });
OcrExportSchema.index({ entryId: 1 }, { unique: true });

const OcrExport: Model<IOcrExport> =
  mongoose.models.OcrExport ||
  mongoose.model<IOcrExport>("OcrExport", OcrExportSchema);

export default OcrExport;


