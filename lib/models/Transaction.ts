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
  step?: string;
  active?: boolean;
  stepLog?: Array<{
    fromStep?: string;
    toStep: string;
    time: Date;
    restaurantIndex?: number; // -1 for main restaurant, 0+ for additional restaurants
    customerIndex?: number; // 0+ for customers
  }>;
  routeSegments?: Array<{
    fromLat: number;
    fromLon: number;
    toLat: number;
    toLon: number;
    distanceMiles?: number;
    durationText?: string;
    durationSeconds?: number;
    type: 'user-to-restaurant' | 'restaurant-to-restaurant' | 'restaurant-to-customer' | 'customer-to-customer';
    fromIndex: number;
    toIndex: number;
    orderId?: string;
    calculatedAt?: Date;
    segmentHash: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
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
    step: {
      type: String,
      default: "CREATED",
    },
    active: {
      type: Boolean,
      default: false,
    },
    stepLog: [{
      fromStep: String,
      toStep: {
        type: String,
        required: true,
      },
      time: {
        type: Date,
        required: true,
        default: Date.now,
      },
      restaurantIndex: Number, // -1 for main restaurant, 0+ for additional restaurants
      customerIndex: Number, // 0+ for customers
    }],
    routeSegments: [{
      fromLat: {
        type: Number,
        required: true,
      },
      fromLon: {
        type: Number,
        required: true,
      },
      toLat: {
        type: Number,
        required: true,
      },
      toLon: {
        type: Number,
        required: true,
      },
      distanceMiles: Number,
      durationText: String,
      durationSeconds: Number,
      type: {
        type: String,
        enum: ['user-to-restaurant', 'restaurant-to-restaurant', 'restaurant-to-customer', 'customer-to-customer'],
        required: true,
      },
      fromIndex: {
        type: Number,
        required: true,
      },
      toIndex: {
        type: Number,
        required: true,
      },
      orderId: String,
      calculatedAt: Date,
      segmentHash: {
        type: String,
        required: true,
      },
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


