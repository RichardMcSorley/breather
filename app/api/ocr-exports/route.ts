import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";

const DEFAULT_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      DEFAULT_LIMIT,
      Math.max(1, Number(limitParam) || DEFAULT_LIMIT)
    );

    const query: Record<string, string> = {};
    if (userId) {
      query.userId = userId;
    }

    const exportsData = await OcrExport.find(query)
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ entries: exportsData });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { id, customerName, customerAddress, rawResponse } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const update: Record<string, string> = {};
    if (typeof customerName === "string") {
      update.customerName = customerName;
    }
    if (typeof customerAddress === "string") {
      update.customerAddress = customerAddress;
    }
    if (typeof rawResponse === "string") {
      update.rawResponse = rawResponse;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    update.updatedAt = new Date().toISOString();

    const result = await OcrExport.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!result) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ entry: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const result = await OcrExport.findByIdAndDelete(id);

    if (!result) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Entry deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}

