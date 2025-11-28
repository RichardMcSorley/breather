import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITransaction extends Document {
  userId: string;
  amount: number;
  type: "income" | "expense";
  date: Date;
  time: string;
  isBill: boolean;
  isBalanceAdjustment?: boolean;
  notes?: string;
  tag?: string;
  dueDate?: Date;
  linkedOcrExportIds?: mongoose.Types.ObjectId[];
  linkedDeliveryOrderIds?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    time: {
      type: String,
      required: true,
    },
    isBill: {
      type: Boolean,
      default: false,
    },
    isBalanceAdjustment: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },
    tag: {
      type: String,
    },
    dueDate: {
      type: Date,
    },
    linkedOcrExportIds: [{
      type: Schema.Types.ObjectId,
      ref: "OcrExport",
    }],
    linkedDeliveryOrderIds: [{
      type: Schema.Types.ObjectId,
      ref: "DeliveryOrder",
    }],
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ userId: 1, date: -1 });

const Transaction: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", TransactionSchema);

export default Transaction;


