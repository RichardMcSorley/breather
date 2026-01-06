import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDailyRateAgreement extends Document {
  userId: string;
  personName: string;
  dailyRate: number;
  startDate: Date;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyRateAgreementSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    personName: {
      type: String,
      required: true,
    },
    dailyRate: {
      type: Number,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

DailyRateAgreementSchema.index({ userId: 1, isActive: 1 });
DailyRateAgreementSchema.index({ userId: 1, personName: 1 });

const DailyRateAgreement: Model<IDailyRateAgreement> =
  mongoose.models.DailyRateAgreement || mongoose.model<IDailyRateAgreement>("DailyRateAgreement", DailyRateAgreementSchema);

export default DailyRateAgreement;
