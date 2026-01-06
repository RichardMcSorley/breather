import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIOU extends Document {
  userId: string;
  personName: string;
  description: string;
  amount: number;
  date: Date;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const IOUSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    personName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    notes: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

IOUSchema.index({ userId: 1, isActive: 1 });
IOUSchema.index({ userId: 1, personName: 1 });

const IOU: Model<IIOU> = mongoose.models.IOU || mongoose.model<IIOU>("IOU", IOUSchema);

export default IOU;
