import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import TeslaConnection from "@/lib/models/TeslaConnection";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const connection = await TeslaConnection.findOne({ userId: session.user.id }).lean();

    if (!connection) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      vehicleName: connection.vehicleName,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() || null,
    });
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

    await TeslaConnection.deleteOne({ userId: session.user.id });

    return NextResponse.json({ success: true, message: "Tesla connection removed" });
  } catch (error) {
    return handleApiError(error);
  }
}

