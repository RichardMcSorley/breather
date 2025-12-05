import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import StreetViewCache from "@/lib/models/StreetViewCache";

/**
 * Generate a Google Street View static image URL (server-side)
 * This keeps the API key secure on the server
 * Results are cached to reduce API calls
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const width = searchParams.get("width") ? parseInt(searchParams.get("width")!, 10) : 300;
    const height = searchParams.get("height") ? parseInt(searchParams.get("height")!, 10) : 200;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_API_KEY is not configured", url: null },
        { status: 500 }
      );
    }

    // Prefer coordinates if available (more accurate)
    let location: string | null = null;
    let latNum: number | undefined;
    let lonNum: number | undefined;
    
    if (lat && lon && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lon))) {
      latNum = parseFloat(lat);
      lonNum = parseFloat(lon);
      location = `${latNum},${lonNum}`;
    } else if (address && address.trim()) {
      location = address.trim();
    } else {
      return NextResponse.json(
        { error: "Missing address or coordinates", url: null },
        { status: 400 }
      );
    }

    // Check cache first
    try {
      await connectDB();
      
      const cacheQuery: any = {
        location: location,
        width: width,
        height: height,
      };
      
      if (latNum !== undefined && lonNum !== undefined) {
        cacheQuery.lat = latNum;
        cacheQuery.lon = lonNum;
      } else {
        cacheQuery.lat = { $exists: false };
        cacheQuery.lon = { $exists: false };
      }
      
      if (address) {
        cacheQuery.address = address.trim();
      } else {
        cacheQuery.address = { $exists: false };
      }

      const cachedResult = await StreetViewCache.findOne(cacheQuery).lean();
      
      if (cachedResult && cachedResult.url) {
        console.log(`Using cached Street View URL for location: "${location}"`);
        return NextResponse.json({ url: cachedResult.url });
      }
    } catch (cacheError) {
      console.warn('Cache lookup error (continuing with URL generation):', cacheError);
    }

    // If not in cache, generate URL
    const encodedLocation = latNum !== undefined && lonNum !== undefined 
      ? `${latNum},${lonNum}` 
      : encodeURIComponent(location);
    
    const url = `https://maps.googleapis.com/maps/api/streetview?size=${width}x${height}&location=${encodedLocation}&key=${apiKey}`;

    // Cache the result
    try {
      const cacheData: any = {
        location: location,
        width: width,
        height: height,
        url: url,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      };
      if (address) cacheData.address = address.trim();
      if (latNum !== undefined) cacheData.lat = latNum;
      if (lonNum !== undefined) cacheData.lon = lonNum;
      await StreetViewCache.create(cacheData);
      console.log(`Cached Street View URL for location: "${location}"`);
    } catch (cacheError) {
      console.warn('Failed to cache Street View URL:', cacheError);
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Street View URL generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate Street View URL", url: null },
      { status: 500 }
    );
  }
}

