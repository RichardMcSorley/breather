import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdditionalRestaurant {
  name: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lon?: number;
  screenshot?: string;
  extractedText?: string;
  userLatitude?: number;
  userLongitude?: number;
  userAltitude?: number;
  userAddress?: string;
}

export interface IDeliveryOrder extends Document {
  entryId: string;
  userId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  restaurantAddress?: string;
  restaurantPlaceId?: string;
  restaurantLat?: number;
  restaurantLon?: number;
  time?: string;
  screenshot?: string;
  userLatitude?: number;
  userLongitude?: number;
  userAltitude?: number;
  userAddress?: string;
  rawResponse?: string;
  metadata?: Record<string, any>;
  linkedTransactionIds?: mongoose.Types.ObjectId[];
  linkedOcrExportIds?: mongoose.Types.ObjectId[];
  step?: string;
  active?: boolean;
  additionalRestaurants?: IAdditionalRestaurant[];
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryOrderSchema: Schema = new Schema(
  {
    entryId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
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
    restaurantAddress: {
      type: String,
    },
    restaurantPlaceId: {
      type: String,
    },
    restaurantLat: {
      type: Number,
    },
    restaurantLon: {
      type: Number,
    },
    time: {
      type: String,
      required: false,
    },
    screenshot: {
      type: String,
    },
    userLatitude: {
      type: Number,
    },
    userLongitude: {
      type: Number,
    },
    userAltitude: {
      type: Number,
    },
    userAddress: {
      type: String,
    },
    rawResponse: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    processedAt: {
      type: Date,
      required: true,
    },
    linkedTransactionIds: [{
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    }],
    linkedOcrExportIds: [{
      type: Schema.Types.ObjectId,
      ref: "OcrExport",
    }],
    step: {
      type: String,
      default: "CREATED",
    },
    active: {
      type: Boolean,
      default: true,
    },
    additionalRestaurants: [{
      name: {
        type: String,
        required: true,
      },
      address: {
        type: String,
      },
      placeId: {
        type: String,
      },
      lat: {
        type: Number,
      },
      lon: {
        type: Number,
      },
      screenshot: {
        type: String,
      },
      extractedText: {
        type: String,
      },
      userLatitude: {
        type: Number,
      },
      userLongitude: {
        type: Number,
      },
      userAltitude: {
        type: Number,
      },
      userAddress: {
        type: String,
      },
    }],
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

