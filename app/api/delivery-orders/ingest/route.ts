import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { randomBytes } from "crypto";

/**
 * POST /api/delivery-orders/ingest
 * 
 * Server-to-server endpoint for PayCalc to send OCR-extracted delivery offer data.
 * Authenticated via PAYCALC_API_KEY shared secret (no user session required).
 * 
 * Body: {
 *   pay: number,
 *   miles?: number,
 *   pickups?: number,
 *   drops?: number,
 *   items?: number,
 *   restaurants?: string[],
 *   appName?: string,
 *   source?: string,       // e.g. "paycalc-vision", "paycalc-ios-shortcut"
 *   evaluation?: object,   // the full evaluation result from PayCalc
 * }
 */

const PAYCALC_API_KEY = process.env.PAYCALC_API_KEY;
// Default userId for PayCalc-ingested orders (Richard's user ID)
const DEFAULT_USER_ID = process.env.DEFAULT_DELIVERY_USER_ID || "paycalc-ingest";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate via API key
    if (!PAYCALC_API_KEY) {
      return NextResponse.json(
        { error: "PAYCALC_API_KEY not configured on server" },
        { status: 500, headers: corsHeaders }
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token !== PAYCALC_API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    await connectDB();

    const body = await request.json();
    const { pay, miles, pickups, drops, items, restaurants, appName, source, evaluation } = body;

    if (!pay || isNaN(Number(pay)) || Number(pay) <= 0) {
      return NextResponse.json(
        { error: "Invalid or missing pay amount" },
        { status: 400, headers: corsHeaders }
      );
    }

    const entryId = randomBytes(16).toString("hex");
    const moneyNum = Number(pay);
    const milesNum = miles !== undefined && miles !== null ? Number(miles) : undefined;
    const milesToMoneyRatio =
      milesNum !== undefined && milesNum > 0 ? moneyNum / milesNum : undefined;

    // Primary restaurant name
    const restaurantName =
      Array.isArray(restaurants) && restaurants.length > 0
        ? restaurants[0]
        : "Unknown";

    // Additional restaurants (if multi-pickup)
    const additionalRestaurants =
      Array.isArray(restaurants) && restaurants.length > 1
        ? restaurants.slice(1).map((name: string) => ({ name }))
        : undefined;

    const now = new Date();

    const deliveryOrder = await DeliveryOrder.create({
      entryId,
      userId: DEFAULT_USER_ID,
      appName: appName?.trim() || undefined,
      miles: milesNum,
      money: moneyNum,
      milesToMoneyRatio,
      restaurantName,
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      }),
      processedAt: now,
      step: "OFFER_INGESTED",
      active: false,
      metadata: {
        source: source || "paycalc",
        pickups: pickups ?? undefined,
        drops: drops ?? undefined,
        items: items ?? undefined,
        evaluation: evaluation ?? undefined,
        ingestedAt: now.toISOString(),
      },
      ...(additionalRestaurants && { additionalRestaurants }),
    });

    return NextResponse.json(
      {
        success: true,
        id: deliveryOrder._id.toString(),
        entryId: deliveryOrder.entryId,
        message: "Delivery offer ingested from PayCalc",
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("PayCalc ingest error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
