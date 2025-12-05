import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGooglePlacesCache extends Document {
  query: string;
  type?: string;
  lat?: number;
  lon?: number;
  radius?: number;
  results: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    lat: number;
    lng: number;
    types: string[];
    rating?: number;
    user_ratings_total?: number;
  }>;
  expiresAt: Date; // For TTL index
  createdAt: Date;
  updatedAt: Date;
}

const GooglePlacesCacheSchema: Schema = new Schema(
  {
    query: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      index: true,
    },
    lat: {
      type: Number,
    },
    lon: {
      type: Number,
    },
    radius: {
      type: Number,
    },
    results: {
      type: [
        {
          place_id: String,
          name: String,
          formatted_address: String,
          lat: Number,
          lng: Number,
          types: [String],
          rating: Number,
          user_ratings_total: Number,
        },
      ],
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
GooglePlacesCacheSchema.index({ query: 1, type: 1, lat: 1, lon: 1, radius: 1 });

// TTL index to automatically delete documents older than 30 days
GooglePlacesCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const GooglePlacesCache: Model<IGooglePlacesCache> =
  mongoose.models.GooglePlacesCache ||
  mongoose.model<IGooglePlacesCache>("GooglePlacesCache", GooglePlacesCacheSchema);

export default GooglePlacesCache;

