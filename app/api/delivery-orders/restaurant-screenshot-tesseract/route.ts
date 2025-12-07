import { NextRequest, NextResponse } from "next/server";
import { processRestaurantScreenshotTesseract } from "@/lib/order-ocr-processor-tesseract";
import { searchPlaces } from "@/lib/google-places-helper";
import { formatAddress } from "@/lib/address-formatter";

/**
 * TEST ENDPOINT - Tesseract OCR testing only
 * This endpoint processes screenshots with Tesseract OCR and logs results
 * No database operations are performed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshot, ocrText, lat, lon } = body;

    // Validate required fields
    if (!screenshot) {
      return NextResponse.json(
        { error: "Missing screenshot" },
        { status: 400 }
      );
    }

    console.log("🔍 TESSERACT OCR TEST - Processing screenshot...");

    // Process screenshot to extract restaurant name and address using Tesseract OCR
    let restaurantName: string;
    let extractedAddress: string;
    let rawResponse: string;
    let metadata: Record<string, any> = {};

    try {
      const processed = await processRestaurantScreenshotTesseract(screenshot, ocrText);
      restaurantName = processed.restaurantName;
      extractedAddress = processed.address;
      rawResponse = processed.rawResponse;
      metadata = processed.metadata;

      console.log("✅ TESSERACT OCR RESULTS:");
      console.log("   Restaurant Name:", restaurantName);
      console.log("   Address:", extractedAddress);
      console.log("   Raw OCR Text:", rawResponse);
      console.log("   Metadata:", JSON.stringify(metadata, null, 2));
    } catch (processError) {
      console.error("❌ Error processing restaurant screenshot with Tesseract:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }

    // Optionally search for address using Google Places API (for testing)
    let placeId: string | undefined;
    let placeLat: number | undefined;
    let placeLon: number | undefined;
    let formattedAddress: string | undefined;

    if (restaurantName && extractedAddress && restaurantName !== "unknown" && extractedAddress !== "unknown") {
      try {
        const searchQuery = `${restaurantName} ${extractedAddress}`;
        console.log("🔍 Searching Google Places with query:", searchQuery);
        
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

          console.log("✅ Google Places Search Results:");
          console.log("   Place ID:", placeId);
          console.log("   Formatted Address:", formattedAddress);
          console.log("   Coordinates:", { lat: placeLat, lon: placeLon });
        } else {
          console.log("⚠️  No Google Places results found");
        }
      } catch (searchError) {
        console.error("⚠️  Error searching for address:", searchError);
        // Continue without address search results
      }
    } else {
      console.log("⚠️  Skipping Google Places search - restaurant name or address not extracted");
    }

    const result = {
      success: true,
      message: "Tesseract OCR test completed (no database operations)",
      restaurantName,
      address: formattedAddress || extractedAddress,
      placeId,
      lat: placeLat,
      lon: placeLon,
      addressFound: !!placeId,
      ocrEngine: "tesseract",
      rawOcrText: rawResponse,
      metadata,
    };

    console.log("📊 FINAL TEST RESULTS:");
    console.log(JSON.stringify(result, null, 2));

    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

