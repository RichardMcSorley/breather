import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

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

    const shoppingListData: any = {
      userId: session.user.id,
      name: body.name || `Shopping List - ${new Date().toLocaleDateString()}`,
      locationId,
      items: items as IShoppingListItem[],
    };

    // Add screenshots if provided
    if (screenshots && Array.isArray(screenshots) && screenshots.length > 0) {
      shoppingListData.screenshots = screenshots.map((s: any) => ({
        id: s.id,
        base64: s.base64,
        uploadedAt: new Date(),
        app: s.app,
        customers: s.customers || [],
      }));
    }

    const shoppingList = await ShoppingList.create(shoppingListData);

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
