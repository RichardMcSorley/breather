import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIOUPayment extends Document {
  userId: string;
  iouId: string;
  personName: string;
  amount: number;
  paymentDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const IOUPaymentSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    iouId: {
      type: Schema.Types.ObjectId,
      ref: "IOU",
      required: true,
    },
    personName: {
      type: String,
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

IOUPaymentSchema.index({ userId: 1, paymentDate: -1 });
IOUPaymentSchema.index({ userId: 1, personName: 1 });
IOUPaymentSchema.index({ iouId: 1 });

const IOUPayment: Model<IIOUPayment> =
  mongoose.models.IOUPayment || mongoose.model<IIOUPayment>("IOUPayment", IOUPaymentSchema);

export default IOUPayment;
