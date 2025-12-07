import mongoose, { Schema, Document, Model } from "mongoose";

export interface IKrogerCache extends Document {
  cacheKey: string;
  cacheType: "search" | "product";
  data: any;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KrogerCacheSchema: Schema = new Schema(
  {
    cacheKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cacheType: {
      type: String,
      enum: ["search", "product"],
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient cleanup of expired entries
KrogerCacheSchema.index({ expiresAt: 1 });
KrogerCacheSchema.index({ cacheType: 1, cacheKey: 1 });

const KrogerCache: Model<IKrogerCache> =
  mongoose.models.KrogerCache || mongoose.model<IKrogerCache>("KrogerCache", KrogerCacheSchema);

export default KrogerCache;
