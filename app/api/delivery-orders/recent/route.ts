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

    // Get recent unlinked orders within last 24 hours
    const orders = await DeliveryOrder.find({
      userId,
      processedAt: { $gte: twentyFourHoursAgo },
      $or: [
        { linkedTransactionIds: { $exists: false } },
        { linkedTransactionIds: { $size: 0 } },
      ],
    })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    // Build base display texts first to detect duplicates
    const baseTexts = orders.map((order) => {
      const moneyText = order.money !== undefined ? `$${order.money}` : "";
      const milesText = order.miles !== undefined ? `${order.miles}mi` : "";
      const ratioText =
        order.milesToMoneyRatio !== undefined
          ? `$${order.milesToMoneyRatio.toFixed(2)}/mi`
          : "";

      const parts = [moneyText, milesText, ratioText].filter(Boolean);
      const restaurantText = order.restaurantName || "Unknown";
      const appText = order.appName || "";

      return `${parts.join(" ")} - ${restaurantText}${appText ? ` (${appText})` : ""}`;
    });

    // Count occurrences of each display text
    const textCounts: Record<string, number> = {};
    baseTexts.forEach((text) => {
      textCounts[text] = (textCounts[text] || 0) + 1;
    });

    // Track current index for each duplicate text
    const textIndices: Record<string, number> = {};

    // Two arrays for iOS Shortcuts:
    // - display: array of display texts for "Choose from List"
    // - ids: array of {id, displayText} to find the matching ID after selection
    const display: string[] = [];
    const ids: { id: string; displayText: string }[] = [];

    orders.forEach((order, i) => {
      const baseText = baseTexts[i];
      let displayText = baseText;

      // Add index suffix for duplicates
      if (textCounts[baseText] > 1) {
        textIndices[baseText] = (textIndices[baseText] || 0) + 1;
        displayText = `${baseText} (${textIndices[baseText]})`;
      }

      display.push(displayText);
      ids.push({ id: order._id.toString(), displayText });
    });

    return NextResponse.json({ display, ids });
  } catch (error) {
    return handleApiError(error);
  }
}
