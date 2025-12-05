import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { isSameAddress } from "@/lib/ocr-analytics";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
    }

    // Find the first entry with this address to get notes
    const allEntries = await OcrExport.find({ userId: session.user.id }).lean();
    const matchingEntry = allEntries.find((entry) =>
      isSameAddress(entry.customerAddress, address)
    );

    return NextResponse.json({
      notes: matchingEntry?.notes || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { address, notes } = body;

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    // Get all entries for this user
    const allEntries = await OcrExport.find({ userId: session.user.id }).lean();

    // Find all entries with matching address
    const matchingEntries = allEntries.filter((entry) =>
      isSameAddress(entry.customerAddress, address)
    );

    if (matchingEntries.length === 0) {
      return NextResponse.json({ error: "No entries found for this address" }, { status: 404 });
    }

    // Update notes for all matching entries
    const entryIds = matchingEntries.map((e) => e._id);
    const result = await OcrExport.updateMany(
      { _id: { $in: entryIds }, userId: session.user.id },
      { $set: { notes: notes || null } }
    );

    return NextResponse.json({
      success: true,
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

