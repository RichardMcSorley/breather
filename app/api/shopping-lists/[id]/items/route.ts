import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import ShoppingListScreenshot from "@/lib/models/ShoppingListScreenshot";
import ShoppingListItemCroppedImage from "@/lib/models/ShoppingListItemCroppedImage";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";
import { krogerCache } from "@/lib/kroger-cache";

// Normalize base64 image (keep data URL prefix if present, as frontend expects it)
function normalizeScreenshot(base64: string): string {
  // Keep the data URL prefix if present, as the frontend expects it for img src
  return base64;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { items, screenshotId, screenshot, app, customers } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items array is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const shoppingList = await ShoppingList.findOne({
      _id: id,
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    const isOwner = shoppingList.userId === session.user.id;
    const isSharedUser = !isOwner && shoppingList.sharedWith?.includes(session.user.id);

    // Filter out duplicates: same productId, customer, and app
    // First, remove duplicates within the new items batch
    const seenInBatch = new Set<string>();
    const uniqueNewItems = (items as IShoppingListItem[]).filter((newItem) => {
      // Only check for duplicates if productId exists
      if (!newItem.productId) {
        return true; // Allow items without productId
      }

      // Create a unique key: productId + customer + app
      const key = `${newItem.productId}|${newItem.customer || ""}|${newItem.app || ""}`;
      
      if (seenInBatch.has(key)) {
        return false; // Duplicate within batch
      }
      
      seenInBatch.add(key);
      return true;
    });

    // Then, filter out items that already exist in the shopping list
    const newItems = uniqueNewItems.filter((newItem) => {
      // Only check for duplicates if productId exists
      if (!newItem.productId) {
        return true; // Allow items without productId
      }

      // Check if a duplicate exists in the existing list
      const isDuplicate = shoppingList.items.some((existingItem) => {
        return (
          existingItem.productId === newItem.productId &&
          existingItem.customer === newItem.customer &&
          existingItem.app === newItem.app
        );
      });

      return !isDuplicate;
    });

    // Save screenshot to separate collection if provided
    if (screenshotId && screenshot) {
      // Check if screenshot already exists in the separate collection
      const existingScreenshot = await ShoppingListScreenshot.findOne({ 
        shoppingListId: id,
        screenshotId: screenshotId 
      });
      
      if (!existingScreenshot) {
        // Normalize screenshot (keep data URL prefix as frontend expects it)
        const normalizedScreenshot = normalizeScreenshot(screenshot);
        
        // Save to separate collection
        await ShoppingListScreenshot.create({
          shoppingListId: id,
          screenshotId: screenshotId,
          base64: normalizedScreenshot,
          uploadedAt: new Date(),
          app: app,
          customers: customers || [],
        });
      }
    }

    // Add screenshotId to items if provided
    if (screenshotId && newItems.length > 0) {
      newItems.forEach(item => {
        item.screenshotId = screenshotId;
      });
    }

    // Extract and save cropped images to separate collection before adding items
    const shoppingListId = shoppingList._id.toString();
    const startIndex = shoppingList.items.length;
    const croppedImagePromises: Promise<any>[] = [];
    
    newItems.forEach((item: any, index: number) => {
      if (item.croppedImage) {
        const itemIndex = startIndex + index;
        croppedImagePromises.push(
          ShoppingListItemCroppedImage.findOneAndUpdate(
            { shoppingListId, itemIndex },
            {
              shoppingListId,
              itemIndex,
              base64: item.croppedImage,
              uploadedAt: new Date(),
            },
            { upsert: true, new: true }
          )
        );
        // Remove croppedImage from item before saving (it's now in separate collection)
        delete item.croppedImage;
      }
    });
    
    // Wait for all cropped images to be saved
    if (croppedImagePromises.length > 0) {
      await Promise.all(croppedImagePromises);
    }

    // Add new items to the existing list (only non-duplicates)
    shoppingList.items.push(...newItems);
    
    // If shared user adds items, automatically add new indices to sharedItemIndices
    if (isSharedUser && newItems.length > 0) {
      const currentIndices = shoppingList.sharedItemIndices || [];
      const newIndices = Array.from({ length: newItems.length }, (_, i) => startIndex + i);
      shoppingList.sharedItemIndices = [...new Set([...currentIndices, ...newIndices])].sort(
        (a, b) => a - b
      );
    }
    
    // Save shopping list (screenshots are now in separate collection, so no size issues)
    await shoppingList.save();

    return NextResponse.json({
      success: true,
      itemCount: shoppingList.items.length,
      addedCount: newItems.length,
      skippedCount: items.length - newItems.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { itemIndex, item } = body;

    if (itemIndex === undefined || itemIndex === null) {
      return NextResponse.json(
        { error: "Item index is required" },
        { status: 400 }
      );
    }

    if (!item) {
      return NextResponse.json(
        { error: "Item data is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const shoppingList = await ShoppingList.findOne({
      _id: id,
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    if (itemIndex < 0 || itemIndex >= shoppingList.items.length) {
      return NextResponse.json(
        { error: "Invalid item index" },
        { status: 400 }
      );
    }

    const isOwner = shoppingList.userId === session.user.id;
    const isSharedUser = !isOwner && shoppingList.sharedWith?.includes(session.user.id);

    // Shared users can only modify items at shared indices
    if (isSharedUser) {
      const sharedIndices = shoppingList.sharedItemIndices || [];
      if (!sharedIndices.includes(itemIndex)) {
        return NextResponse.json(
          { error: "You can only modify shared items" },
          { status: 403 }
        );
      }
    }

    // Get the old item to check if productId changed
    const oldItem = shoppingList.items[itemIndex];
    const newItem = item as IShoppingListItem;
    
    // Extract croppedImage if present and save to separate collection
    const croppedImage = (newItem as any).croppedImage;
    if (croppedImage) {
      const shoppingListId = shoppingList._id.toString();
      await ShoppingListItemCroppedImage.findOneAndUpdate(
        { shoppingListId, itemIndex },
        {
          shoppingListId,
          itemIndex,
          base64: croppedImage,
          uploadedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      // Remove croppedImage from item before saving (it's now in separate collection)
      delete (newItem as any).croppedImage;
    }
    
    // If productId changed or is being set, invalidate the cache for both old and new product
    if (newItem.productId) {
      // Invalidate cache for the new product (will force refresh on next fetch)
      await krogerCache.invalidateProduct(newItem.productId, shoppingList.locationId);
      
      // Also invalidate cache for old product if it was different
      if (oldItem?.productId && oldItem.productId !== newItem.productId) {
        await krogerCache.invalidateProduct(oldItem.productId, shoppingList.locationId);
      }
    }

    // Update the item at the specified index
    shoppingList.items[itemIndex] = newItem;
    await shoppingList.save();

    return NextResponse.json({
      success: true,
      item: shoppingList.items[itemIndex],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { itemIndex } = body;

    if (itemIndex === undefined || itemIndex === null) {
      return NextResponse.json(
        { error: "Item index is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const shoppingList = await ShoppingList.findOne({
      _id: id,
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    if (itemIndex < 0 || itemIndex >= shoppingList.items.length) {
      return NextResponse.json(
        { error: "Invalid item index" },
        { status: 400 }
      );
    }

    const isOwner = shoppingList.userId === session.user.id;
    const isSharedUser = !isOwner && shoppingList.sharedWith?.includes(session.user.id);

    // Shared users can only delete items at shared indices
    if (isSharedUser) {
      const sharedIndices = shoppingList.sharedItemIndices || [];
      if (!sharedIndices.includes(itemIndex)) {
        return NextResponse.json(
          { error: "You can only delete shared items" },
          { status: 403 }
        );
      }
    }

    // Remove the item at the specified index
    shoppingList.items.splice(itemIndex, 1);
    
    // Delete cropped image for this item
    const shoppingListId = shoppingList._id.toString();
    await ShoppingListItemCroppedImage.deleteOne({ shoppingListId, itemIndex });
    
    // Update cropped images: decrement itemIndex for all cropped images after the deleted index
    await ShoppingListItemCroppedImage.updateMany(
      { shoppingListId, itemIndex: { $gt: itemIndex } },
      { $inc: { itemIndex: -1 } }
    );
    
    // Update sharedItemIndices: remove the deleted index and decrement indices after it
    if (shoppingList.sharedItemIndices && shoppingList.sharedItemIndices.length > 0) {
      shoppingList.sharedItemIndices = shoppingList.sharedItemIndices
        .filter((idx: number) => idx !== itemIndex) // Remove the deleted index
        .map((idx: number) => idx > itemIndex ? idx - 1 : idx) // Decrement indices after deleted item
        .sort((a: number, b: number) => a - b);
    }
    
    await shoppingList.save();

    return NextResponse.json({
      success: true,
      itemCount: shoppingList.items.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
