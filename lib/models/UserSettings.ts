import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserSettings extends Document {
  userId: string;
  liquidCash: number;
  monthlyBurnRate: number;
  fixedExpenses: number;
  estimatedTaxRate: number;
  irsMileageDeduction: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSettingsSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    liquidCash: {
      type: Number,
      default: 0,
    },
    monthlyBurnRate: {
      type: Number,
      default: 0,
    },
    fixedExpenses: {
      type: Number,
      default: 0,
    },
    estimatedTaxRate: {
      type: Number,
      default: 0,
    },
    irsMileageDeduction: {
      type: Number,
      default: 0.67,
    },
  },
  {
    timestamps: true,
  }
);

const UserSettings: Model<IUserSettings> =
  mongoose.models.UserSettings || mongoose.model<IUserSettings>("UserSettings", UserSettingsSchema);

export default UserSettings;


