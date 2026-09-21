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
import {
  classifyOcrOfferWithJev,
  evaluateOfferWithJev,
} from "@/lib/jev-offer-evaluator";
import {
  classificationFromAnswers,
  evaluateJevPolicy,
  type JevPolicyEvaluation,
} from "@/lib/jev-rule-engine";
import { extractRegexOfferCandidates } from "@/lib/ocr-offer-extractor";
import { resolveRegexOfferCandidates } from "@/lib/ocr-offer-resolution";

type JevEvaluation = Awaited<ReturnType<typeof evaluateOfferWithJev>>;

fal.config({ credentials: process.env.FAL_KEY });

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

function buildPendingDisplay(
  pay: number,
  miles: number,
  payEstimated: boolean,
  fastEvaluation: JevPolicyEvaluation,
  slowEvaluation: JevPolicyEvaluation,
  offerEstimate: OfferEvaluation,
  pickups: number | undefined,
  drops: number | undefined,
  items: number | undefined,
  orderKind: string,
  createdOrderId?: string,
) {
  let decisionLabel = "REVIEW";
  if (
    fastEvaluation.decision === "accept" &&
    slowEvaluation.decision === "accept"
  ) {
    decisionLabel = "TAKE IT";
  } else if (
    fastEvaluation.decision === "decline" &&
    slowEvaluation.decision === "decline"
  ) {
    decisionLabel = "PASS";
  } else if (
    fastEvaluation.decision === "decline" &&
    slowEvaluation.decision === "accept"
  ) {
    decisionLabel = "ACCEPT IF SLOW";
  } else if (
    fastEvaluation.decision === "accept" &&
    slowEvaluation.decision === "decline"
  ) {
    decisionLabel = "ACCEPT IF FAST";
  }
  const payPerMile = miles > 0 ? pay / miles : null;
  let reason = "Use current order speed before accepting.";
  if (fastEvaluation.decision === slowEvaluation.decision) {
    reason = slowEvaluation.reason;
  } else if (
    fastEvaluation.decision === "decline" &&
    slowEvaluation.decision === "accept"
  ) {
    reason =
      "Slow conditions pass the lower $5 threshold; fast conditions require $7.";
  } else if (
    fastEvaluation.decision === "accept" &&
    slowEvaluation.decision === "decline"
  ) {
    reason = "Fast conditions pass the higher $7 threshold.";
  }
  const work = [
    `${pickups ?? 1} pickup${pickups === 1 ? "" : "s"}`,
    `${drops ?? 1} dropoff${drops === 1 ? "" : "s"}`,
    `${orderKind.replaceAll("_", " ")}`,
  ];
  if (items !== undefined && items > 0) work.push(`${items} items`);

  const display = [
    `Fast: ${fastEvaluation.decision} · Slow: ${slowEvaluation.decision}`,
    `Verdict: ${decisionLabel}`,
    `Why: ${reason}`,
    `Offer: $${pay.toFixed(2)} · ${miles.toFixed(1)} mi${
      payPerMile === null ? "" : ` · $${payPerMile.toFixed(2)}/mi`
    }`,
    `Work: ${work.join(" · ")}`,
    `Estimate: ${Math.round(offerEstimate.totalMinutes)} min · $${offerEstimate.effectiveHourly.toFixed(2)}/hr`,
    `${payEstimated ? "Estimated pay" : "Pay"}: $${pay.toFixed(2)}${
      payEstimated ? " (OCR pending)" : ""
    }`,
  ];

  if (createdOrderId) {
    display.push("Tally Offer");
    display.push(createdOrderId);
  }

  return display;
}

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
  createdOrderId?: string,
  jev: JevEvaluation = null,
): string[] {
  const display: string[] = [];

  if (!evaluation) {
    const jevAcceptance = jev?.answers.acceptance;
    if (jevAcceptance?.type === "choice") {
      const confidence =
        jevAcceptance.confidence !== undefined
          ? ` (${Math.round(jevAcceptance.confidence * 100)}% confidence)`
          : "";
      display.push(`Jev: ${jevAcceptance.choice}${confidence}`);
      display.push("Calculator: exact offer fields unavailable");
    } else {
      display.push("⚠️ Could not evaluate");
    }
    return display;
  }

  // === VERDICT ===
  display.push(
    `${evaluation.verdictEmoji} ${evaluation.verdictText} — $${evaluation.effectiveHourly.toFixed(2)}/hr`,
  );

  const jevAcceptance = jev?.answers.acceptance;
  if (jevAcceptance?.type === "choice") {
    const confidence =
      jevAcceptance.confidence !== undefined
        ? ` (${Math.round(jevAcceptance.confidence * 100)}% confidence)`
        : "";
    display.push(`Jev: ${jevAcceptance.choice}${confidence}`);
  }

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
  "Access-Control-Allow-Origin":
    process.env.OFFER_CORS_ORIGIN ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000",
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
    { headers: corsHeaders },
  );
}

export async function POST(request: NextRequest) {
  try {
    const {
      text,
      userId,
      appName,
      date,
      mode = "jev_pending",
    } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Jev mode resolves regex candidates immediately and falls back to conservative bands.
    if (mode !== "calculator") {
      if (!process.env.OPENROUTER_API_KEY) {
        return NextResponse.json(
          { error: "OPENROUTER_API_KEY not configured" },
          { status: 500, headers: corsHeaders },
        );
      }

      const candidates = extractRegexOfferCandidates(text, appName);
      const jev = await classifyOcrOfferWithJev({
        ocrText: text,
        candidates,
      });
      if (!jev) {
        return NextResponse.json(
          { error: "Jev classification failed" },
          { status: 502, headers: corsHeaders },
        );
      }

      const classification = classificationFromAnswers(jev.answers);
      const resolved = resolveRegexOfferCandidates(
        candidates,
        jev.answers,
        classification,
      );
      const confirmedFacts = {
        pay: resolved.payEstimated ? undefined : resolved.pay,
        miles: resolved.milesEstimated ? undefined : resolved.miles,
        pickups:
          resolved.validation.pickups.source === "regex"
            ? resolved.pickups
            : undefined,
        drops:
          resolved.validation.drops.source === "regex"
            ? resolved.drops
            : undefined,
        items:
          resolved.validation.items.source === "regex"
            ? resolved.items
            : undefined,
      };
      // Fast market requires $7 base threshold; slow market permits $5.
      const fastEvaluation = evaluateJevPolicy(
        classification,
        7,
        confirmedFacts,
      );
      const slowEvaluation = evaluateJevPolicy(
        classification,
        5,
        confirmedFacts,
      );
      const offerEstimate = evaluateOffer(
        {
          pay: resolved.pay,
          pickups: resolved.pickups,
          drops: resolved.drops,
          miles: resolved.miles,
          items: resolved.items,
        },
        DEFAULT_SETTINGS,
      );
      let createdOrderId: string | undefined;

      if (userId && appName) {
        try {
          await connectDB();
          const entryId = randomBytes(16).toString("hex");
          const processedAtDate = date
            ? new Date(date)
            : getCurrentESTAsUTC().date;
          const additionalRestaurants = resolved.merchants
            .slice(1)
            .map((name) => ({ name }));
          const deliveryOrder = await DeliveryOrder.create({
            entryId,
            userId,
            appName: appName.trim(),
            money: resolved.pay,
            moneyEstimated: resolved.payEstimated,
            miles: resolved.miles,
            milesEstimated: resolved.milesEstimated,
            milesToMoneyRatio:
              resolved.miles > 0 ? resolved.pay / resolved.miles : undefined,
            ocrText: text,
            restaurantName: resolved.merchants[0] ?? "Unknown merchant",
            ...(additionalRestaurants.length > 0 && {
              additionalRestaurants,
            }),
            time: "",
            metadata: {
              source: "offer-api-regex-jev",
              ocrText: text,
              regexCandidates: candidates,
              extractedData: {
                pay: resolved.pay,
                miles: resolved.miles,
                ...(resolved.pickups !== undefined && {
                  pickups: resolved.pickups,
                }),
                ...(resolved.drops !== undefined && {
                  drops: resolved.drops,
                }),
                ...(resolved.items !== undefined && {
                  items: resolved.items,
                }),
                orderKind: resolved.orderKind,
                restaurants: resolved.merchants.map((restaurantName) => ({
                  restaurantName,
                })),
              },
              resolvedFields: resolved,
              jevClassification: classification,
              jev,
            },
            processedAt: processedAtDate,
            step: resolved.payEstimated ? "OCR_PENDING" : "CREATED",
            active: false,
          });
          createdOrderId = deliveryOrder._id?.toString();
        } catch (dbError) {
          console.error("Resolved offer storage error:", dbError);
        }
      }

      const display = buildPendingDisplay(
        resolved.pay,
        resolved.miles,
        resolved.payEstimated,
        fastEvaluation,
        slowEvaluation,
        offerEstimate,
        resolved.pickups,
        resolved.drops,
        resolved.items,
        resolved.orderKind,
        createdOrderId,
      );

      return NextResponse.json(
        {
          parsed: {
            pay: resolved.pay,
            miles: resolved.miles,
            pickups: resolved.pickups,
            drops: resolved.drops,
            items: resolved.items,
            restaurants: resolved.merchants,
          },
          evaluation: null,
          display,
          summary: resolved.payEstimated
            ? `Estimated pay $${resolved.pay.toFixed(2)} from Jev pay band`
            : `Pay $${resolved.pay.toFixed(2)} confirmed by regex and Jev`,
          jev,
          classification,
          candidates,
          resolved,
          createdOrderId,
          fastEvaluation,
          slowEvaluation,
          estimate: {
            totalMinutes: offerEstimate.totalMinutes,
            effectiveHourly: offerEstimate.effectiveHourly,
            breakdown: offerEstimate.breakdown,
          },
        },
        { headers: corsHeaders },
      );
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Calculator mode: parse OCR text with FAL's existing extraction workflow.
    // Jev evaluates the structured offer below; it is not a numeric OCR extractor.
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
        { headers: corsHeaders },
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
        DEFAULT_SETTINGS,
      );
    }

    // Keep Jev as a shadow recommendation until its decisions are validated against driver outcomes.
    const jev = evaluation
      ? await evaluateOfferWithJev({
          ocrText: text,
          offer: { ...parsed, pay: parsed.pay ?? 0 },
          evaluation,
        })
      : null;

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
          moneyEstimated: false,
          ocrText: text,
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
            jev,
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
    const display = buildDisplay(parsed, evaluation, createdOrderId, jev);

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
        jev,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Offer API error:", error);
    return handleApiError(error);
  }
}
