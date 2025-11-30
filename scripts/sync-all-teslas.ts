#!/usr/bin/env node

/**
 * Standalone script to sync all user Teslas
 * This script can be run directly without requiring the Next.js server
 * 
 * Usage:
 *   npx tsx scripts/sync-all-teslas.ts
 *   or
 *   node --loader ts-node/esm scripts/sync-all-teslas.ts
 * 
 * Environment variables required:
 *   - MONGODB_URI: MongoDB connection string
 *   - TESLA_ENCRYPTION_KEY: Key for decrypting Tesla tokens
 *   - TESLA_CLIENT_ID: Tesla API client ID
 *   - TESLA_CLIENT_SECRET: Tesla API client secret
 *   - TESLA_API_BASE_URL: Tesla API base URL (optional)
 * 
 * Example cron entry (runs daily at 2 AM):
 *   0 2 * * * cd /path/to/project && npx tsx scripts/sync-all-teslas.ts >> /var/log/tesla-sync.log 2>&1
 */

import mongoose from "mongoose";
import TeslaConnection from "../lib/models/TeslaConnection";
import Mileage from "../lib/models/Mileage";
import UserSettings from "../lib/models/UserSettings";
import {
  getVehicleData,
  getOdometerFromVehicleData,
  refreshAccessToken,
} from "../lib/tesla-api";
import { decryptToken, encryptToken } from "../lib/tesla-encryption";
import { formatDateAsUTC, parseDateOnlyAsUTC } from "../lib/date-utils";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI environment variable is not set");
  process.exit(1);
}

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

async function main() {
  try {
    console.log(`${new Date().toISOString()}: Starting Tesla sync for all users...`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("Connected to MongoDB");

    // Get all Tesla connections
    const connections = await TeslaConnection.find({});

    if (connections.length === 0) {
      console.log("No Tesla connections found");
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found ${connections.length} Tesla connection(s)`);

    // Sync each connection
    const results: SyncResult[] = [];
    for (const connection of connections) {
      console.log(`Syncing Tesla for user ${connection.userId} (${connection.vehicleName})...`);
      const result = await syncUserTesla(connection);
      results.push(result);
      
      if (result.success) {
        console.log(`  ✅ Success: ${result.odometer?.toLocaleString()} miles${result.entryCreated ? ' (entry created)' : ''}`);
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
      }
    }

    // Calculate summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const entriesCreated = results.filter(r => r.entryCreated).length;

    console.log("\n=== Summary ===");
    console.log(`Total: ${results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Entries created: ${entriesCreated}`);

    await mongoose.disconnect();
    console.log("\nSync completed successfully");
    
    // Exit with error code if any failed
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("Fatal error:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
