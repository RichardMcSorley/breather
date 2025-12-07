import { NextRequest, NextResponse } from "next/server";

/**
 * TEST ENDPOINT - Python PaddleOCR VL OCR via external API
 * This endpoint calls the Python PaddleOCR VL API service
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

    console.log("🔍 PADDLEOCR VL OCR TEST - Processing order screenshot...");

    // Get OCR API URL from environment variable or use default
    const paddleOcrApiUrl = process.env.PADDLE_OCR_API_URL || process.env.OCR_API_URL || "http://localhost:8001";

    try {
      // Call the Python PaddleOCR VL API
      const response = await fetch(`${paddleOcrApiUrl}/api/order-ocr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          screenshot,
          ocrText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PaddleOCR API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      console.log("✅ PADDLEOCR VL OCR RESULTS:");
      console.log("   Miles:", data.miles);
      console.log("   Money:", data.money);
      console.log("   Restaurant Name:", data.restaurantName);
      console.log("   Raw OCR Text:", data.rawOcrText);

      return NextResponse.json({
        success: true,
        message: "PaddleOCR VL OCR test completed (no database operations)",
        miles: data.miles,
        money: data.money,
        restaurantName: data.restaurantName,
        ocrEngine: "paddleocr-vl",
        rawOcrText: data.rawOcrText,
        metadata: data.metadata || {},
      });
    } catch (apiError) {
      console.error("❌ Error calling PaddleOCR VL API:", apiError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: apiError instanceof Error ? apiError.message : "Unknown error",
          hint: "Make sure the Python PaddleOCR VL API is running. Set PADDLE_OCR_API_URL environment variable.",
        },
        { status: 500 }
      );
    }
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

