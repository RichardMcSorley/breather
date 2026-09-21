import { OpenRouter } from "@openrouter/sdk";
import {
  DEFAULT_SETTINGS,
  type OfferEvaluation,
  type OfferInput,
} from "@/lib/calculations";
import {
  KNOWN_MERCHANTS,
  type RegexOfferCandidates,
} from "@/lib/ocr-offer-extractor";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const JEV_MODEL = "~typesafe/jev-latest";

const openrouter = OPENROUTER_API_KEY
  ? new OpenRouter({ apiKey: OPENROUTER_API_KEY })
  : null;

export interface JevOfferInput extends OfferInput {
  restaurants?: string[];
}

const REGEX_VALIDATION_CRITERIA = {
  confirmed: "Regex candidate is directly supported by readable OCR evidence.",
  rejected:
    "Regex candidate conflicts with readable OCR evidence or captures unrelated text.",
  uncertain:
    "OCR contains candidate-like evidence but it is ambiguous or incomplete.",
  not_present: "No usable regex candidate was supplied.",
};

const COMPLEXITY_CRITERIA = [
  "Low: one pickup, one drop, no shopping, no restrictions, and no batch indicators.",
  "Moderate: shopping, multiple items, extra pickup or drop, or unclear operational detail.",
  "High: batch or multiple drops, many shopping items, restricted items, multiple pickups, or several ambiguous details.",
];

const CALCULATOR_RULES = `
Delivery offer calculator rules:
1. Defaults for structured fields: pickups=1, drops=1, items=0, miles=0.
2. Pickup time = pickups × 5 minutes.
3. Drop time = drops × 2 minutes.
4. Travel time = miles ÷ 35 × 60 minutes.
5. Shopping time = items × 1 minute.
6. Return time = travel time × 100% for one drop; travel time × 50% for two or more drops.
7. Total minutes = pickup time + drop time + travel time + shopping time + return time.
8. Orders per hour = min(3, 60 ÷ total minutes).
9. Effective hourly = pay × orders per hour.
10. GOOD = effective hourly ≥ $21.00.
11. DECENT = effective hourly ≥ $19.50 and < $21.00.
12. BAD = effective hourly < $19.50.
Use this formula, not a simple pay-per-mile shortcut. For raw OCR, do not invent missing decision-critical fields; choose review instead.
`;

export async function evaluateOfferWithJev(input: {
  ocrText: string;
  offer: JevOfferInput;
  evaluation: OfferEvaluation;
}) {
  if (!openrouter) {
    return null;
  }

  const { ocrText, offer, evaluation } = input;
  const minimumHourly = DEFAULT_SETTINGS.minHourlyPay;

  try {
    const decision = await openrouter.alpha.decisions.create({
      decisionsRequest: {
        model: JEV_MODEL,
        state: {
          ocr_text: ocrText,
          calculator_rules: CALCULATOR_RULES,
          offer,
          calculator: {
            verdict: evaluation.verdict,
            effective_hourly: evaluation.effectiveHourly,
            required_pay: evaluation.requiredPay,
            total_minutes: evaluation.totalMinutes,
            minimum_hourly_target: minimumHourly,
            breakdown: evaluation.breakdown,
          },
        },
        questions: {
          acceptance: {
            type: "choice",
            instructions:
              "Give an independent recommendation for this delivery offer. Use calculator metrics as authoritative. Choose review when inputs are missing, ambiguous, or borderline.",
            criteria: {
              accept:
                "Calculator verdict is good or decent and effective hourly pay clears the configured minimum target.",
              decline:
                "Calculator verdict is bad, or effective hourly pay is below the configured minimum target.",
              review:
                "Important offer details are missing or ambiguous, or the result is too close to the minimum target to decide confidently.",
            },
          },
          clears_minimum: {
            type: "noul",
            instructions:
              "Does this offer clear the configured minimum hourly pay target using the calculator result?",
            criteria: {
              true: "Effective hourly pay is at or above the configured minimum hourly target.",
              false:
                "Effective hourly pay is below the configured minimum hourly target.",
            },
          },
          complexity: {
            type: "score",
            instructions:
              "Rate operational complexity from the OCR text and offer fields. Consider pickups, drops, shopping items, batch orders, and restrictions.",
            criteria: COMPLEXITY_CRITERIA,
          },
        },
      },
    });

    return {
      model: JEV_MODEL,
      answers: decision.answers,
      usage: decision.usage,
    };
  } catch {
    return null;
  }
}

/**
 * Evaluate raw OCR without requiring exact numeric extraction first.
 * Jev can interpret numbers in OCR for a recommendation, but typed Decisions
 * answers intentionally return categories, not arbitrary pay/mileage fields.
 */
/**
 * Classify raw OCR into policy bands for the no-FAL rule engine.
 * This returns categories instead of asking Jev to perform exact arithmetic.
 */
export async function classifyOcrOfferWithJev(input: {
  ocrText: string;
  candidates?: RegexOfferCandidates;
}) {
  if (!openrouter) {
    return null;
  }

  try {
    const decision = await openrouter.alpha.decisions.create({
      decisionsRequest: {
        model: JEV_MODEL,
        state: {
          ocr_text: input.ocrText,
          regex_candidates: input.candidates ?? null,
          known_merchants: KNOWN_MERCHANTS,
          instruction:
            "Classify only facts visible in the OCR. Validate regex candidates against OCR. Do not decide acceptance, invent exact values, or force a merchant match.",
        },
        questions: {
          pay_band: {
            type: "choice",
            instructions:
              "Classify total offer pay, including base pay, tips, bonuses, or guaranteed pay. Ignore mileage and hourly-rate numbers.",
            criteria: {
              under_4: "Total pay is below $4.00.",
              "4_to_4_99": "Total pay is $4.00 through $4.99.",
              "5_to_5_99": "Total pay is $5.00 through $5.99.",
              "6_to_6_49": "Total pay is $6.00 through $6.49.",
              "6_50_to_6_99": "Total pay is $6.50 through $6.99.",
              "7_to_7_99": "Total pay is $7.00 through $7.99.",
              "8_to_8_99": "Total pay is $8.00 through $8.99.",
              "9_to_9_74": "Total pay is $9.00 through $9.74.",
              "9_75_to_10_49": "Total pay is $9.75 through $10.49.",
              "10_50_to_11_99": "Total pay is $10.50 through $11.99.",
              "12_to_14_99": "Total pay is $12.00 through $14.99.",
              "15_to_19_49": "Total pay is $15.00 through $19.49.",
              "19_50_to_20_99": "Total pay is $19.50 through $20.99.",
              "21_to_24_99": "Total pay is $21.00 through $24.99.",
              "25_to_29_99": "Total pay is $25.00 through $29.99.",
              "30_plus": "Total pay is $30.00 or more.",
              unknown: "Total pay is missing, contradictory, or unreadable.",
            },
          },
          miles_band: {
            type: "choice",
            instructions:
              "Classify offer distance, not a map label, route number, or delivery time.",
            criteria: {
              under_1: "Distance is below 1 mile.",
              "1_to_1_99": "Distance is 1.00 through 1.99 miles.",
              "2_to_2_99": "Distance is 2.00 through 2.99 miles.",
              "3_to_3_99": "Distance is 3.00 through 3.99 miles.",
              "4_to_4_99": "Distance is 4.00 through 4.99 miles.",
              "5_to_5_99": "Distance is 5.00 through 5.99 miles.",
              "6_to_6_99": "Distance is 6.00 through 6.99 miles.",
              "7_to_7_99": "Distance is 7.00 through 7.99 miles.",
              "8_to_8_99": "Distance is 8.00 through 8.99 miles.",
              "9_to_9_99": "Distance is 9.00 through 9.99 miles.",
              "10_to_11_99": "Distance is 10.00 through 11.99 miles.",
              "12_to_14_99": "Distance is 12.00 through 14.99 miles.",
              "15_to_19_99": "Distance is 15.00 through 19.99 miles.",
              "20_plus": "Distance is 20 miles or more.",
              unknown: "Distance is missing, contradictory, or unreadable.",
            },
          },
          pickups: {
            type: "choice",
            instructions: "Count distinct pickup locations or restaurants.",
            criteria: {
              one: "Exactly one pickup location.",
              two: "Exactly two pickup locations.",
              three: "Exactly three pickup locations.",
              four_plus: "Four or more pickup locations.",
              unknown: "Pickup count is missing or ambiguous.",
            },
          },
          dropoffs: {
            type: "choice",
            instructions:
              "Count distinct customers, drop-offs, or delivery orders.",
            criteria: {
              one: "Exactly one drop-off.",
              two: "Exactly two drop-offs.",
              three: "Exactly three drop-offs.",
              four_plus: "Four or more drop-offs.",
              unknown: "Drop-off count is missing or ambiguous.",
            },
          },
          items_band: {
            type: "choice",
            instructions:
              "Classify total shopping items. Use item count, units, or clearly stated shopping quantity. Items imply a shopping order.",
            criteria: {
              zero: "No shopping items are shown.",
              one_to_two: "One or two shopping items.",
              three_to_five: "Three through five shopping items.",
              six_to_ten: "Six through ten shopping items.",
              eleven_to_fifteen: "Eleven through fifteen shopping items.",
              sixteen_to_twenty: "Sixteen through twenty shopping items.",
              twenty_one_to_thirty: "Twenty-one through thirty shopping items.",
              thirty_one_to_forty: "Thirty-one through forty shopping items.",
              forty_one_to_sixty: "Forty-one through sixty shopping items.",
              sixty_plus: "More than sixty shopping items.",
              unknown: "Item count is missing or ambiguous.",
            },
          },
          pay_candidate: {
            type: "choice",
            instructions:
              "Validate the regex pay candidate as total offer pay. Ignore per-mile amounts and unrelated dollar values.",
            criteria: REGEX_VALIDATION_CRITERIA,
          },
          miles_candidate: {
            type: "choice",
            instructions:
              "Validate the regex miles candidate as offer distance. Ignore map labels, route numbers, and delivery times.",
            criteria: REGEX_VALIDATION_CRITERIA,
          },
          pickups_candidate: {
            type: "choice",
            instructions:
              "Validate the regex pickup count as distinct pickup locations, not repeated UI labels.",
            criteria: REGEX_VALIDATION_CRITERIA,
          },
          drops_candidate: {
            type: "choice",
            instructions:
              "Validate the regex drop count as distinct customers, drop-offs, or delivery orders.",
            criteria: REGEX_VALIDATION_CRITERIA,
          },
          items_candidate: {
            type: "choice",
            instructions:
              "Validate the regex item count as shopping items. Do not count units, weights, dimensions, or item numbers.",
            criteria: REGEX_VALIDATION_CRITERIA,
          },
          order_kind_candidate: {
            type: "choice",
            instructions:
              "Validate the regex order kind: single_delivery, delivery_batch, shopping_order, or shopping_batch.",
            criteria: REGEX_VALIDATION_CRITERIA,
          },
          merchant_candidates: {
            type: "choice",
            instructions:
              "Validate proposed merchant names as a group. Ignore addresses, map labels, and UI text.",
            criteria: {
              confirmed:
                "All proposed merchant names are visible and refer to pickup merchants.",
              partial:
                "Some proposed merchant names are visible, but one or more are wrong or incomplete.",
              rejected:
                "Proposed merchant names are not supported by OCR or are unrelated text.",
              not_present:
                "No merchant candidate was supplied or no merchant is visible.",
            },
          },
          merchant_category: {
            type: "choice",
            instructions:
              "Classify the primary pickup merchant type when exact merchant identity is uncertain.",
            criteria: {
              restaurant: "Restaurant or prepared-food merchant.",
              fast_food: "Fast-food restaurant.",
              grocery_store: "Grocery or supermarket.",
              retail_store: "General retail or department store.",
              pharmacy: "Pharmacy or drug store.",
              home_improvement: "Home improvement or hardware store.",
              pet_store: "Pet supply store.",
              gas_station: "Gas station or fuel/convenience merchant.",
              coffee_shop: "Coffee, tea, smoothie, or juice merchant.",
              convenience_store:
                "Convenience store without a clear fuel signal.",
              unknown_merchant: "Merchant type is missing or ambiguous.",
            },
          },
          order_kind: {
            type: "choice",
            instructions:
              "Classify batching and shopping together. A batch with items is a shopping batch. A batch without items is a delivery batch.",
            criteria: {
              single_delivery: "One delivery and no shopping items.",
              delivery_batch:
                "Multiple deliveries or customers without shopping items.",
              shopping_order:
                "Shopping items for one customer or one delivery.",
              shopping_batch:
                "Shopping items combined with multiple customers or deliveries.",
              unknown: "Order type is missing or ambiguous.",
            },
          },
        },
      },
    });

    return {
      model: JEV_MODEL,
      answers: decision.answers,
      usage: decision.usage,
    };
  } catch {
    return null;
  }
}

export async function evaluateOcrOfferWithJev(input: { ocrText: string }) {
  if (!openrouter) {
    return null;
  }

  try {
    const decision = await openrouter.alpha.decisions.create({
      decisionsRequest: {
        model: JEV_MODEL,
        state: {
          ocr_text: input.ocrText,
          calculator_rules: CALCULATOR_RULES,
          calculator_settings: DEFAULT_SETTINGS,
          minimum_hourly_target: DEFAULT_SETTINGS.minHourlyPay,
          expected_hourly_target: DEFAULT_SETTINGS.expectedPay,
        },
        questions: {
          acceptance: {
            type: "choice",
            instructions:
              "Read delivery offer details from OCR text. Apply calculator_rules exactly, including travel time, return time, orders-per-hour cap, and hourly thresholds. Decide whether a driver should accept it. Do not use a pay-per-mile shortcut or invent missing values.",
            criteria: {
              accept:
                "Visible offer clears the hourly target with reasonable confidence and operational complexity.",
              decline:
                "Visible offer clearly falls below the hourly target or has unreasonable distance or complexity.",
              review:
                "Pay, distance, stops, or work details are missing, contradictory, or too close to call confidently.",
            },
          },
          completion_time: {
            type: "choice",
            instructions:
              "Find the full order completion time in the OCR. Treat phrases like '21 min total', 'complete by', and 'deliver by' as completion signals. If current time and a deadline are visible, calculate the interval, including crossing an hour. If only an unrelated customer ETA or insufficient information is visible, choose unknown.",
            criteria: {
              under_20: "Full order completion takes fewer than 20 minutes.",
              "20_to_29": "Full order completion takes 20 through 29 minutes.",
              "30_to_59": "Full order completion takes 30 through 59 minutes.",
              "60_plus": "Full order completion takes 60 minutes or more.",
              unknown:
                "Full completion time is absent, ambiguous, or only customer ETA is visible.",
            },
          },
          details_complete: {
            type: "noul",
            instructions:
              "Are pay and the main workload details needed for an acceptability decision clearly present in the OCR text?",
            criteria: {
              true: "Pay and enough distance, stops, or shopping details are readable.",
              false:
                "One or more decision-critical details are missing or ambiguous.",
            },
          },
          complexity: {
            type: "score",
            instructions:
              "Rate operational complexity using only details visible in the OCR text.",
            criteria: COMPLEXITY_CRITERIA,
          },
        },
      },
    });

    return {
      model: JEV_MODEL,
      answers: decision.answers,
      usage: decision.usage,
    };
  } catch {
    return null;
  }
}
