export type RuleDecision = "accept" | "decline" | "review";

type Range = [number, number];

export type JevRuleClassification = {
  payBand: string;
  milesBand: string;
  pickups: string;
  dropoffs: string;
  itemsBand: string;
  orderKind: string;
  isShopping?: boolean | null;
  merchantCategory?: string;
};

export type JevPolicyFacts = {
  pay?: number;
  miles?: number;
  pickups?: number;
  drops?: number;
  items?: number;
};

export type JevPolicyEvaluation = {
  decision: RuleDecision;
  requiredPayMinimum: number | null;
  requiredPayMaximum: number | null;
  mileageMinimum: number | null;
  reason: string;
};

const payRanges: Record<string, Range> = {
  under_4: [0, 3.99],
  "4_to_4_99": [4, 4.99],
  "5_to_5_99": [5, 5.99],
  "6_to_6_49": [6, 6.49],
  "6_50_to_6_99": [6.5, 6.99],
  "7_to_7_99": [7, 7.99],
  "8_to_8_99": [8, 8.99],
  "9_to_9_74": [9, 9.74],
  "9_75_to_10_49": [9.75, 10.49],
  "10_50_to_11_99": [10.5, 11.99],
  "12_to_14_99": [12, 14.99],
  "15_to_19_49": [15, 19.49],
  "19_50_to_20_99": [19.5, 20.99],
  "21_to_24_99": [21, 24.99],
  "25_to_29_99": [25, 29.99],
  "30_plus": [30, Number.POSITIVE_INFINITY],
};

const milesRanges: Record<string, Range> = {
  under_1: [0, 0.99],
  "1_to_1_99": [1, 1.99],
  "2_to_2_99": [2, 2.99],
  "3_to_3_99": [3, 3.99],
  "4_to_4_99": [4, 4.99],
  "5_to_5_99": [5, 5.99],
  "6_to_6_99": [6, 6.99],
  "7_to_7_99": [7, 7.99],
  "8_to_8_99": [8, 8.99],
  "9_to_9_99": [9, 9.99],
  "10_to_11_99": [10, 11.99],
  "12_to_14_99": [12, 14.99],
  "15_to_19_99": [15, 19.99],
  "20_plus": [20, Number.POSITIVE_INFINITY],
};

const countRanges: Record<string, Range> = {
  one: [1, 1],
  two: [2, 2],
  three: [3, 3],
  four_plus: [4, Number.POSITIVE_INFINITY],
};

const itemRanges: Record<string, Range> = {
  zero: [0, 0],
  one_to_two: [1, 2],
  three_to_five: [3, 5],
  six_to_ten: [6, 10],
  eleven_to_fifteen: [11, 15],
  sixteen_to_twenty: [16, 20],
  twenty_one_to_thirty: [21, 30],
  thirty_one_to_forty: [31, 40],
  forty_one_to_sixty: [41, 60],
  sixty_plus: [61, Number.POSITIVE_INFINITY],
};

const payLowerBounds: Record<string, number> = {
  under_4: 2,
  "4_to_4_99": 4,
  "5_to_5_99": 5,
  "6_to_6_49": 6,
  "6_50_to_6_99": 6.5,
  "7_to_7_99": 7,
  "8_to_8_99": 8,
  "9_to_9_74": 9,
  "9_75_to_10_49": 9.75,
  "10_50_to_11_99": 10.5,
  "12_to_14_99": 12,
  "15_to_19_49": 15,
  "19_50_to_20_99": 19.5,
  "21_to_24_99": 21,
  "25_to_29_99": 25,
  "30_plus": 30,
  unknown: 2,
};

function rangeFor(ranges: Record<string, Range>, value: string) {
  return ranges[value] ?? null;
}

export function choiceAnswer(value: unknown) {
  if (!value || typeof value !== "object") return "unknown";
  const answer = value as { type?: unknown; choice?: unknown };
  return answer.type === "choice" && typeof answer.choice === "string"
    ? answer.choice
    : "unknown";
}

export function noulAnswer(value: unknown): boolean | null {
  if (!value || typeof value !== "object") return null;
  const answer = value as { type?: unknown; noul?: unknown };
  return answer.type === "noul" && typeof answer.noul === "number"
    ? answer.noul >= 0.5
    : null;
}

export function classificationFromAnswers(
  answers: unknown,
): JevRuleClassification {
  const record =
    answers && typeof answers === "object"
      ? (answers as Record<string, unknown>)
      : {};

  const isShopping = noulAnswer(record.is_shopping);
  const classifiedItems = choiceAnswer(record.items_band);

  return {
    payBand: choiceAnswer(record.pay_band),
    milesBand: choiceAnswer(record.miles_band),
    pickups: choiceAnswer(record.pickups),
    dropoffs: choiceAnswer(record.dropoffs),
    itemsBand: isShopping === false ? "zero" : classifiedItems,
    orderKind: choiceAnswer(record.order_kind),
    isShopping,
    merchantCategory: choiceAnswer(record.merchant_category),
  };
}

const milesUpperBounds: Record<string, number> = {
  under_1: 0.99,
  "1_to_1_99": 1.99,
  "2_to_2_99": 2.99,
  "3_to_3_99": 3.99,
  "4_to_4_99": 4.99,
  "5_to_5_99": 5.99,
  "6_to_6_99": 6.99,
  "7_to_7_99": 7.99,
  "8_to_8_99": 8.99,
  "9_to_9_99": 9.99,
  "10_to_11_99": 11.99,
  "12_to_14_99": 14.99,
  "15_to_19_99": 19.99,
  "20_plus": 100,
  unknown: 20,
};

export function estimatedPayForBand(payBand: string) {
  return payLowerBounds[payBand] ?? payLowerBounds.unknown;
}

export function estimatedMilesForBand(milesBand: string) {
  return milesUpperBounds[milesBand] ?? milesUpperBounds.unknown;
}

export function evaluateJevPolicy(
  classification: JevRuleClassification,
  basePay: number,
  facts?: JevPolicyFacts,
): JevPolicyEvaluation {
  const pay = rangeFor(payRanges, classification.payBand);
  const miles = rangeFor(milesRanges, classification.milesBand);
  const pickups = rangeFor(countRanges, classification.pickups);
  const drops = rangeFor(countRanges, classification.dropoffs);
  const items = rangeFor(itemRanges, classification.itemsBand);

  if (!pay || !miles || !pickups || !drops || !items) {
    return {
      decision: "review",
      requiredPayMinimum: null,
      requiredPayMaximum: null,
      mileageMinimum: null,
      reason: "Jev could not establish all pay, mileage, or workload bands.",
    };
  }

  const mileageMinimum = 1.5;
  const pickupMinimum = facts?.pickups ?? pickups[0];
  const pickupMaximum = facts?.pickups ?? pickups[1];
  const dropMinimum = facts?.drops ?? drops[0];
  const dropMaximum = facts?.drops ?? drops[1];
  const itemMinimum = facts?.items ?? items[0];
  const itemMaximum = facts?.items ?? items[1];
  const requiredPayMinimum =
    basePay * dropMinimum * (1 + 0.4 * (pickupMinimum - 1)) +
    itemMinimum * 0.35;
  const requiredPayMaximum =
    basePay * dropMaximum * (1 + 0.4 * (pickupMaximum - 1)) +
    itemMaximum * 0.35;
  const bestPayPerMile = (facts?.pay ?? pay[1]) / (facts?.miles ?? miles[0]);
  const worstPayPerMile = (facts?.pay ?? pay[0]) / (facts?.miles ?? miles[1]);
  const payFails = (facts?.pay ?? pay[1]) < requiredPayMinimum;
  const mileageFails = bestPayPerMile < mileageMinimum;
  const payFloor = facts?.pay ?? pay[0];

  if (payFloor >= requiredPayMaximum && worstPayPerMile >= mileageMinimum) {
    const payBasis = facts?.pay !== undefined ? "Confirmed pay" : "Pay band";
    const mileageBasis =
      facts?.pay !== undefined && facts?.miles !== undefined
        ? "Confirmed pay per mile"
        : "Worst-case pay per mile";
    return {
      decision: "accept",
      requiredPayMinimum,
      requiredPayMaximum,
      mileageMinimum,
      reason: `${payBasis} clears $${requiredPayMaximum.toFixed(2)} workload minimum and ${mileageBasis.toLowerCase()} clears $${mileageMinimum.toFixed(2)}/mi.`,
    };
  }

  if (payFails || mileageFails) {
    const failures = [
      payFails ? `pay may fall below $${requiredPayMinimum.toFixed(2)}` : null,
      mileageFails
        ? `best-case pay per mile is below $${mileageMinimum.toFixed(2)}/mi`
        : null,
    ].filter((failure): failure is string => failure !== null);
    return {
      decision: "decline",
      requiredPayMinimum,
      requiredPayMaximum,
      mileageMinimum,
      reason: `Pass: ${failures.join(" and ")}.`,
    };
  }

  return {
    decision: "review",
    requiredPayMinimum,
    requiredPayMaximum,
    mileageMinimum,
    reason: `Review: offer overlaps the $${requiredPayMinimum.toFixed(2)}-$${requiredPayMaximum.toFixed(2)} workload threshold.`,
  };
}
