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
  quantity?: string; // Quantity from screenshot (e.g., "1 ct")
  aisleLocation?: string; // Aisle location from screenshot
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
}

export interface IShoppingList extends Document {
  userId: string;
  name: string;
  locationId: string;
  items: IShoppingListItem[];
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
  quantity: String,
  aisleLocation: String,
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
  },
  {
    timestamps: true,
  }
);

ShoppingListSchema.index({ userId: 1, createdAt: -1 });

const ShoppingList: Model<IShoppingList> =
  mongoose.models.ShoppingList || mongoose.model<IShoppingList>("ShoppingList", ShoppingListSchema);

export default ShoppingList;
