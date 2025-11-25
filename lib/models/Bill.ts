import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBill extends Document {
  userId: string;
  name: string;
  amount: number;
  dueDate: number; // Day of month (1-31)
  company?: string;
  category?: string;
  notes?: string;
  isActive: boolean;
  useInPlan: boolean;
  lastAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const BillSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Number,
      required: true,
      min: 1,
      max: 31,
    },
    company: {
      type: String,
    },
    category: {
      type: String,
    },
    notes: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    useInPlan: {
      type: Boolean,
      default: true,
    },
    lastAmount: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

BillSchema.index({ userId: 1, isActive: 1 });

const Bill: Model<IBill> = mongoose.models.Bill || mongoose.model<IBill>("Bill", BillSchema);

export default Bill;


