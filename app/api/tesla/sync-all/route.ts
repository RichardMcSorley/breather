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
import { formatDateAsUTC, parseDateOnlyAsUTC } from "@/lib/date-utils";
import UserSettings from "@/lib/models/UserSettings";

export const dynamic = 'force-dynamic';

interface SyncResult {
  userId: string;
  vehicleName: string;
  success: boolean;
  odometer?: number;
  entryCreated?: boolean;
  error?: string;
}

async function syncUserTesla(connection: any): Promise<SyncResult> {
  const result: SyncResult = {
    userId: connection.userId,
    vehicleName: connection.vehicleName,
    success: false,
  };

  try {
    // Decrypt tokens
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.encryptedAccessToken);
    } catch (error) {
      result.error = "Failed to decrypt access token";
      return result;
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
          result.error = "Failed to refresh access token";
          return result;
        }
      } else {
        result.error = error instanceof Error ? error.message : "Failed to fetch vehicle data";
        return result;
      }
    }

    // Extract odometer reading
    const odometer = getOdometerFromVehicleData(vehicleData);
    result.odometer = odometer;

    if (odometer === null) {
      result.error = "Odometer data not available";
      return result;
    }

    // Get the most recent mileage entry for this user
    const lastEntry = await Mileage.findOne({ userId: connection.userId })
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

    result.entryCreated = shouldCreateEntry;

    if (shouldCreateEntry) {
      // Get user's settings to determine default carId
      const settings = await UserSettings.findOne({ userId: connection.userId }).lean();
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

      // Create mileage entry with today's date
      const today = new Date();
      const todayUTC = parseDateOnlyAsUTC(formatDateAsUTC(today));

      await Mileage.create({
        userId: connection.userId,
        odometer: odometer,
        date: todayUTC,
        classification: "work", // Default to work, user can change later
        carId: carId,
        notes: `Synced from Tesla (${connection.vehicleName})`,
      });
    }

    // Update last synced timestamp
    connection.lastSyncedAt = new Date();
    await connection.save();

    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require API key for security
    const apiKey = request.headers.get("x-api-key");
    const expectedApiKey = process.env.TESLA_SYNC_ALL_API_KEY;
    
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json({ 
        error: "Unauthorized. Provide x-api-key header." 
      }, { status: 401 });
    }

    await connectDB();

    // Get all Tesla connections
    const connections = await TeslaConnection.find({}).lean();

    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No Tesla connections found",
        results: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          entriesCreated: 0,
        },
      });
    }

    // Sync each connection
    const results: SyncResult[] = [];
    for (const connectionData of connections) {
      // Convert lean document back to model instance for saving
      const connection = await TeslaConnection.findById(connectionData._id);
      if (!connection) continue;

      const result = await syncUserTesla(connection);
      results.push(result);
    }

    // Calculate summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const entriesCreated = results.filter(r => r.entryCreated).length;

    return NextResponse.json({
      success: true,
      message: `Synced ${successful} of ${results.length} Tesla connections`,
      results,
      summary: {
        total: results.length,
        successful,
        failed,
        entriesCreated,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
