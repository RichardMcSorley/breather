import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMileage extends Document {
  userId: string;
  odometer: number;
  date: Date;
  classification: "work" | "personal";
  carId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MileageSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    odometer: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    classification: {
      type: String,
      enum: ["work", "personal"],
      default: "work",
      required: true,
    },
    carId: {
      type: String,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

MileageSchema.index({ userId: 1, date: -1 });

const Mileage: Model<IMileage> =
  mongoose.models.Mileage || mongoose.model<IMileage>("Mileage", MileageSchema);

export default Mileage;

