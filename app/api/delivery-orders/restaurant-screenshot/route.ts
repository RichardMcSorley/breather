import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { processOrderScreenshotGemini } from "@/lib/order-ocr-processor-gemini";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot, appName, ocrText, lat, lon, alt, address } = body;

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

    // Process screenshot to extract restaurant name and address using Gemini
    let restaurantName: string;
    let extractedAddress: string;
    let rawResponse: string;
    let metadata: Record<string, any> = {};

    try {
      const processed = await processOrderScreenshotGemini(screenshot, ocrText, "restaurant");
      
      // Extract restaurant data from metadata
      const restaurantData = processed.metadata?.extractedData || {};
      restaurantName = restaurantData.restaurantName?.trim() || processed.restaurantName || "unknown";
      extractedAddress = restaurantData.address?.trim() || "unknown";
      rawResponse = processed.rawResponse;
      metadata = {
        extractedData: restaurantData,
      };
    } catch (processError) {
      console.error("Error processing restaurant screenshot:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }

    // Find the active order for this user and appName
    // Only update orders with active = true and matching appName
    const activeOrder = await DeliveryOrder.findOne({
      userId,
      appName: appName.trim(),
      active: true,
    }).sort({ processedAt: -1 });

    if (!activeOrder) {
      return NextResponse.json(
        { error: "No active order found for this app" },
        { status: 404 }
      );
    }

    // Determine if this is the first restaurant or an additional one
    const isFirstRestaurant = !activeOrder.restaurantAddress;

    if (isFirstRestaurant) {
      // Update the main restaurant fields
      activeOrder.restaurantName = restaurantName;
      activeOrder.restaurantAddress = extractedAddress;
      activeOrder.restaurantPlaceId = undefined;
      activeOrder.restaurantLat = undefined;
      activeOrder.restaurantLon = undefined;
    } else {
      // Add to additionalRestaurants array
      const additionalRestaurant = {
        name: restaurantName,
        address: extractedAddress,
        placeId: undefined,
        lat: undefined,
        lon: undefined,
        screenshot: screenshot,
        extractedText: ocrText,
        userLatitude: lat,
        userLongitude: lon,
        userAltitude: alt,
        userAddress: address,
      };

      if (!activeOrder.additionalRestaurants) {
        activeOrder.additionalRestaurants = [];
      }
      activeOrder.additionalRestaurants.push(additionalRestaurant);
    }

    await activeOrder.save();

    return NextResponse.json({
      success: true,
      message: isFirstRestaurant 
        ? "Restaurant information updated successfully" 
        : "Additional restaurant added successfully",
      restaurantName,
      address: extractedAddress,
      isFirstRestaurant,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
