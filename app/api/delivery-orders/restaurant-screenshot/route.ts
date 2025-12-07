import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { processRestaurantScreenshot } from "@/lib/order-ocr-processor";
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

    // Process screenshot to extract restaurant name and address
    let restaurantName: string;
    let extractedAddress: string;
    let rawResponse: string;
    let metadata: Record<string, any> = {};

    try {
      const processed = await processRestaurantScreenshot(screenshot, ocrText);
      restaurantName = processed.restaurantName;
      extractedAddress = processed.address;
      rawResponse = processed.rawResponse;
      metadata = processed.metadata;
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

    // If this is the first restaurant and we have an address, update step log for linked transactions
    if (isFirstRestaurant && activeOrder.restaurantAddress && activeOrder.linkedTransactionIds && activeOrder.linkedTransactionIds.length > 0) {
      try {
        // Find all linked transactions
        const linkedTransactions = await Transaction.find({
          _id: { $in: activeOrder.linkedTransactionIds },
          userId: userId,
        });

        // Update each transaction's step log if needed
        for (const transaction of linkedTransactions) {
          // Check if transaction already has NAV_TO_RESTERAUNT step in step log
          const hasNavToRestaurantStep = transaction.stepLog?.some(
            (log) => log.toStep === "NAV_TO_RESTERAUNT"
          );

          // Only add step log entry if it doesn't already exist
          if (!hasNavToRestaurantStep) {
            const updateData: any = {
              $push: {
                stepLog: {
                  fromStep: transaction.step || "CREATED",
                  toStep: "NAV_TO_RESTERAUNT",
                  time: new Date(),
                },
              },
            };

            // Update step to NAV_TO_RESTERAUNT if it's currently CREATED
            if (transaction.step === "CREATED" || !transaction.step) {
              updateData.$set = { step: "NAV_TO_RESTERAUNT" };
            }

            await Transaction.findByIdAndUpdate(transaction._id, updateData);
          }
        }
      } catch (stepLogError) {
        // Log error but don't fail the request - step log update is not critical
        console.error("Error updating step log for linked transactions:", stepLogError);
      }
    }

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
