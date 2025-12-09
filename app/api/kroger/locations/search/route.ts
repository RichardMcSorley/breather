import { NextRequest, NextResponse } from "next/server";
import { searchLocations } from "@/lib/kroger-api";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zipCode = searchParams.get("zipCode");
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const limit = searchParams.get("limit");

    // Validate input
    if (!zipCode && (!lat || !lon)) {
      return NextResponse.json(
        { error: "Either zipCode or both lat and lon must be provided" },
        { status: 400 }
      );
    }

    const latitude = lat ? parseFloat(lat) : undefined;
    const longitude = lon ? parseFloat(lon) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    if (latitude !== undefined && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
      return NextResponse.json(
        { error: "Invalid latitude. Must be between -90 and 90" },
        { status: 400 }
      );
    }

    if (longitude !== undefined && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
      return NextResponse.json(
        { error: "Invalid longitude. Must be between -180 and 180" },
        { status: 400 }
      );
    }

    if (limitNum < 1 || limitNum > 50) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 50" },
        { status: 400 }
      );
    }

    const result = await searchLocations(
      zipCode || undefined,
      latitude,
      longitude,
      limitNum
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

