import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import ShoppingList from "@/lib/models/ShoppingList";

/**
 * Server-side data fetching functions for shopping lists page
 */

export async function getShoppingLists() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const lists = await ShoppingList.find({
    $or: [
      { userId: session.user.id },
      { sharedWith: session.user.id },
    ],
  })
    .sort({ createdAt: -1 })
    .select("_id name locationId items createdAt sharedWith sharedItemIndices userId")
    .lean();

  const processedLists = lists.map((list) => {
    const isOwner = list.userId === session.user.id;
    const isSharedUser = !isOwner && list.sharedWith?.includes(session.user.id);

    if (isSharedUser) {
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

    return {
      _id: list._id,
      name: list.name,
      locationId: list.locationId,
      items: list.items || [],
      createdAt: list.createdAt,
      isShared: false,
    };
  });

  return processedLists;
}
