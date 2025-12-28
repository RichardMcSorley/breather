import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import ShoppingListItemCroppedImage from "@/lib/models/ShoppingListItemCroppedImage";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemIndex: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, itemIndex } = await params;
    const itemIndexNum = parseInt(itemIndex, 10);

    if (isNaN(itemIndexNum)) {
      return NextResponse.json(
        { error: "Invalid item index" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { aiDetectedCroppedOff } = body;

    if (typeof aiDetectedCroppedOff !== "boolean") {
      return NextResponse.json(
        { error: "aiDetectedCroppedOff must be a boolean" },
        { status: 400 }
      );
    }

    await connectDB();

    // Verify user has access to this shopping list
    const shoppingList = await ShoppingList.findOne({
      _id: id,
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found or access denied" },
        { status: 404 }
      );
    }

    // Update the cropped image with the AI detected flag
    await ShoppingListItemCroppedImage.findOneAndUpdate(
      { shoppingListId: id, itemIndex: itemIndexNum },
      { aiDetectedCroppedOff },
      { upsert: false } // Don't create if it doesn't exist
    );

    return NextResponse.json({
      success: true,
      aiDetectedCroppedOff,
    });
  } catch (error) {
    console.error("Error saving AI detected cropped off flag:", error);
    return handleApiError(error);
  }
}




