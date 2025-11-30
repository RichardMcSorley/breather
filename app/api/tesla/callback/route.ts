import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import TeslaConnection from "@/lib/models/TeslaConnection";
import { handleApiError } from "@/lib/api-error-handler";
import { exchangeCodeForTokens, getVehicles } from "@/lib/tesla-api";
import { encryptToken } from "@/lib/tesla-encryption";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL(`/configuration?tesla_error=${encodeURIComponent(errorDescription || error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/configuration?tesla_error=missing_authorization_code", request.url)
      );
    }

    await connectDB();

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForTokens(code);

    // Get user's vehicles
    const vehicles = await getVehicles(tokenResponse.access_token);

    if (vehicles.length === 0) {
      return NextResponse.redirect(
        new URL("/configuration?tesla_error=no_vehicles_found", request.url)
      );
    }

    // Use the first vehicle (users can only connect one vehicle per account for now)
    const vehicle = vehicles[0];
    const vehicleTag = vehicle.id_s || vehicle.vin;

    // Check if user already has a connection
    const existingConnection = await TeslaConnection.findOne({ userId: session.user.id });

    if (existingConnection) {
      // Update existing connection
      existingConnection.encryptedAccessToken = encryptToken(tokenResponse.access_token);
      existingConnection.encryptedRefreshToken = encryptToken(tokenResponse.refresh_token);
      existingConnection.vehicleTag = vehicleTag;
      existingConnection.vehicleName = vehicle.display_name || "Tesla";
      await existingConnection.save();
    } else {
      // Create new connection
      await TeslaConnection.create({
        userId: session.user.id,
        encryptedAccessToken: encryptToken(tokenResponse.access_token),
        encryptedRefreshToken: encryptToken(tokenResponse.refresh_token),
        vehicleTag: vehicleTag,
        vehicleName: vehicle.display_name || "Tesla",
      });
    }

    return NextResponse.redirect(new URL("/configuration?tesla_connected=true", request.url));
  } catch (error) {
    console.error("Tesla OAuth callback error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/configuration?tesla_error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}

