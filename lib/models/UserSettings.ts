import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserSettings extends Document {
  userId: string;
  irsMileageDeduction: number;
  incomeSourceTags?: string[];
  expenseSourceTags?: string[];
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
    irsMileageDeduction: {
      type: Number,
      default: 0.70,
    },
    incomeSourceTags: {
      type: [String],
      default: function() {
        return [];
      },
    },
    expenseSourceTags: {
      type: [String],
      default: function() {
        return [];
      },
    },
  },
  {
    timestamps: true,
  }
);

const UserSettings: Model<IUserSettings> =
  mongoose.models.UserSettings || mongoose.model<IUserSettings>("UserSettings", UserSettingsSchema);

export default UserSettings;


