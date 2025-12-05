import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStreetViewCache extends Document {
  location: string; // Address string or "lat,lon" coordinates
  address?: string; // Optional address if provided
  lat?: number; // Optional latitude if coordinates provided
  lon?: number; // Optional longitude if coordinates provided
  width: number; // Image width
  height: number; // Image height
  url: string; // The generated Street View URL
  expiresAt: Date; // For TTL index
  createdAt: Date;
  updatedAt: Date;
}

const StreetViewCacheSchema: Schema = new Schema(
  {
    location: {
      type: String,
      required: true,
      index: true,
    },
    address: {
      type: String,
    },
    lat: {
      type: Number,
    },
    lon: {
      type: Number,
    },
    width: {
      type: Number,
      required: true,
      default: 300,
    },
    height: {
      type: Number,
      required: true,
      default: 200,
    },
    url: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for efficient cache lookups
StreetViewCacheSchema.index({ location: 1, width: 1, height: 1 });

// TTL index to automatically delete documents older than 30 days
StreetViewCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const StreetViewCache: Model<IStreetViewCache> =
  mongoose.models.StreetViewCache ||
  mongoose.model<IStreetViewCache>("StreetViewCache", StreetViewCacheSchema);

export default StreetViewCache;

