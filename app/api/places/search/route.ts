import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/google-places-helper";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const lat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : undefined;
    const lon = searchParams.get("lon") ? parseFloat(searchParams.get("lon")!) : undefined;
    const radius = searchParams.get("radius") ? parseInt(searchParams.get("radius")!, 10) : 5000;
    const type = searchParams.get("type") || undefined; // Optional type filter (e.g., "restaurant")

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    const results = await searchPlaces(query, lat, lon, radius, type);

    return NextResponse.json({
      results,
      success: true,
    });
  } catch (error) {
    console.error("Places search error:", error);
    return handleApiError(error);
  }
}

