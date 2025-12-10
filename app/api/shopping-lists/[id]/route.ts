import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

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
      return NextResponse.json({
        ...listObject,
        items: filteredItems,
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
    
    // Log to verify croppedImage is in items
    if (listObject.items && listObject.items.length > 0) {
      const itemsWithCropped = listObject.items.filter((item: any) => item.croppedImage);
      console.log(`[GET /api/shopping-lists/${id}] Items with croppedImage: ${itemsWithCropped.length} of ${listObject.items.length}`);
    }
    
    return NextResponse.json({
      ...listObject,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
