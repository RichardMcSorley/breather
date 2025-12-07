import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { processOrderScreenshotGemini } from "@/lib/order-ocr-processor-gemini";
import { randomBytes } from "crypto";
import { attemptAutoLinkOrderToTransaction } from "@/lib/auto-link-helper";
import { getCurrentESTAsUTC } from "@/lib/date-utils";
import { handleApiError } from "@/lib/api-error-handler";

/**
 * API endpoint for processing order screenshots with Gemini
 * Always creates a new order - first restaurant is main, additional restaurants from same screenshot go to additionalRestaurants
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot, appName, lat, lon, alt, address } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!screenshot) {
      return NextResponse.json(
        { error: "Missing screenshot" },
        { status: 400 }
      );
    }

    if (!appName) {
      return NextResponse.json(
        { error: "Missing appName" },
        { status: 400 }
      );
    }

    // Process screenshot to extract order information using Gemini API
    let miles: number;
    let money: number;
    let restaurantName: string;
    let rawResponse: string;
    let metadata: Record<string, any> = {};
    let restaurants: any[] = [];

    try {
      const processed = await processOrderScreenshotGemini(screenshot, undefined, "order");
      miles = processed.miles;
      money = processed.money;
      restaurantName = processed.restaurantName;
      rawResponse = processed.rawResponse;
      metadata = processed.metadata;
      
      // Extract restaurants array from metadata
      if (metadata.extractedData?.restaurants && Array.isArray(metadata.extractedData.restaurants)) {
        restaurants = metadata.extractedData.restaurants;
      }
    } catch (processError) {
      console.error("Error processing order screenshot:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }

    // Always create a new order - never update existing orders
    // First restaurant becomes the main restaurant, additional restaurants from same screenshot go to additionalRestaurants
    const entryId = randomBytes(16).toString("hex");
    const { date: processedAtDate } = getCurrentESTAsUTC();
    const milesToMoneyRatio = miles && miles > 0 ? money / miles : undefined;
    const firstRestaurant = restaurants.length > 0 ? restaurants[0] : null;

    const deliveryOrder = await DeliveryOrder.create({
      entryId,
      userId,
      appName: appName.trim(),
      ...(miles !== undefined && miles !== null && { miles }),
      money,
      ...(milesToMoneyRatio !== undefined && { milesToMoneyRatio }),
      restaurantName: firstRestaurant?.restaurantName || restaurantName,
      time: "",
      rawResponse,
      metadata: {
        extractedData: metadata.extractedData,
      },
      processedAt: processedAtDate,
      step: "CREATED",
      active: false,
      ...(lat !== undefined && lat !== null && { userLatitude: lat }),
      ...(lon !== undefined && lon !== null && { userLongitude: lon }),
      ...(alt !== undefined && alt !== null && { userAltitude: alt }),
      ...(address !== undefined && address !== null && { userAddress: address }),
      // Add remaining restaurants to additionalRestaurants - all from same screenshot, same order ID
      ...(restaurants.length > 1 && {
        additionalRestaurants: restaurants.slice(1).map((r: any) => ({
          name: r.restaurantName || "",
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

    const milesText = deliveryOrder.miles !== undefined ? `${deliveryOrder.miles} mi` : "? mi";
    const ratioText = deliveryOrder.milesToMoneyRatio !== undefined 
      ? `$${deliveryOrder.milesToMoneyRatio.toFixed(2)}/mi - ` 
      : "";

    return NextResponse.json({
      success: true,
      id: deliveryOrder._id.toString(),
      entryId: deliveryOrder.entryId,
      message: "Delivery order processed and saved successfully",
      ...(deliveryOrder.miles !== undefined && { miles: deliveryOrder.miles }),
      money: deliveryOrder.money,
      ...(deliveryOrder.milesToMoneyRatio !== undefined && { milesToMoneyRatio: deliveryOrder.milesToMoneyRatio }),
      restaurantName: deliveryOrder.restaurantName,
      time: deliveryOrder.time,
      appName: deliveryOrder.appName,
      displayText: `${ratioText}${milesText} for $${deliveryOrder.money} at ${deliveryOrder.restaurantName}`,
      editLink: `https://breather-chi.vercel.app/delivery-orders?orderId=${deliveryOrder._id.toString()}`,
      restaurantsAdded: restaurants.length,
      orderId: deliveryOrder._id.toString(), // All restaurants from this screenshot mapped to this order ID
    });
  } catch (error) {
    return handleApiError(error);
  }
}

