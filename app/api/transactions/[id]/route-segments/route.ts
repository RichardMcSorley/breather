import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction, { ITransaction } from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { isValidObjectId } from "@/lib/validation";

type RouteSegment = NonNullable<ITransaction['routeSegments']>[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const body = await request.json();
    const { routeSegments } = body;

    if (!Array.isArray(routeSegments)) {
      return NextResponse.json({ error: "routeSegments must be an array" }, { status: 400 });
    }

    // Validate route segments structure
    for (const segment of routeSegments) {
      if (
        typeof segment.fromLat !== 'number' ||
        typeof segment.fromLon !== 'number' ||
        typeof segment.toLat !== 'number' ||
        typeof segment.toLon !== 'number' ||
        typeof segment.type !== 'string' ||
        typeof segment.fromIndex !== 'number' ||
        typeof segment.toIndex !== 'number' ||
        typeof segment.segmentHash !== 'string'
      ) {
        return NextResponse.json(
          { error: "Invalid route segment structure" },
          { status: 400 }
        );
      }
    }

    // Verify transaction exists and belongs to user
    const existingTransaction = await Transaction.findOne({
      _id: id,
      userId: session.user.id,
    }).lean();

    if (!existingTransaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Update transaction with route segments
    // We'll merge with existing segments, replacing any with matching hashes
    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Get existing segments
    const existingSegments: RouteSegment[] = (transaction.routeSegments || []) as RouteSegment[];

    // Create a map of existing segments by hash
    const existingSegmentsMap = new Map(
      existingSegments.map(seg => [seg.segmentHash, seg])
    );

    // Merge new segments with existing ones
    // New segments replace existing ones with the same hash
    const mergedSegments: RouteSegment[] = [...existingSegments];
    for (const newSegment of routeSegments) {
      const existingIndex = mergedSegments.findIndex(
        seg => seg.segmentHash === newSegment.segmentHash
      );
      
      // Add calculatedAt timestamp if not present
      const segmentWithTimestamp: RouteSegment = {
        ...newSegment,
        calculatedAt: newSegment.calculatedAt || new Date(),
      };

      if (existingIndex >= 0) {
        // Replace existing segment
        mergedSegments[existingIndex] = segmentWithTimestamp;
      } else {
        // Add new segment
        mergedSegments.push(segmentWithTimestamp);
      }
    }

    // Update transaction
    transaction.routeSegments = mergedSegments;
    await transaction.save();

    return NextResponse.json({
      success: true,
      routeSegments: mergedSegments,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

