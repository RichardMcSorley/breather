import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBillPayment extends Document {
  userId: string;
  billId: string;
  amount: number;
  paymentDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillPaymentSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    billId: {
      type: Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      index: true,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

BillPaymentSchema.index({ userId: 1, paymentDate: -1 });
BillPaymentSchema.index({ billId: 1 });

const BillPayment: Model<IBillPayment> =
  mongoose.models.BillPayment || mongoose.model<IBillPayment>("BillPayment", BillPaymentSchema);

export default BillPayment;

