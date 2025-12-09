import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

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
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items array is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const shoppingList = await ShoppingList.findOne({
      _id: id,
      userId: session.user.id,
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

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

    // Add new items to the existing list (only non-duplicates)
    shoppingList.items.push(...newItems);
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
      userId: session.user.id,
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

    // Update the item at the specified index
    shoppingList.items[itemIndex] = item as IShoppingListItem;
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
      userId: session.user.id,
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

    // Remove the item at the specified index
    shoppingList.items.splice(itemIndex, 1);
    await shoppingList.save();

    return NextResponse.json({
      success: true,
      itemCount: shoppingList.items.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
