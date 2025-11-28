import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDeliveryOrder extends Document {
  entryId: string;
  userId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  time: string;
  rawResponse?: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryOrderSchema: Schema = new Schema(
  {
    entryId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    appName: {
      type: String,
      required: true,
    },
    miles: {
      type: Number,
      required: true,
    },
    money: {
      type: Number,
      required: true,
    },
    milesToMoneyRatio: {
      type: Number,
      required: true,
    },
    restaurantName: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    rawResponse: {
      type: String,
    },
    processedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

DeliveryOrderSchema.index({ userId: 1, processedAt: -1 });
DeliveryOrderSchema.index({ entryId: 1 }, { unique: true });

const DeliveryOrder: Model<IDeliveryOrder> =
  mongoose.models.DeliveryOrder ||
  mongoose.model<IDeliveryOrder>("DeliveryOrder", DeliveryOrderSchema);

export default DeliveryOrder;

