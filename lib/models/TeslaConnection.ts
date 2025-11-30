import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITeslaConnection extends Document {
  userId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  vehicleTag: string;
  vehicleName: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TeslaConnectionSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    encryptedAccessToken: {
      type: String,
      required: true,
    },
    encryptedRefreshToken: {
      type: String,
      required: true,
    },
    vehicleTag: {
      type: String,
      required: true,
    },
    vehicleName: {
      type: String,
      required: true,
    },
    lastSyncedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

TeslaConnectionSchema.index({ userId: 1 });

const TeslaConnection: Model<ITeslaConnection> =
  mongoose.models.TeslaConnection || mongoose.model<ITeslaConnection>("TeslaConnection", TeslaConnectionSchema);

export default TeslaConnection;

