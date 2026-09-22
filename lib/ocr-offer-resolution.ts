import {
  choiceAnswer,
  estimatedMilesForBand,
  estimatedPayForBand,
  type JevRuleClassification,
} from "@/lib/jev-rule-engine";
import type { RegexOfferCandidates } from "@/lib/ocr-offer-extractor";

const categoryLabels: Record<string, string> = {
  restaurant: "Restaurant",
  fast_food: "Fast-food restaurant",
  grocery_store: "Grocery store",
  retail_store: "Retail store",
  pharmacy: "Pharmacy",
  home_improvement: "Home improvement store",
  pet_store: "Pet store",
  gas_station: "Gas station",
  coffee_shop: "Coffee shop",
  convenience_store: "Convenience store",
  unknown_merchant: "Unknown merchant",
};

const answerStatus = (answers: unknown, key: string) => {
  if (!answers || typeof answers !== "object") return "unknown";
  return choiceAnswer((answers as Record<string, unknown>)[key]);
};

const exactWhenConfirmed = (candidate: number | undefined, status: string) =>
  candidate !== undefined && status === "confirmed" ? candidate : undefined;

export function resolveRegexOfferCandidates(
  candidates: RegexOfferCandidates,
  answers: unknown,
  classification: JevRuleClassification,
) {
  const payStatus = answerStatus(answers, "pay_candidate");
  const milesStatus = answerStatus(answers, "miles_candidate");
  const pickupsStatus = answerStatus(answers, "pickups_candidate");
  const dropsStatus = answerStatus(answers, "drops_candidate");
  const itemsStatus = answerStatus(answers, "items_candidate");
  const orderKindStatus = answerStatus(answers, "order_kind_candidate");
  const merchantStatus = answerStatus(answers, "merchant_candidates");
  const merchantCategory = answerStatus(answers, "merchant_category");

  const exactPay = exactWhenConfirmed(candidates.pay, payStatus);
  const exactMiles = exactWhenConfirmed(candidates.miles, milesStatus);
  const pay = exactPay ?? estimatedPayForBand(classification.payBand);
  const miles = exactMiles ?? estimatedMilesForBand(classification.milesBand);
  const merchants =
    merchantStatus === "confirmed" && candidates.merchants.length > 0
      ? candidates.merchants
      : [categoryLabels[merchantCategory] ?? "Unknown merchant"];

  return {
    pay,
    miles,
    // Counts are deterministic UI facts when regex finds them. Jev validates
    // them, but should not replace an exact count with a broader band.
    pickups: candidates.pickups ?? undefined,
    drops: candidates.drops ?? undefined,
    items: candidates.items ?? undefined,
    orderCount: candidates.orderCount,
    orderKind:
      candidates.orderKind ?? classification.orderKind,
    merchants,
    payEstimated: exactPay === undefined,
    milesEstimated: exactMiles === undefined,
    validation: {
      pay: {
        status: payStatus,
        source: exactPay === undefined ? "jev_band" : "regex",
      },
      miles: {
        status: milesStatus,
        source: exactMiles === undefined ? "jev_band" : "regex",
      },
      pickups: {
        status: pickupsStatus,
        source: candidates.pickups !== undefined ? "regex" : "jev",
      },
      drops: {
        status: dropsStatus,
        source: candidates.drops !== undefined ? "regex" : "jev",
      },
      items: {
        status: itemsStatus,
        source: candidates.items !== undefined ? "regex" : "jev",
      },
      orderKind: {
        status: orderKindStatus,
        source: orderKindStatus === "confirmed" ? "regex" : "jev",
      },
      merchants: {
        status: merchantStatus,
        category: merchantCategory,
        source: merchantStatus === "confirmed" ? "regex" : "jev_category",
      },
    },
  };
}
