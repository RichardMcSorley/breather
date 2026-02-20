import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { randomBytes } from "crypto";
import { attemptAutoLinkOrderToTransaction } from "@/lib/auto-link-helper";
import { getCurrentESTAsUTC } from "@/lib/date-utils";
import { handleApiError } from "@/lib/api-error-handler";
import {
  evaluateOffer,
  DEFAULT_SETTINGS,
  OfferEvaluation,
} from "@/lib/calculations";

fal.config({
  credentials: process.env.FAL_KEY,
});

const SYSTEM_PROMPT = `You extract delivery offer details from text. Return ONLY valid JSON.

SCHEMA:
- pay: Total dollar amount (number) - add base + tip if separate
- pickups: Number of pickups (integer, default 1)
- drops: Number of drop-offs (integer, default 1)
- miles: Distance in miles (number)
- items: Shopping items count (integer, default 0)
- restaurants: List of restaurant names (array of strings, default [])

RULES:
- Add base pay + tip together for total pay
- "batch" or multiple orders = multiple drops
- "shop and deliver" = has items
- Only include fields you find
- Return ONLY JSON, no explanation

EXAMPLES:
Input: "$8.50 for 3 miles, Chipotle, Bob Evans"
Output: {"pay": 8.5, "miles": 3, "restaurants": ["Chipotle", "Bob Evans"]}

Input: "$24.34 batch earnings + $24.21 tip, 34.1 mi, 2 shop and deliver, 44 items, Kroger"
Output: {"pay": 48.55, "miles": 34.1, "drops": 2, "items": 44, "restaurants": ["Kroger"]}

Input: "12 bucks 2 pickups 5 miles"
Output: {"pay": 12, "pickups": 2, "miles": 5, "restaurants": []}`;

// Build compact display array for iOS shortcuts
function buildDisplay(
  parsed: {
    pay?: number;
    pickups?: number;
    drops?: number;
    miles?: number;
    items?: number;
    restaurants?: string[];
  },
  evaluation: OfferEvaluation | null,
  createdOrderId?: string
): string[] {
  const display: string[] = [];

  if (!evaluation) {
    display.push("⚠️ Could not evaluate");
    return display;
  }

  // === VERDICT ===
  display.push(
    `${evaluation.verdictEmoji} ${evaluation.verdictText} — $${evaluation.effectiveHourly.toFixed(2)}/hr`
  );

  // === OFFER ===
  const offerParts: string[] = [];
  if (parsed.pay !== undefined) offerParts.push(`$${parsed.pay.toFixed(2)}`);
  if (parsed.miles !== undefined && parsed.miles > 0)
    offerParts.push(`${parsed.miles.toFixed(1)} mi`);
  if (parsed.pickups !== undefined || parsed.drops !== undefined) {
    const p = parsed.pickups ?? 1;
    const d = parsed.drops ?? 1;
    offerParts.push(`${p}→${d}`);
  }
  if (parsed.items && parsed.items > 0)
    offerParts.push(`${parsed.items} items`);
  if (offerParts.length > 0) {
    display.push(offerParts.join(" · "));
  }

  // === TIME ===
  const totalTime = evaluation.totalMinutes;
  const timeStr =
    totalTime >= 60
      ? `${Math.floor(totalTime / 60)}h ${Math.round(totalTime % 60)}m`
      : `${Math.round(totalTime)}m`;
  display.push(`⏱ ${timeStr} to complete`);

  // === BUFFER ===
  if (parsed.miles && parsed.miles > 0) {
    const th = evaluation.thresholds;
    const currentMiles = parsed.miles;
    const hasItems = parsed.items && parsed.items > 0;

    if (evaluation.verdict === "good") {
      if (th.maxMilesBeforeBad !== null) {
        const milesBuffer = th.maxMilesBeforeBad - currentMiles;
        display.push(`To BAD: +${milesBuffer.toFixed(1)} mi`);
      }
      if (th.maxTimeBeforeBad !== null && !hasItems) {
        const maxWaitTotal =
          th.maxTimeBeforeBad -
          evaluation.totalMinutes +
          DEFAULT_SETTINGS.extraWaitTime;
        display.push(`Max wait: ${Math.round(maxWaitTotal)}m total`);
      }
    } else if (evaluation.verdict === "decent") {
      if (th.maxMilesForGood !== null) {
        const milesToGood = th.maxMilesForGood - currentMiles;
        display.push(`To GOOD: ${milesToGood.toFixed(1)} mi`);
      }
      if (th.maxMilesBeforeBad !== null) {
        const milesToBad = th.maxMilesBeforeBad - currentMiles;
        display.push(`To BAD: +${milesToBad.toFixed(1)} mi`);
        if (th.maxTimeBeforeBad !== null && !hasItems) {
          const maxWaitTotal =
            th.maxTimeBeforeBad -
            evaluation.totalMinutes +
            DEFAULT_SETTINGS.extraWaitTime;
          display.push(`Max wait: ${Math.round(maxWaitTotal)}m total`);
        }
      }
    } else {
      const milesToDecent = th.maxMilesForDecent - currentMiles;
      display.push(`To DECENT: ${milesToDecent.toFixed(1)} mi`);
      if (th.canBeGood && th.maxMilesForGood !== null) {
        const milesToGood = th.maxMilesForGood - currentMiles;
        display.push(`To GOOD: ${milesToGood.toFixed(1)} mi`);
      }
    }
  }

  // === LIMITS (when no miles) ===
  if (!parsed.miles || parsed.miles === 0) {
    display.push(`Max ${evaluation.maxMiles.toFixed(1)} mi`);
    display.push(`Max ${evaluation.maxItems} items`);
  }

  // === ACTION ===
  if (createdOrderId) {
    display.push("Tally Offer");
    display.push(createdOrderId);
  }

  // === URL ===
  const params = new URLSearchParams();
  if (parsed.pay !== undefined) params.set("pay", String(parsed.pay));
  if (parsed.pickups !== undefined)
    params.set("pickups", String(parsed.pickups));
  if (parsed.drops !== undefined) params.set("drops", String(parsed.drops));
  if (parsed.miles !== undefined) params.set("miles", String(parsed.miles));
  if (parsed.items !== undefined) params.set("items", String(parsed.items));
  display.push(`https://paycalc-psi.vercel.app/?${params.toString()}`);

  return display;
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  return NextResponse.json(
    {
      usage: "POST OCR text to parse and evaluate delivery offers",
      method: "POST",
      body: {
        text: "OCR text from delivery app screenshot",
        userId: "optional - stores offer in DB",
        appName: "optional - delivery app name (UberEats, DoorDash, GrubHub)",
        date: "optional - ISO date string",
      },
    },
    { headers: corsHeaders }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { text, userId, appName, date } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Parse OCR text with FAL AI (openrouter/router → Gemini Flash)
    const result = await fal.subscribe("openrouter/router", {
      input: {
        prompt: `${SYSTEM_PROMPT}\n\nInput: "${text}"\nOutput:`,
        model: "google/gemini-3-flash-preview",
      },
    });

    const output = (result.data as { output?: string })?.output || "";

    // Extract JSON from response
    let parsed: {
      pay?: number;
      pickups?: number;
      drops?: number;
      miles?: number;
      items?: number;
      restaurants?: string[];
    } = {};
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return NextResponse.json(
        { raw: output, error: "Could not parse response" },
        { headers: corsHeaders }
      );
    }

    // Evaluate offer
    let evaluation: OfferEvaluation | null = null;
    if (parsed.pay !== undefined && parsed.pay > 0) {
      evaluation = evaluateOffer(
        {
          pay: parsed.pay,
          pickups: parsed.pickups,
          drops: parsed.drops,
          miles: parsed.miles,
          items: parsed.items,
        },
        DEFAULT_SETTINGS
      );
    }

    let createdOrderId: string | undefined;

    // Store in DB if userId and appName provided
    if (userId && appName && evaluation) {
      try {
        await connectDB();

        const entryId = randomBytes(16).toString("hex");
        const { date: processedAtDate } = getCurrentESTAsUTC();

        const parsedMoney = parsed.pay;
        const parsedMiles = parsed.miles;
        const milesToMoneyRatio =
          parsedMiles && parsedMiles > 0 && parsedMoney !== undefined
            ? parsedMoney / parsedMiles
            : undefined;

        const restaurantName =
          parsed.restaurants && parsed.restaurants.length > 0
            ? parsed.restaurants[0]
            : "";

        const parsedRestaurants = (parsed.restaurants ?? []).map((r) => ({
          restaurantName: r,
        }));

        const deliveryOrder = await DeliveryOrder.create({
          entryId,
          userId,
          appName: appName.trim(),
          ...(parsedMiles !== undefined && { miles: parsedMiles }),
          ...(parsedMoney !== undefined && { money: parsedMoney }),
          ...(milesToMoneyRatio !== undefined && { milesToMoneyRatio }),
          restaurantName,
          time: "",
          metadata: {
            source: "offer-api",
            ocrText: text,
            extractedData: {
              restaurants:
                parsedRestaurants.length > 0 ? parsedRestaurants : undefined,
              ...(parsed.drops !== undefined && { drops: parsed.drops }),
              ...(parsed.pickups !== undefined && { pickups: parsed.pickups }),
              ...(parsed.items !== undefined && { items: parsed.items }),
            },
          },
          processedAt: date ? new Date(date) : processedAtDate,
          step: "CREATED",
          active: false,
          ...(parsedRestaurants.length > 1 && {
            additionalRestaurants: parsedRestaurants.slice(1).map((r) => ({
              name: r.restaurantName,
            })),
          }),
        });

        createdOrderId = deliveryOrder._id?.toString();

        try {
          await attemptAutoLinkOrderToTransaction(deliveryOrder, userId);
        } catch (autoLinkError) {
          console.error("Auto-linking error:", autoLinkError);
        }
      } catch (dbError) {
        console.error("DB storage error:", dbError);
        // Don't fail the request — parsing + evaluation still succeeded
      }
    }

    // Build display (include Tally Order id when an order is created)
    const display = buildDisplay(parsed, evaluation, createdOrderId);

    // Build URL
    const params = new URLSearchParams();
    if (parsed.pay !== undefined) params.set("pay", String(parsed.pay));
    if (parsed.pickups !== undefined)
      params.set("pickups", String(parsed.pickups));
    if (parsed.drops !== undefined) params.set("drops", String(parsed.drops));
    if (parsed.miles !== undefined) params.set("miles", String(parsed.miles));
    if (parsed.items !== undefined) params.set("items", String(parsed.items));
    if (parsed.restaurants && parsed.restaurants.length > 0)
      params.set("restaurants", parsed.restaurants.join(","));
    const url = `https://paycalc-psi.vercel.app/?${params.toString()}`;

    return NextResponse.json(
      {
        parsed,
        evaluation,
        display,
        summary: evaluation?.summary || "Could not evaluate offer",
        url,
        pay: parsed.pay,
        miles: parsed.miles,
        pickups: parsed.pickups,
        restaurants: parsed.restaurants,
        createdOrderId,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Offer API error:", error);
    return handleApiError(error);
  }
}
