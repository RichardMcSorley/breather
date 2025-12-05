import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { geocodeAddress } from "@/lib/geocode-helper";

const DEFAULT_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      DEFAULT_LIMIT,
      Math.max(1, Number(limitParam) || DEFAULT_LIMIT)
    );

    // Only return entries for the authenticated user
    const exportsData = await OcrExport.find({ userId: session.user.id })
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { id, appName, customerName, customerAddress, placeId, lat, lon, rawResponse, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify the entry belongs to the user
    const existingEntry = await OcrExport.findById(id).lean();
    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    if (existingEntry.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    if (typeof placeId === "string") {
      updateSet.placeId = placeId;
    }
    if (typeof lat === "number") {
      updateSet.lat = lat;
    }
    if (typeof lon === "number") {
      updateSet.lon = lon;
    }
    if (typeof rawResponse === "string") {
      updateSet.rawResponse = rawResponse;
    }
    if (typeof notes === "string" || notes === null || notes === undefined) {
      updateSet.notes = notes || null;
    }

    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // If address is updated and we don't have lat/lon from Google Places, geocode it
    if (needsGeocoding && (updateSet.lat === undefined && updateSet.lon === undefined)) {
      try {
        const geocodeData = await geocodeAddress(updateSet.customerAddress);
        if (geocodeData && geocodeData.lat != null && geocodeData.lon != null) {
          updateSet.lat = geocodeData.lat;
          updateSet.lon = geocodeData.lon;
          updateSet.geocodeDisplayName = geocodeData.displayName || null;
        } else {
          // If geocoding fails, set geocodeDisplayName to "unknown" and lat/lon to null
          updateSet.lat = null;
          updateSet.lon = null;
          updateSet.geocodeDisplayName = "unknown";
        }
      } catch (geocodeError) {
        console.error(`Error during geocoding:`, geocodeError);
        // If geocoding fails, set geocodeDisplayName to "unknown" and lat/lon to null
        updateSet.lat = null;
        updateSet.lon = null;
        updateSet.geocodeDisplayName = "unknown";
      }
    } else if (needsGeocoding && updateSet.lat !== undefined && updateSet.lon !== undefined) {
      // If we have lat/lon from Google Places, set geocodeDisplayName from the address
      updateSet.geocodeDisplayName = updateSet.customerAddress || null;
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify the entry belongs to the user before deleting
    const existingEntry = await OcrExport.findById(id).lean();
    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    if (existingEntry.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

