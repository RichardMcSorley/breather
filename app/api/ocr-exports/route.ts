import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { geocodeAddress } from "@/lib/geocode-helper";

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
    const { id, appName, customerName, customerAddress, rawResponse } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const updateSet: Record<string, any> = {};
    let needsGeocoding = false;

    if (typeof appName === "string") {
      updateSet.appName = appName;
    }
    if (typeof customerName === "string") {
      updateSet.customerName = customerName;
    }
    if (typeof customerAddress === "string") {
      updateSet.customerAddress = customerAddress;
      needsGeocoding = true;
    }
    if (typeof rawResponse === "string") {
      updateSet.rawResponse = rawResponse;
    }

    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // If address is updated, geocode it
    if (needsGeocoding) {
      try {
        const geocodeData = await geocodeAddress(updateSet.customerAddress);
        if (geocodeData && geocodeData.lat != null && geocodeData.lon != null) {
          updateSet.lat = geocodeData.lat;
          updateSet.lon = geocodeData.lon;
          updateSet.geocodeDisplayName = geocodeData.displayName || null;
        } else {
          // Clear geocoding data if geocoding fails - explicitly set to null
          updateSet.lat = null;
          updateSet.lon = null;
          updateSet.geocodeDisplayName = null;
        }
      } catch (geocodeError) {
        console.error(`Error during geocoding:`, geocodeError);
        // Clear geocoding data on error - explicitly set to null
        updateSet.lat = null;
        updateSet.lon = null;
        updateSet.geocodeDisplayName = null;
      }
    }

    // Use $set to explicitly update fields
    const result = await OcrExport.findByIdAndUpdate(
      id,
      { $set: updateSet },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

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

