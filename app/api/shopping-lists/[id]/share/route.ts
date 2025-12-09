import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

// Share items with users (only owner can share)
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
    const { userIds, itemIndices } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "User IDs array is required" },
        { status: 400 }
      );
    }

    if (!itemIndices || !Array.isArray(itemIndices) || itemIndices.length === 0) {
      return NextResponse.json(
        { error: "Item indices array is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Only owner can share
    const shoppingList = await ShoppingList.findOne({
      _id: id,
      userId: session.user.id,
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Validate item indices are within bounds
    const maxIndex = shoppingList.items.length - 1;
    const invalidIndices = itemIndices.filter(
      (idx: number) => idx < 0 || idx > maxIndex
    );
    if (invalidIndices.length > 0) {
      return NextResponse.json(
        { error: `Invalid item indices: ${invalidIndices.join(", ")}` },
        { status: 400 }
      );
    }

    // Add users to sharedWith (avoid duplicates)
    const currentSharedWith = shoppingList.sharedWith || [];
    const newUsers = userIds.filter(
      (uid: string) => !currentSharedWith.includes(uid)
    );
    shoppingList.sharedWith = [...currentSharedWith, ...newUsers];

    // Update sharedItemIndices (merge and deduplicate, sorted)
    const currentIndices = shoppingList.sharedItemIndices || [];
    const allIndices = [...new Set([...currentIndices, ...itemIndices])].sort(
      (a, b) => a - b
    );
    shoppingList.sharedItemIndices = allIndices;

    await shoppingList.save();

    return NextResponse.json({
      success: true,
      sharedWith: shoppingList.sharedWith,
      sharedItemIndices: shoppingList.sharedItemIndices,
      addedUsers: newUsers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// Update which items are shared (only owner can update)
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
    const { itemIndices } = body;

    if (!itemIndices || !Array.isArray(itemIndices)) {
      return NextResponse.json(
        { error: "Item indices array is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Only owner can update shared items
    const shoppingList = await ShoppingList.findOne({
      _id: id,
      userId: session.user.id,
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Validate item indices are within bounds
    const maxIndex = shoppingList.items.length - 1;
    const invalidIndices = itemIndices.filter(
      (idx: number) => idx < 0 || idx > maxIndex
    );
    if (invalidIndices.length > 0) {
      return NextResponse.json(
        { error: `Invalid item indices: ${invalidIndices.join(", ")}` },
        { status: 400 }
      );
    }

    // Update sharedItemIndices (deduplicate and sort)
    shoppingList.sharedItemIndices = [...new Set(itemIndices)].sort(
      (a, b) => a - b
    );

    await shoppingList.save();

    return NextResponse.json({
      success: true,
      sharedItemIndices: shoppingList.sharedItemIndices,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// Remove user from shared list (owner can remove anyone, shared user can remove themselves)
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
    const { userId } = body;

    await connectDB();

    const shoppingList = await ShoppingList.findOne({
      _id: id,
      $or: [{ userId: session.user.id }, { sharedWith: session.user.id }],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    const isOwner = shoppingList.userId === session.user.id;
    const targetUserId = userId || session.user.id;

    // Only owner can remove other users, anyone can remove themselves
    if (!isOwner && targetUserId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only remove yourself from shared lists" },
        { status: 403 }
      );
    }

    // Remove user from sharedWith
    const currentSharedWith = shoppingList.sharedWith || [];
    shoppingList.sharedWith = currentSharedWith.filter(
      (uid: string) => uid !== targetUserId
    );

    await shoppingList.save();

    return NextResponse.json({
      success: true,
      sharedWith: shoppingList.sharedWith,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

