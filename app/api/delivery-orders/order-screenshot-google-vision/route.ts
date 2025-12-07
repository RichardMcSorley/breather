import { NextRequest, NextResponse } from "next/server";
import { processOrderScreenshotGoogleVision } from "@/lib/order-ocr-processor-google-vision";

/**
 * TEST ENDPOINT - Google Vision OCR testing only for orders
 * This endpoint processes order screenshots with Google Cloud Vision API and returns results
 * No database operations are performed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshot, ocrText } = body;

    // Validate required fields
    if (!screenshot) {
      return NextResponse.json(
        { error: "Missing screenshot" },
        { status: 400 }
      );
    }

    console.log("🔍 GOOGLE VISION OCR TEST - Processing order screenshot...");

    // Process screenshot to extract order information using Google Vision API
    let miles: number;
    let money: number;
    let restaurantName: string;
    let rawResponse: string;
    let metadata: Record<string, any> = {};

    try {
      const processed = await processOrderScreenshotGoogleVision(screenshot, ocrText);
      miles = processed.miles;
      money = processed.money;
      restaurantName = processed.restaurantName;
      rawResponse = processed.rawResponse;
      metadata = processed.metadata;

      console.log("✅ GOOGLE VISION OCR RESULTS:");
      console.log("   Miles:", miles);
      console.log("   Money:", money);
      console.log("   Restaurant Name:", restaurantName);
      console.log("   Raw OCR Text:", rawResponse);
      console.log("   Metadata:", JSON.stringify(metadata, null, 2));
    } catch (processError) {
      console.error("❌ Error processing order screenshot with Google Vision:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }

    const result = {
      success: true,
      message: "Google Vision OCR test completed (no database operations)",
      miles,
      money,
      restaurantName,
      ocrEngine: "google-vision",
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

