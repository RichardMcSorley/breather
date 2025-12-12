import mongoose, { Schema, Document, Model } from "mongoose";

export interface IShoppingListItemCroppedImage extends Document {
  shoppingListId: string; // Reference to the shopping list
  itemIndex: number; // Index of the item in the shopping list
  base64: string; // Base64 encoded cropped image data
  uploadedAt: Date; // When the cropped image was created
  // Bounding box coordinates from moondream (normalized 0-1)
  xMin?: number;
  yMin?: number;
  xMax?: number;
  yMax?: number;
}

const ShoppingListItemCroppedImageSchema: Schema = new Schema(
  {
    shoppingListId: {
      type: String,
      required: true,
      index: true, // Index for fast lookups
    },
    itemIndex: {
      type: Number,
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
    // Bounding box coordinates from moondream (normalized 0-1)
    xMin: {
      type: Number,
      required: false,
    },
    yMin: {
      type: Number,
      required: false,
    },
    xMax: {
      type: Number,
      required: false,
    },
    yMax: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
ShoppingListItemCroppedImageSchema.index({ shoppingListId: 1, itemIndex: 1 }, { unique: true });

const ShoppingListItemCroppedImage: Model<IShoppingListItemCroppedImage> =
  mongoose.models.ShoppingListItemCroppedImage || mongoose.model<IShoppingListItemCroppedImage>("ShoppingListItemCroppedImage", ShoppingListItemCroppedImageSchema);

export default ShoppingListItemCroppedImage;
