import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import ShoppingListScreenshot from "@/lib/models/ShoppingListScreenshot";
import ShoppingListItemCroppedImage from "@/lib/models/ShoppingListItemCroppedImage";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

// Normalize base64 image (keep data URL prefix if present, as frontend expects it)
function normalizeScreenshot(base64: string): string {
  // Keep the data URL prefix if present, as the frontend expects it for img src
  return base64;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { items, locationId, screenshots } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items array is required" },
        { status: 400 }
      );
    }

    if (!locationId) {
      return NextResponse.json(
        { error: "Location ID is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Extract cropped images from items before creating the list
    const itemsWithCroppedImages: any[] = [];
    const croppedImageDocs: any[] = [];
    
    (items as any[]).forEach((item: any, index: number) => {
      const croppedImage = item.croppedImage;
      const aiDetectedCroppedImage = item.aiDetectedCroppedImage;
      
      // Only create ShoppingListItemCroppedImage document if there's actually a cropped image
      // (base64 is required in the schema)
      if (croppedImage) {
        const doc: any = {
          shoppingListId: null, // Will be set after list is created
          itemIndex: index,
          base64: croppedImage,
          uploadedAt: new Date(),
        };
        // Include aiDetectedCroppedImage if available
        if (aiDetectedCroppedImage !== undefined) {
          doc.aiDetectedCroppedImage = aiDetectedCroppedImage;
        }
        croppedImageDocs.push(doc);
        // Remove croppedImage from item (it will be saved separately)
        // Keep aiDetectedCroppedImage in the item itself
        const { croppedImage: _, ...itemWithoutCropped } = item;
        itemsWithCroppedImages.push(itemWithoutCropped);
      } else {
        // No cropped image, but keep aiDetectedCroppedImage in the item
        itemsWithCroppedImages.push(item);
      }
    });

    const shoppingListData: any = {
      userId: session.user.id,
      name: body.name || `Shopping List - ${new Date().toLocaleDateString()}`,
      locationId,
      items: itemsWithCroppedImages as IShoppingListItem[],
    };

    // Create shopping list (screenshots and cropped images will be saved separately)
    const shoppingList = await ShoppingList.create(shoppingListData);
    const shoppingListId = shoppingList._id.toString();
    
    // Update cropped image docs with shoppingListId
    croppedImageDocs.forEach(doc => {
      doc.shoppingListId = shoppingListId;
    });

    // Save screenshots to separate collection if provided
    if (screenshots && Array.isArray(screenshots) && screenshots.length > 0) {
      const screenshotDocs = screenshots.map((s: any) => ({
        shoppingListId: shoppingListId,
        screenshotId: s.id,
        base64: normalizeScreenshot(s.base64),
        uploadedAt: new Date(),
        app: s.app,
        customers: s.customers || [],
      }));
      
      // Insert all screenshots in parallel
      await ShoppingListScreenshot.insertMany(screenshotDocs);
    }
    
    // Save cropped images to separate collection if any were extracted
    if (croppedImageDocs.length > 0) {
      await ShoppingListItemCroppedImage.insertMany(croppedImageDocs);
    }

    return NextResponse.json({
      success: true,
      shoppingListId: shoppingList._id.toString(),
      itemCount: items.length,
      foundCount: items.filter((i: IShoppingListItem) => i.found).length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
