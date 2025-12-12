import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import ShoppingListScreenshot from "@/lib/models/ShoppingListScreenshot";
import ShoppingListItemCroppedImage from "@/lib/models/ShoppingListItemCroppedImage";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

// Helper function to migrate old screenshots from shopping list document to separate collection
async function migrateScreenshots(shoppingListId: string, screenshots: any[]): Promise<void> {
  try {
    if (!screenshots || screenshots.length === 0) return;
    
    // Check which screenshots already exist
    const existingScreenshotIds = new Set(
      (await ShoppingListScreenshot.find({ shoppingListId }).select('screenshotId').lean())
        .map((s: any) => s.screenshotId)
    );
    
    // Only migrate screenshots that don't already exist
    const screenshotsToMigrate = screenshots.filter(s => {
      const screenshotId = s.id || s.screenshotId;
      return screenshotId && !existingScreenshotIds.has(screenshotId);
    });
    
    if (screenshotsToMigrate.length === 0) return;
    
    // Insert screenshots into new collection
    const docsToInsert = screenshotsToMigrate.map((s: any) => ({
      shoppingListId,
      screenshotId: s.id || s.screenshotId,
      base64: s.base64,
      uploadedAt: s.uploadedAt || s.createdAt || new Date(),
      app: s.app,
      customers: s.customers || [],
    }));
    
    await ShoppingListScreenshot.insertMany(docsToInsert);
    console.log(`Migrated ${docsToInsert.length} screenshots for shopping list ${shoppingListId}`);
  } catch (error) {
    console.error('Error in migrateScreenshots:', error);
    // Don't throw - migration is best effort
  }
}

// Helper function to fetch cropped images and merge them into items
async function fetchAndMergeCroppedImages(shoppingListId: string, items: any[], originalIndicesMap?: number[]): Promise<any[]> {
  try {
    // Fetch all cropped images for this shopping list
    const croppedImages = await ShoppingListItemCroppedImage.find({ shoppingListId }).lean();
    
    // Create a map of itemIndex -> croppedImage data (including bounding box)
    const croppedImageMap = new Map<number, { base64: string; xMin?: number; yMin?: number; xMax?: number; yMax?: number; aiDetectedCroppedImage?: boolean }>();
    croppedImages.forEach((img: any) => {
      croppedImageMap.set(img.itemIndex, {
        base64: img.base64,
        xMin: img.xMin,
        yMin: img.yMin,
        xMax: img.xMax,
        yMax: img.yMax,
        aiDetectedCroppedImage: img.aiDetectedCroppedImage,
      });
    });
    
    // Merge cropped images into items
    return items.map((item: any, index: number) => {
      // Use original index if we have a map (for shared users), otherwise use current index
      const itemIndex = originalIndicesMap ? originalIndicesMap[index] : index;
      const croppedImageData = croppedImageMap.get(itemIndex);
      
      // If cropped image exists in new collection, use it with bounding box
      if (croppedImageData) {
        const hasBoundingBox = 
          typeof croppedImageData.xMin === 'number' && 
          typeof croppedImageData.yMin === 'number' && 
          typeof croppedImageData.xMax === 'number' && 
          typeof croppedImageData.yMax === 'number';
        
        return { 
          ...item, 
          croppedImage: croppedImageData.base64,
          // Include bounding box coordinates if available
          ...(hasBoundingBox && {
            boundingBox: {
              xMin: croppedImageData.xMin,
              yMin: croppedImageData.yMin,
              xMax: croppedImageData.xMax,
              yMax: croppedImageData.yMax,
            }
          }),
          // Include AI detected cropped image flag if available
          ...(croppedImageData.aiDetectedCroppedImage !== undefined && {
            aiDetectedCroppedImage: croppedImageData.aiDetectedCroppedImage,
          })
        };
      }
      
      // Otherwise, keep existing croppedImage if present (for backward compatibility)
      return item;
    });
  } catch (error) {
    console.error('Error fetching cropped images:', error);
    // Return items as-is if there's an error
    return items;
  }
}

// Helper function to migrate old cropped images from items to separate collection
async function migrateCroppedImages(shoppingListId: string, items: any[]): Promise<void> {
  try {
    if (!items || items.length === 0) return;
    
    // Find items with croppedImage in old format
    const itemsToMigrate: Array<{ itemIndex: number; base64: string }> = [];
    items.forEach((item: any, index: number) => {
      if (item.croppedImage) {
        itemsToMigrate.push({
          itemIndex: index,
          base64: item.croppedImage,
        });
      }
    });
    
    if (itemsToMigrate.length === 0) return;
    
    // Check which cropped images already exist
    const existingCroppedImages = await ShoppingListItemCroppedImage.find({ 
      shoppingListId,
      itemIndex: { $in: itemsToMigrate.map(i => i.itemIndex) }
    }).lean();
    
    const existingIndices = new Set(existingCroppedImages.map((img: any) => img.itemIndex));
    
    // Only migrate cropped images that don't already exist
    const croppedImagesToMigrate = itemsToMigrate.filter(
      item => !existingIndices.has(item.itemIndex)
    );
    
    if (croppedImagesToMigrate.length === 0) return;
    
    // Insert cropped images into new collection
    const docsToInsert = croppedImagesToMigrate.map((item) => ({
      shoppingListId,
      itemIndex: item.itemIndex,
      base64: item.base64,
      uploadedAt: new Date(),
    }));
    
    await ShoppingListItemCroppedImage.insertMany(docsToInsert);
    console.log(`Migrated ${docsToInsert.length} cropped images for shopping list ${shoppingListId}`);
  } catch (error) {
    console.error('Error in migrateCroppedImages:', error);
    // Don't throw - migration is best effort
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

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

    // If shared user, filter items to only shared indices
    if (isSharedUser) {
      const sharedIndices = shoppingList.sharedItemIndices || [];
      const filteredItems: any[] = [];
      const originalIndicesMap: number[] = [];
      
      shoppingList.items.forEach((item, index) => {
        if (sharedIndices.includes(index)) {
          filteredItems.push(item);
          originalIndicesMap.push(index);
        }
      });

      const listObject = shoppingList.toObject();
      // Convert Map to plain object for sharedItems if it exists
      if (listObject.sharedItems instanceof Map) {
        listObject.sharedItems = Object.fromEntries(listObject.sharedItems);
      }
      
      // Fetch screenshots from separate collection
      const screenshots = await ShoppingListScreenshot.find({ shoppingListId: id })
        .sort({ uploadedAt: 1 })
        .lean();
      
      // Transform to match the old format for backward compatibility
      let formattedScreenshots = screenshots.map((s: any) => ({
        id: s.screenshotId,
        base64: s.base64,
        uploadedAt: s.uploadedAt,
        app: s.app,
        customers: s.customers || [],
      }));
      
      // If no screenshots in new collection, check if they exist in the old format (for migration)
      if (formattedScreenshots.length === 0 && (shoppingList as any).screenshots && Array.isArray((shoppingList as any).screenshots) && (shoppingList as any).screenshots.length > 0) {
        // Use old format screenshots (backward compatibility)
        formattedScreenshots = (shoppingList as any).screenshots.map((s: any) => ({
          id: s.id || s.screenshotId,
          base64: s.base64,
          uploadedAt: s.uploadedAt || s.createdAt,
          app: s.app,
          customers: s.customers || [],
        }));
        
        // Optionally migrate old screenshots to new collection (async, don't wait)
        migrateScreenshots(id, formattedScreenshots).catch(err => {
          console.error('Error migrating screenshots:', err);
        });
      }
      
      // Fetch and merge cropped images into items
      const itemsWithCroppedImages = await fetchAndMergeCroppedImages(id, filteredItems, originalIndicesMap);
      
      // Migrate old cropped images if they exist (async, don't wait)
      migrateCroppedImages(id, filteredItems).catch(err => {
        console.error('Error migrating cropped images:', err);
      });
      
      return NextResponse.json({
        ...listObject,
        items: itemsWithCroppedImages,
        screenshots: formattedScreenshots, // Add screenshots from separate collection
        originalIndicesMap, // Map from filtered index to original index
        isShared: true,
      });
    }

    // Owner gets full list
    const listObject = shoppingList.toObject({ 
      virtuals: false,
      getters: true,
      flattenMaps: false 
    });
    // Convert Map to plain object for sharedItems if it exists
    if (listObject.sharedItems instanceof Map) {
      listObject.sharedItems = Object.fromEntries(listObject.sharedItems);
    }
    
    // Fetch screenshots from separate collection
    const screenshots = await ShoppingListScreenshot.find({ shoppingListId: id })
      .sort({ uploadedAt: 1 })
      .lean();
    
    // Transform to match the old format for backward compatibility
    let formattedScreenshots = screenshots.map((s: any) => ({
      id: s.screenshotId,
      base64: s.base64,
      uploadedAt: s.uploadedAt,
      app: s.app,
      customers: s.customers || [],
    }));
    
    // If no screenshots in new collection, check if they exist in the old format (for migration)
    if (formattedScreenshots.length === 0 && (shoppingList as any).screenshots && Array.isArray((shoppingList as any).screenshots) && (shoppingList as any).screenshots.length > 0) {
      // Use old format screenshots (backward compatibility)
      formattedScreenshots = (shoppingList as any).screenshots.map((s: any) => ({
        id: s.id || s.screenshotId,
        base64: s.base64,
        uploadedAt: s.uploadedAt || s.createdAt,
        app: s.app,
        customers: s.customers || [],
      }));
      
      // Optionally migrate old screenshots to new collection (async, don't wait)
      migrateScreenshots(id, formattedScreenshots).catch(err => {
        console.error('Error migrating screenshots:', err);
      });
    }
    
    // Fetch and merge cropped images into items
    const itemsWithCroppedImages = await fetchAndMergeCroppedImages(id, listObject.items);
    
    // Migrate old cropped images if they exist (async, don't wait)
    migrateCroppedImages(id, listObject.items).catch(err => {
      console.error('Error migrating cropped images:', err);
    });
    
    // Log to verify croppedImage is in items
    if (itemsWithCroppedImages && itemsWithCroppedImages.length > 0) {
      const itemsWithCropped = itemsWithCroppedImages.filter((item: any) => item.croppedImage);
      console.log(`[GET /api/shopping-lists/${id}] Items with croppedImage: ${itemsWithCropped.length} of ${itemsWithCroppedImages.length}`);
    }
    
    return NextResponse.json({
      ...listObject,
      items: itemsWithCroppedImages,
      screenshots: formattedScreenshots, // Add screenshots from separate collection
      isShared: false,
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

    await connectDB();

    // Only owner can delete the entire list
    const result = await ShoppingList.deleteOne({
      _id: id,
      userId: session.user.id,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Shopping list not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    // Also delete all associated screenshots and cropped images
    await ShoppingListScreenshot.deleteMany({ shoppingListId: id });
    await ShoppingListItemCroppedImage.deleteMany({ shoppingListId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
