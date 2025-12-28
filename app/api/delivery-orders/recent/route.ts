import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { handleApiError } from "@/lib/api-error-handler";

/**
 * API endpoint to get recent unlinked delivery orders
 * Used by iOS Shortcuts to display a list for selection
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, limit: limitParam } = body;
    const limit = parseInt(limitParam || "10", 10);

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get recent orders that are not linked to any transaction
    const orders = await DeliveryOrder.find({
      userId,
      $or: [
        { linkedTransactionIds: { $exists: false } },
        { linkedTransactionIds: { $size: 0 } },
      ],
    })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    // Format as dictionary for iOS Shortcuts: displayText -> id
    // Shortcuts shows dictionary keys in "Choose from List" and returns the value
    const ordersDict: Record<string, string> = {};

    orders.forEach((order) => {
      const moneyText = order.money !== undefined ? `$${order.money}` : "";
      const milesText = order.miles !== undefined ? `${order.miles}mi` : "";
      const ratioText =
        order.milesToMoneyRatio !== undefined
          ? `$${order.milesToMoneyRatio.toFixed(2)}/mi`
          : "";

      // Build display text: "$12.50 5mi $2.50/mi - Chipotle (DoorDash)"
      const parts = [moneyText, milesText, ratioText].filter(Boolean);
      const restaurantText = order.restaurantName || "Unknown";
      const appText = order.appName || "";

      const displayText = `${parts.join(" ")} - ${restaurantText}${appText ? ` (${appText})` : ""}`;

      ordersDict[displayText] = order._id.toString();
    });

    return NextResponse.json(ordersDict);
  } catch (error) {
    return handleApiError(error);
  }
}
