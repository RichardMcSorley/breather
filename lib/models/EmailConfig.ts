import mongoose, { Schema, Document, Model } from "mongoose";

export interface IEmailConfig extends Document {
  userId: string;
  email: string;
  imapHost: string;
  imapPort: number;
  username: string;
  encryptedPassword: string;
  isActive: boolean;
  lastSyncAt?: Date;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailConfigSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
    },
    imapHost: {
      type: String,
      required: true,
      default: "127.0.0.1", // Proton Mail Bridge default
    },
    imapPort: {
      type: Number,
      required: true,
      default: 1143, // Proton Mail Bridge default
    },
    username: {
      type: String,
      required: true,
    },
    encryptedPassword: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSyncAt: {
      type: Date,
    },
    lastSyncStatus: {
      type: String,
      enum: ["success", "error"],
    },
    lastSyncError: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const EmailConfig: Model<IEmailConfig> =
  mongoose.models.EmailConfig || mongoose.model<IEmailConfig>("EmailConfig", EmailConfigSchema);

export default EmailConfig;
