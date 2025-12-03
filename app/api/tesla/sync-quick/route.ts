/**
 * NOTE: This API route has no references in the codebase but is used externally by the user's mobile app.
 * Allows syncing Tesla mileage by providing userId without requiring active session.
 */
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import TeslaConnection from "@/lib/models/TeslaConnection";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";
import {
  getVehicleData,
  getOdometerFromVehicleData,
  refreshAccessToken,
} from "@/lib/tesla-api";
import { decryptToken, encryptToken } from "@/lib/tesla-encryption";
import { formatDateAsUTC, parseDateOnlyAsEST, getCurrentESTAsUTC } from "@/lib/date-utils";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get user's Tesla connection
    const connection = await TeslaConnection.findOne({ userId });

    if (!connection) {
      return NextResponse.json({ error: "No Tesla connection found" }, { status: 404 });
    }

    // Decrypt tokens
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.encryptedAccessToken);
    } catch (error) {
      return NextResponse.json({ error: "Failed to decrypt access token" }, { status: 500 });
    }

    // Fetch vehicle data
    let vehicleData;
    try {
      vehicleData = await getVehicleData(connection.vehicleTag, accessToken, true);
    } catch (error) {
      // If token expired, try to refresh
      if (error instanceof Error && error.message.includes("expired")) {
        try {
          const refreshToken = decryptToken(connection.encryptedRefreshToken);
          const tokenResponse = await refreshAccessToken(refreshToken);

          // Update stored tokens
          connection.encryptedAccessToken = encryptToken(tokenResponse.access_token);
          connection.encryptedRefreshToken = encryptToken(tokenResponse.refresh_token);
          await connection.save();

          // Retry with new token
          accessToken = tokenResponse.access_token;
          vehicleData = await getVehicleData(connection.vehicleTag, accessToken, true);
        } catch (refreshError) {
          return NextResponse.json(
            { error: "Failed to refresh access token. Please reconnect your Tesla account." },
            { status: 401 }
          );
        }
      } else {
        throw error;
      }
    }

    // Extract odometer reading
    const odometerRaw = getOdometerFromVehicleData(vehicleData);

    if (odometerRaw === null) {
      return NextResponse.json({ error: "Odometer data not available" }, { status: 400 });
    }

    // Round to nearest whole number
    const odometer = Math.round(odometerRaw);

    // Get user's settings to determine default carId (needed before checking last entry)
    const { default: UserSettings } = await import("@/lib/models/UserSettings");
    const settings = await UserSettings.findOne({ userId }).lean();
    const cars = settings?.cars || [];
    
    // Try to match Tesla vehicle name to user's carId, or use first car, or vehicle name
    let carId = connection.vehicleName;
    if (cars.length > 0) {
      // Try to find matching car by name
      const matchingCar = cars.find(car => 
        car.toLowerCase().includes(connection.vehicleName.toLowerCase()) ||
        connection.vehicleName.toLowerCase().includes(car.toLowerCase())
      );
      carId = matchingCar || cars[0];
    }

    // Get the most recent mileage entry for this user AND this specific car
    const lastEntry = await Mileage.findOne({ 
      userId,
      carId: carId 
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Check if odometer has increased (with 0.1 mile threshold to avoid duplicates)
    const threshold = 0.1;
    let shouldCreateEntry = true;

    if (lastEntry) {
      const odometerDiff = odometer - lastEntry.odometer;
      if (odometerDiff < threshold) {
        shouldCreateEntry = false;
      }
    }

    let mileageEntry = null;
    if (shouldCreateEntry) {

      // Create mileage entry with today's date (using EST timezone to match transaction logs)
      const { estDateString } = getCurrentESTAsUTC();
      const todayEST = parseDateOnlyAsEST(estDateString);

      mileageEntry = await Mileage.create({
        userId,
        odometer: odometer,
        date: todayEST,
        classification: "work", // Default to work, user can change later
        carId: carId,
        notes: `Synced from Tesla (${connection.vehicleName})`,
      });
    }

    // Update last synced timestamp
    connection.lastSyncedAt = new Date();
    await connection.save();

    return NextResponse.json({
      success: true,
      odometer,
      entryCreated: shouldCreateEntry,
      mileageEntry: mileageEntry
        ? {
            _id: mileageEntry._id.toString(),
            odometer: mileageEntry.odometer,
            date: formatDateAsUTC(new Date(mileageEntry.date)),
            classification: mileageEntry.classification,
            carId: mileageEntry.carId,
            notes: mileageEntry.notes,
          }
        : null,
      message: shouldCreateEntry
        ? `Mileage entry created: ${odometer.toLocaleString()} miles`
        : `No new entry created. Odometer: ${odometer.toLocaleString()} miles (change < ${threshold} miles)`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
