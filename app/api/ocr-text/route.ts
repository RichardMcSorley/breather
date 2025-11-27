/**
 * NOTE: This API route has no references in the codebase but is used externally by the user's mobile app.
 */
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { processOcrScreenshot } from "@/lib/ocr-processor";
import { geocodeAddress } from "@/lib/geocode-helper";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot } = body;

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

    // Generate a unique entryId
    const entryId = randomBytes(16).toString("hex");

    // Process screenshot immediately with Moondream
    try {
      const processed = await processOcrScreenshot(screenshot);

      // Geocode the address
      const geocodeData = await geocodeAddress(processed.customerAddress);

      // Save to ocrexports collection
      const exportEntry = await OcrExport.create({
        entryId,
        userId,
        customerName: processed.customerName,
        customerAddress: processed.customerAddress,
        rawResponse: processed.rawResponse,
        lat: geocodeData?.lat,
        lon: geocodeData?.lon,
        geocodeDisplayName: geocodeData?.displayName,
        processedAt: new Date(),
      });

      return NextResponse.json({
        success: true,
        id: exportEntry._id.toString(),
        entryId: exportEntry.entryId,
        message: "OCR screenshot processed and saved successfully",
      });
    } catch (processError) {
      console.error("Error processing OCR screenshot:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

