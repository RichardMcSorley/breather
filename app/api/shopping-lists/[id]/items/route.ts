import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

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
