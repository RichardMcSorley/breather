import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOcrExport extends Document {
  entryId: string;
  userId: string;
  appName?: string;
  customerName: string;
  customerAddress: string;
  screenshot?: string;
  userLatitude?: number;
  userLongitude?: number;
  userAltitude?: number;
  userAddress?: string;
  rawResponse?: string;
  metadata?: Record<string, any>;
  lat?: number;
  lon?: number;
  geocodeDisplayName?: string;
  linkedTransactionIds?: mongoose.Types.ObjectId[];
  linkedDeliveryOrderIds?: mongoose.Types.ObjectId[];
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OcrExportSchema: Schema = new Schema(
  {
    entryId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
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
    screenshot: {
      type: String,
    },
    userLatitude: {
      type: Number,
    },
    userLongitude: {
      type: Number,
    },
    userAltitude: {
      type: Number,
    },
    userAddress: {
      type: String,
    },
    rawResponse: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
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
    linkedTransactionIds: [{
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    }],
    linkedDeliveryOrderIds: [{
      type: Schema.Types.ObjectId,
      ref: "DeliveryOrder",
    }],
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


