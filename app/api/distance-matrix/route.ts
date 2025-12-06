import { NextRequest, NextResponse } from "next/server";
import { getDistanceAndDuration } from "@/lib/distance-matrix-helper";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = searchParams.get("originLat");
    const originLon = searchParams.get("originLon");
    const destinationLat = searchParams.get("destinationLat");
    const destinationLon = searchParams.get("destinationLon");

    if (!originLat || !originLon || !destinationLat || !destinationLon) {
      return NextResponse.json(
        { error: "Missing required parameters: originLat, originLon, destinationLat, destinationLon" },
        { status: 400 }
      );
    }

    const originLatNum = parseFloat(originLat);
    const originLonNum = parseFloat(originLon);
    const destinationLatNum = parseFloat(destinationLat);
    const destinationLonNum = parseFloat(destinationLon);

    if (
      isNaN(originLatNum) ||
      isNaN(originLonNum) ||
      isNaN(destinationLatNum) ||
      isNaN(destinationLonNum)
    ) {
      return NextResponse.json(
        { error: "Invalid coordinate values" },
        { status: 400 }
      );
    }

    const result = await getDistanceAndDuration(
      originLatNum,
      originLonNum,
      destinationLatNum,
      destinationLonNum
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to calculate distance and duration" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      distanceMiles: result.distanceMiles,
      durationText: result.durationText,
      durationSeconds: result.durationSeconds,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
