import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { randomBytes } from "crypto";
import { attemptAutoLinkOrderToTransaction } from "@/lib/auto-link-helper";
import { getCurrentESTAsUTC } from "@/lib/date-utils";
import { handleApiError } from "@/lib/api-error-handler";

/**
 * API endpoint for creating delivery orders from offer details (no screenshot)
 * Used by iOS Shortcuts to send offer data directly without OCR processing
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      userId,
      appName,
      pay,
      miles,
      drops,
      pickups,
      items,
      restaurantName,
      restaurants,
      lat,
      lon,
      alt,
      address,
    } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!appName) {
      return NextResponse.json({ error: "Missing appName" }, { status: 400 });
    }


    // Parse pay - handle number, string, or formatted string (e.g., "$", "$8.50", 8.5)
    let parsedMoney: number | undefined;
    if (typeof pay === "number") {
      parsedMoney = pay;
    } else if (typeof pay === "string") {
      const cleaned = pay.replace(/[$,\s]/g, "");
      if (cleaned === "" || cleaned === ".") {
        parsedMoney = undefined;
      } else {
        parsedMoney = parseFloat(cleaned);
        if (isNaN(parsedMoney)) {
          parsedMoney = undefined;
        }
      }
    } else if (pay !== undefined && pay !== null) {
      const parsed = parseFloat(String(pay));
      parsedMoney = isNaN(parsed) ? undefined : parsed;
    }

    // Parse miles if provided
    let parsedMiles: number | undefined;
    if (miles !== undefined && miles !== null) {
      if (typeof miles === "string") {
        parsedMiles = parseFloat(miles.replace(/[^\d.]/g, ""));
        if (isNaN(parsedMiles)) {
          parsedMiles = undefined;
        }
      } else {
        parsedMiles = miles;
      }
    }

    // Parse restaurants - supports multiple formats:
    // - Array of strings: ["Chipotle", "McDonald's"]
    // - Array of objects: [{restaurantName: "Chipotle"}]
    // - Comma-separated string: "Chipotle, McDonald's"
    // - Single string: "Chipotle"
    let parsedRestaurants: { restaurantName: string }[] = [];
    if (restaurants) {
      if (typeof restaurants === "string") {
        try {
          const parsed = JSON.parse(restaurants);
          if (Array.isArray(parsed)) {
            parsedRestaurants = parsed.map((r: any) =>
              typeof r === "string" ? { restaurantName: r } : { restaurantName: r.restaurantName || r.name || "" }
            );
          }
        } catch {
          // Not JSON - treat as comma-separated or single name
          parsedRestaurants = restaurants
            .split(",")
            .map((name: string) => ({ restaurantName: name.trim() }))
            .filter((r) => r.restaurantName);
        }
      } else if (Array.isArray(restaurants)) {
        parsedRestaurants = restaurants.map((r: any) =>
          typeof r === "string" ? { restaurantName: r } : { restaurantName: r.restaurantName || r.name || "" }
        );
      }
    }

    // Use first restaurant from array, or the single restaurantName field
    const firstRestaurant = parsedRestaurants.length > 0 ? parsedRestaurants[0] : null;
    const finalRestaurantName = firstRestaurant?.restaurantName || restaurantName || "";

    const entryId = randomBytes(16).toString("hex");
    const { date: processedAtDate } = getCurrentESTAsUTC();
    const milesToMoneyRatio =
      parsedMiles && parsedMiles > 0 && parsedMoney !== undefined
        ? parsedMoney / parsedMiles
        : undefined;

    const deliveryOrder = await DeliveryOrder.create({
      entryId,
      userId,
      appName: appName.trim(),
      ...(parsedMiles !== undefined && { miles: parsedMiles }),
      ...(parsedMoney !== undefined && { money: parsedMoney }),
      ...(milesToMoneyRatio !== undefined && { milesToMoneyRatio }),
      restaurantName: finalRestaurantName,
      time: "",
      metadata: {
        source: "offer-details-api",
        extractedData: {
          restaurants: parsedRestaurants.length > 0 ? parsedRestaurants : undefined,
          ...(drops !== undefined && { drops }),
          ...(pickups !== undefined && { pickups }),
          ...(items !== undefined && { items }),
        },
      },
      processedAt: processedAtDate,
      step: "CREATED",
      active: false,
      ...(lat !== undefined && lat !== null && { userLatitude: lat }),
      ...(lon !== undefined && lon !== null && { userLongitude: lon }),
      ...(alt !== undefined && alt !== null && { userAltitude: alt }),
      ...(address !== undefined && address !== null && { userAddress: address }),
      // Add remaining restaurants to additionalRestaurants
      ...(parsedRestaurants.length > 1 && {
        additionalRestaurants: parsedRestaurants.slice(1).map((r: any) => ({
          name: r.restaurantName || r.name || "",
          userLatitude: lat,
          userLongitude: lon,
          userAltitude: alt,
          userAddress: address,
        })),
      }),
    });

    // Attempt auto-linking to matching transaction
    try {
      await attemptAutoLinkOrderToTransaction(deliveryOrder, userId);
    } catch (autoLinkError) {
      console.error("Auto-linking error:", autoLinkError);
    }

    return NextResponse.json({
      success: true,
      id: deliveryOrder._id.toString(),
      entryId: deliveryOrder.entryId,
      ...(deliveryOrder.miles !== undefined && { miles: deliveryOrder.miles }),
      ...(deliveryOrder.money !== undefined && { money: deliveryOrder.money }),
      ...(deliveryOrder.milesToMoneyRatio !== undefined && {
        milesToMoneyRatio: deliveryOrder.milesToMoneyRatio,
      }),
      ...(drops !== undefined && { drops }),
      ...(pickups !== undefined && { pickups }),
      ...(items !== undefined && { items }),
      restaurantName: deliveryOrder.restaurantName,
      ...(parsedRestaurants.length > 1 && {
        additionalRestaurants: parsedRestaurants.slice(1).map((r) => r.restaurantName),
      }),
      appName: deliveryOrder.appName,
      orderId: deliveryOrder._id.toString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
