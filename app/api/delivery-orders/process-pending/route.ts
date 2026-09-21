import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { processPendingOffers } from "@/lib/process-pending-offers";

function isAuthorized(request: NextRequest) {
  const expectedKey =
    process.env.PENDING_OCR_API_KEY ?? process.env.PAYCALC_API_KEY;
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(expectedKey && token && token === expectedKey);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const input =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const userId = typeof input.userId === "string" ? input.userId.trim() : "";
    const requestedLimit =
      typeof input.limit === "number" && Number.isFinite(input.limit)
        ? Math.floor(input.limit)
        : 1;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    await connectDB();
    const results = await processPendingOffers({
      userId,
      limit: requestedLimit,
    });
    const pending = await DeliveryOrder.countDocuments({
      userId,
      step: "OCR_PENDING",
    });

    return NextResponse.json({
      success: true,
      processed: results,
      pending,
    });
  } catch (error) {
    console.error("Pending OCR processing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
