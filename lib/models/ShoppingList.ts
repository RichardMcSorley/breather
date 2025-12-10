import mongoose, { Schema, Document, Model } from "mongoose";

export interface IKrogerAisleLocation {
  aisleNumber?: string;
  shelfNumber?: string;
  side?: string; // L or R
  description?: string;
  bayNumber?: string;
}

export interface IKrogerImageSize {
  size: string;
  url: string;
}

export interface IKrogerImage {
  perspective?: string;
  default?: boolean;
  sizes: IKrogerImageSize[];
}

export interface IShoppingListItem {
  searchTerm: string; // Simplified search term for Kroger
  productName: string; // Full product name from screenshot
  customer?: string; // Customer badge (A, B, C)
  app?: string; // App name: "Instacart" or "DoorDash"
  quantity?: string; // Quantity from screenshot (e.g., "1 ct")
  aisleLocation?: string; // Aisle location from screenshot
  screenshotId?: string; // Reference to the screenshot this item came from
  croppedImage?: string; // Base64 cropped image from moondream detection
  // Kroger product data
  productId?: string;
  upc?: string;
  brand?: string;
  description?: string;
  size?: string;
  price?: number;
  promoPrice?: number;
  stockLevel?: string; // HIGH, LOW, TEMPORARILY_OUT_OF_STOCK
  imageUrl?: string;
  images?: IKrogerImage[]; // All product images
  krogerAisles?: IKrogerAisleLocation[]; // All Kroger aisle locations
  productPageURI?: string;
  categories?: string[];
  found: boolean; // Whether Kroger search found a match
  done?: boolean; // Whether item has been scanned and completed
  problem?: boolean; // Whether item has a problem and needs attention
}

export interface IShoppingListScreenshot {
  id: string; // Unique identifier for the screenshot
  base64: string; // Base64 encoded image data
  uploadedAt: Date; // When the screenshot was uploaded
  app?: string; // App name (Instacart/DoorDash)
  customers?: string[]; // Customer badges in the screenshot
}

export interface IShoppingList extends Document {
  userId: string;
  name: string;
  locationId: string;
  items: IShoppingListItem[];
  screenshots?: IShoppingListScreenshot[]; // Array of screenshots associated with this list
  sharedWith?: string[]; // Array of user IDs who have access (deprecated, use sharedItems)
  sharedItemIndices?: number[]; // Array of item indices that are shared (deprecated, use sharedItems)
  sharedItems?: Map<string, number[]> | { [userId: string]: number[] }; // Map of userId to array of item indices that are shared with that user
  createdAt: Date;
  updatedAt: Date;
}

const KrogerAisleLocationSchema = new Schema({
  aisleNumber: String,
  shelfNumber: String,
  side: String,
  description: String,
  bayNumber: String,
}, { _id: false });

const KrogerImageSizeSchema = new Schema({
  size: String,
  url: String,
}, { _id: false });

const KrogerImageSchema = new Schema({
  perspective: String,
  default: Boolean,
  sizes: [KrogerImageSizeSchema],
}, { _id: false });

const ShoppingListScreenshotSchema = new Schema({
  id: {
    type: String,
    required: true,
  },
  base64: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  app: String,
  customers: [String],
}, { _id: false });

const ShoppingListItemSchema = new Schema({
  searchTerm: {
    type: String,
    required: true,
  },
  productName: {
    type: String,
    required: true,
  },
  customer: String,
  app: String, // "Instacart" or "DoorDash"
  quantity: String,
  aisleLocation: String,
  screenshotId: String, // Reference to screenshot
  croppedImage: String, // Base64 cropped image from moondream
  // Kroger product data
  productId: String,
  upc: String,
  brand: String,
  description: String,
  size: String,
  price: Number,
  promoPrice: Number,
  stockLevel: String,
  imageUrl: String,
  images: [KrogerImageSchema],
  krogerAisles: [KrogerAisleLocationSchema],
  productPageURI: String,
  categories: [String],
  found: {
    type: Boolean,
    default: false,
  },
  done: {
    type: Boolean,
    default: false,
  },
  problem: {
    type: Boolean,
    default: false,
  },
});

const ShoppingListSchema: Schema = new Schema(
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
    locationId: {
      type: String,
      required: true,
    },
    items: [ShoppingListItemSchema],
    sharedWith: {
      type: [String],
      default: [],
      index: true,
    },
    sharedItemIndices: {
      type: [Number],
      default: [],
    },
    sharedItems: {
      type: Map,
      of: [Number],
      default: {},
    },
    screenshots: {
      type: [ShoppingListScreenshotSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

ShoppingListSchema.index({ userId: 1, createdAt: -1 });
ShoppingListSchema.index({ sharedWith: 1, createdAt: -1 });

const ShoppingList: Model<IShoppingList> =
  mongoose.models.ShoppingList || mongoose.model<IShoppingList>("ShoppingList", ShoppingListSchema);

export default ShoppingList;
