import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrText from "@/lib/models/OcrText";
import { handleApiError } from "@/lib/api-error-handler";
import { isValidObjectId } from "@/lib/validation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await connectDB();

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid OCR entry ID" }, { status: 400 });
    }

    const ocrEntry = await OcrText.findOneAndDelete({
      _id: id,
    });

    if (!ocrEntry) {
      return NextResponse.json({ error: "OCR entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

