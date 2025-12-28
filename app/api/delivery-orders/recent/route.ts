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
    const limit = parseInt(limitParam || "50", 10);

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Get recent orders within last 24 hours (both linked and unlinked)
    const orders = await DeliveryOrder.find({
      userId,
      processedAt: { $gte: twentyFourHoursAgo },
    })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    // Two arrays for iOS Shortcuts:
    // - display: array of display texts for "Choose from List"
    // - ids: array of {id, displayText} to find the matching ID after selection
    const display: string[] = [];
    const ids: { id: string; displayText: string }[] = [];

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

      display.push(displayText);
      ids.push({ id: order._id.toString(), displayText });
    });

    return NextResponse.json({ display, ids });
  } catch (error) {
    return handleApiError(error);
  }
}
