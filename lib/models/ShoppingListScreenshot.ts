import mongoose, { Schema, Document, Model } from "mongoose";

export interface IShoppingListScreenshot extends Document {
  shoppingListId: string; // Reference to the shopping list
  screenshotId: string; // Unique identifier for the screenshot (UUID)
  base64: string; // Base64 encoded image data
  uploadedAt: Date; // When the screenshot was uploaded
  app?: string; // App name (Instacart/DoorDash)
  customers?: string[]; // Customer badges in the screenshot
}

const ShoppingListScreenshotSchema: Schema = new Schema(
  {
    shoppingListId: {
      type: String,
      required: true,
      index: true, // Index for fast lookups
    },
    screenshotId: {
      type: String,
      required: true,
      unique: true,
      index: true, // Index for fast lookups by screenshotId
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
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
ShoppingListScreenshotSchema.index({ shoppingListId: 1, screenshotId: 1 });

const ShoppingListScreenshot: Model<IShoppingListScreenshot> =
  mongoose.models.ShoppingListScreenshot || mongoose.model<IShoppingListScreenshot>("ShoppingListScreenshot", ShoppingListScreenshotSchema);

export default ShoppingListScreenshot;
