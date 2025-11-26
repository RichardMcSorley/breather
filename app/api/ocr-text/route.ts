/**
 * NOTE: This API route has no references in the codebase but is used externally by the user's mobile app.
 */
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrText from "@/lib/models/OcrText";
import { handleApiError } from "@/lib/api-error-handler";

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

    return NextResponse.json({
      success: true,
      id: ocrEntry._id.toString(),
      message: "OCR text saved successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

