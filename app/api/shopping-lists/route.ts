import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Find lists where user is owner OR in sharedWith
    const lists = await ShoppingList.find({
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    })
      .sort({ createdAt: -1 })
      .select("_id name locationId items createdAt sharedWith sharedItemIndices userId")
      .lean();

    // Process lists: filter items for shared lists, add isShared flag
    const processedLists = lists.map((list) => {
      const isOwner = list.userId === session.user.id;
      const isSharedUser = !isOwner && list.sharedWith?.includes(session.user.id);

      if (isSharedUser) {
        // Filter items to only shared indices
        const sharedIndices = list.sharedItemIndices || [];
        const filteredItems = (list.items || []).filter((_, index) =>
          sharedIndices.includes(index)
        );

        return {
          _id: list._id,
          name: list.name,
          locationId: list.locationId,
          items: filteredItems,
          createdAt: list.createdAt,
          isShared: true,
        };
      }

      // Owner gets full list
      return {
        _id: list._id,
        name: list.name,
        locationId: list.locationId,
        items: list.items || [],
        createdAt: list.createdAt,
        isShared: false,
      };
    });

    return NextResponse.json(processedLists);
  } catch (error) {
    return handleApiError(error);
  }
}
