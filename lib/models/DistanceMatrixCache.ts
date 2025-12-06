import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDistanceMatrixCache extends Document {
  originLat: number;
  originLon: number;
  destinationLat: number;
  destinationLon: number;
  distanceMeters: number;
  distanceMiles: number;
  durationSeconds: number;
  durationText: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DistanceMatrixCacheSchema: Schema = new Schema(
  {
    originLat: {
      type: Number,
      required: true,
      index: true,
    },
    originLon: {
      type: Number,
      required: true,
      index: true,
    },
    destinationLat: {
      type: Number,
      required: true,
      index: true,
    },
    destinationLon: {
      type: Number,
      required: true,
      index: true,
    },
    distanceMeters: {
      type: Number,
      required: true,
    },
    distanceMiles: {
      type: Number,
      required: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
    },
    durationText: {
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
DistanceMatrixCacheSchema.index({ originLat: 1, originLon: 1, destinationLat: 1, destinationLon: 1 });

// TTL index to automatically delete documents older than 30 days
DistanceMatrixCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DistanceMatrixCache: Model<IDistanceMatrixCache> =
  mongoose.models.DistanceMatrixCache ||
  mongoose.model<IDistanceMatrixCache>("DistanceMatrixCache", DistanceMatrixCacheSchema);

export default DistanceMatrixCache;
