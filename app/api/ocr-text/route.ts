/**
 * NOTE: This API route has no references in the codebase but is used externally by the user's mobile app.
 */
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrText from "@/lib/models/OcrText";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { processOcrScreenshot } from "@/lib/ocr-processor";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const query: any = {};
    if (userId) {
      query.userId = userId;
    }

    const ocrEntries = await OcrText.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ entries: ocrEntries });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, ocrText, screenshot } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Accept either 'ocrText' or 'screenshot' key
    const textContent = ocrText || screenshot;
    if (!textContent) {
      return NextResponse.json(
        { error: "Missing ocrText or screenshot" },
        { status: 400 }
      );
    }

    // Create the OCR text entry
    const ocrEntry = await OcrText.create({
      userId,
      ocrText: textContent,
      screenshot: screenshot || undefined,
    });

    const entryId = ocrEntry._id.toString();

    // If screenshot is provided, process it immediately with Moondream
    if (screenshot) {
      try {
        const processed = await processOcrScreenshot(screenshot);

        // Save to ocrexports collection
        await OcrExport.findOneAndUpdate(
          { entryId },
          {
            $set: {
              entryId,
              userId,
              customerName: processed.customerName,
              customerAddress: processed.customerAddress,
              rawResponse: processed.rawResponse,
              processedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        // Delete the original OCR entry
        await OcrText.findByIdAndDelete(entryId);

        return NextResponse.json({
          success: true,
          id: entryId,
          message: "OCR screenshot processed and saved successfully",
          processed: true,
        });
      } catch (processError) {
        // If processing fails, log error but still return success for the save
        console.error("Error processing OCR screenshot:", processError);
        // Keep the original entry if processing fails
        return NextResponse.json({
          success: true,
          id: entryId,
          message: "OCR text saved successfully (processing failed, will retry later)",
          processed: false,
          error: processError instanceof Error ? processError.message : "Unknown processing error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      id: entryId,
      message: "OCR text saved successfully",
      processed: false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

