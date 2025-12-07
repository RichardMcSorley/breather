import { NextRequest, NextResponse } from "next/server";

/**
 * TEST ENDPOINT - Python pytesseract OCR via external API
 * This endpoint calls the Python OCR API service
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

    console.log("🔍 PYTHON TESSERACT OCR TEST - Processing order screenshot...");

    // Get OCR API URL from environment variable or use default
    const ocrApiUrl = process.env.OCR_API_URL || "http://localhost:8000";

    try {
      // Call the Python OCR API
      const response = await fetch(`${ocrApiUrl}/api/order-ocr`, {
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
        throw new Error(`OCR API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      console.log("✅ PYTHON TESSERACT OCR RESULTS:");
      console.log("   Miles:", data.miles);
      console.log("   Money:", data.money);
      console.log("   Restaurant Name:", data.restaurantName);
      console.log("   Raw OCR Text:", data.rawOcrText);

      return NextResponse.json({
        success: true,
        message: "Python pytesseract OCR test completed (no database operations)",
        miles: data.miles,
        money: data.money,
        restaurantName: data.restaurantName,
        ocrEngine: "pytesseract",
        rawOcrText: data.rawOcrText,
        metadata: data.metadata || {},
      });
    } catch (apiError) {
      console.error("❌ Error calling Python OCR API:", apiError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: apiError instanceof Error ? apiError.message : "Unknown error",
          hint: "Make sure the Python OCR API is running. Set OCR_API_URL environment variable.",
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

