import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { processRestaurantScreenshot } from "@/lib/order-ocr-processor";
import { searchPlaces } from "@/lib/google-places-helper";
import { formatAddress } from "@/lib/address-formatter";
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

    // Pre-search address using Google Places API
    let placeId: string | undefined;
    let placeLat: number | undefined;
    let placeLon: number | undefined;
    let formattedAddress: string | undefined;

    try {
      const searchQuery = `${restaurantName} ${extractedAddress}`;
      const placesResults = await searchPlaces(
        searchQuery,
        lat,
        lon,
        5000,
        "restaurant"
      );

      if (placesResults.length > 0) {
        const firstResult = placesResults[0];
        placeId = firstResult.place_id;
        placeLat = parseFloat(firstResult.lat);
        placeLon = parseFloat(firstResult.lon);
        // Extract address from display_name (remove restaurant name if present)
        const displayParts = firstResult.display_name.split(',').map(p => p.trim());
        let addressParts = displayParts;
        if (displayParts[0] && displayParts[0].toLowerCase() === restaurantName.toLowerCase()) {
          addressParts = displayParts.slice(1);
        }
        formattedAddress = formatAddress(addressParts.join(', '));
      }
    } catch (searchError) {
      console.error("Error searching for address:", searchError);
      // Continue without address search results
    }

    // Determine if this is the first restaurant or an additional one
    const isFirstRestaurant = !activeOrder.restaurantAddress;

    if (isFirstRestaurant) {
      // Update the main restaurant fields
      activeOrder.restaurantName = restaurantName;
      if (formattedAddress) {
        activeOrder.restaurantAddress = formattedAddress;
      } else {
        activeOrder.restaurantAddress = extractedAddress;
      }
      if (placeId) {
        activeOrder.restaurantPlaceId = placeId;
      }
      if (placeLat !== undefined) {
        activeOrder.restaurantLat = placeLat;
      }
      if (placeLon !== undefined) {
        activeOrder.restaurantLon = placeLon;
      }
    } else {
      // Add to additionalRestaurants array
      const additionalRestaurant = {
        name: restaurantName,
        address: formattedAddress || extractedAddress,
        placeId: placeId,
        lat: placeLat,
        lon: placeLon,
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
      address: formattedAddress || extractedAddress,
      placeId,
      lat: placeLat,
      lon: placeLon,
      isFirstRestaurant,
      addressFound: !!placeId, // Indicates if address was successfully found via Google Places
    });
  } catch (error) {
    return handleApiError(error);
  }
}
