import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import TeslaConnection from "@/lib/models/TeslaConnection";
import { handleApiError } from "@/lib/api-error-handler";
import {
  startClimate,
  stopClimate,
  setTemps,
  setSeatHeater,
  wakeVehicle,
  getVehicleData,
  refreshAccessToken,
} from "@/lib/tesla-api";
import { decryptToken, encryptToken } from "@/lib/tesla-encryption";

export const dynamic = "force-dynamic";

async function getAccessToken(connection: any): Promise<string> {
  let accessToken = decryptToken(connection.encryptedAccessToken);

  // Test if token works by trying to get vehicle data
  try {
    await getVehicleData(connection.vehicleTag, accessToken, false);
  } catch (error) {
    if (error instanceof Error && error.message.includes("expired")) {
      const refreshToken = decryptToken(connection.encryptedRefreshToken);
      const tokenResponse = await refreshAccessToken(refreshToken);
      connection.encryptedAccessToken = encryptToken(tokenResponse.access_token);
      connection.encryptedRefreshToken = encryptToken(tokenResponse.refresh_token);
      await connection.save();
      accessToken = tokenResponse.access_token;
    } else {
      throw error;
    }
  }

  return accessToken;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const connection = await TeslaConnection.findOne({ userId: session.user.id });
    if (!connection) {
      return NextResponse.json({ error: "No Tesla connection found" }, { status: 404 });
    }

    const body = await request.json();
    const { action, driverTemp, passengerTemp, seat, level } = body;

    const accessToken = await getAccessToken(connection);

    // Wake vehicle first
    try {
      await wakeVehicle(connection.vehicleTag, accessToken);
    } catch (e) {
      // Already awake is fine
    }

    let result;

    switch (action) {
      case "start":
        if (driverTemp) {
          await setTemps(connection.vehicleTag, accessToken, driverTemp, passengerTemp);
        }
        result = await startClimate(connection.vehicleTag, accessToken);
        return NextResponse.json({
          success: true,
          message: `Climate started${driverTemp ? ` at ${driverTemp}°C` : ""}`,
          result,
        });

      case "stop":
        result = await stopClimate(connection.vehicleTag, accessToken);
        return NextResponse.json({
          success: true,
          message: "Climate stopped",
          result,
        });

      case "set_temp":
        if (!driverTemp) {
          return NextResponse.json({ error: "driverTemp required" }, { status: 400 });
        }
        result = await setTemps(connection.vehicleTag, accessToken, driverTemp, passengerTemp);
        return NextResponse.json({
          success: true,
          message: `Temperature set to ${driverTemp}°C`,
          result,
        });

      case "seat_heater":
        if (seat === undefined || level === undefined) {
          return NextResponse.json({ error: "seat and level required" }, { status: 400 });
        }
        result = await setSeatHeater(connection.vehicleTag, accessToken, seat, level);
        return NextResponse.json({
          success: true,
          message: `Seat ${seat} heater set to level ${level}`,
          result,
        });

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: start, stop, set_temp, seat_heater" },
          { status: 400 }
        );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET — return current climate state from vehicle data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const connection = await TeslaConnection.findOne({ userId: session.user.id });
    if (!connection) {
      return NextResponse.json({ error: "No Tesla connection found" }, { status: 404 });
    }

    const accessToken = await getAccessToken(connection);
    const vehicleData = await getVehicleData(connection.vehicleTag, accessToken, true);

    return NextResponse.json({
      climate: vehicleData.response.climate_state,
      state: vehicleData.response.state,
      vehicleName: connection.vehicleName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
