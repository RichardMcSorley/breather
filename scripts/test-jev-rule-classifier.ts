import "dotenv/config";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { classifyOcrOfferWithJev } from "@/lib/jev-offer-evaluator";

type StoredOrder = {
  entry_id: string;
  app_name: string | null;
  text: string;
};

type Range = [number, number];

type PolicyResult = "accept" | "decline" | "review";

const limit = Math.max(1, Number.parseInt(process.argv[2] ?? "10", 10));
const databasePath = resolve(
  process.argv[3] ?? ".analysis/delivery-orders.sqlite",
);

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

function isStoredOrder(value: unknown): value is StoredOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.entry_id === "string" &&
    (typeof order.app_name === "string" || order.app_name === null) &&
    typeof order.text === "string"
  );
}

function choiceOf(value: unknown) {
  if (!value || typeof value !== "object") return "unknown";
  const answer = value as { type?: unknown; choice?: unknown };
  return answer.type === "choice" && typeof answer.choice === "string"
    ? answer.choice
    : "unknown";
}

function rangeFor(ranges: Record<string, Range>, choice: string): Range | null {
  return ranges[choice] ?? null;
}

function policyResult(
  pay: Range | null,
  miles: Range | null,
  pickups: Range | null,
  drops: Range | null,
  items: Range | null,
  orderKind: string,
  basePay: number,
): PolicyResult {
  if (!pay || !miles || !pickups || !drops || !items) return "review";

  const shopping =
    orderKind === "shopping_order" || orderKind === "shopping_batch";
  const batch =
    orderKind === "delivery_batch" || orderKind === "shopping_batch";
  const mileageMinimum = shopping || batch ? 2.5 : 2;
  const shoppingSetup = shopping ? 1.75 : 0;
  const requiredMinimum =
    basePay * drops[0] * (1 + 0.4 * (pickups[0] - 1)) +
    shoppingSetup +
    items[0] * 0.35;
  const requiredMaximum =
    basePay * drops[1] * (1 + 0.4 * (pickups[1] - 1)) +
    shoppingSetup +
    items[1] * 0.35;
  const bestPayPerMile = pay[1] / miles[0];
  const worstPayPerMile = pay[0] / miles[1];

  if (pay[0] >= requiredMaximum && worstPayPerMile >= mileageMinimum) {
    return "accept";
  }
  if (pay[1] < requiredMinimum || bestPayPerMile < mileageMinimum) {
    return "decline";
  }
  return "review";
}

async function main() {
  const query = `
    SELECT entry_id, app_name, text
    FROM delivery_orders
    WHERE text_source = 'stored_ocr_text'
      AND text IS NOT NULL
    ORDER BY processed_at DESC
    LIMIT ${limit}
  `;
  const output = execFileSync("sqlite3", ["-json", databasePath, query], {
    encoding: "utf8",
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(output || "[]");
  } catch (error) {
    throw new Error(
      `Could not parse SQLite output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const orders = Array.isArray(parsed) ? parsed.filter(isStoredOrder) : [];

  for (const order of orders) {
    const result = await classifyOcrOfferWithJev({ ocrText: order.text });
    if (!result) {
      console.log(`${order.entry_id} | Jev unavailable`);
      continue;
    }

    const pay = choiceOf(result.answers.pay_band);
    const miles = choiceOf(result.answers.miles_band);
    const pickups = choiceOf(result.answers.pickups);
    const drops = choiceOf(result.answers.dropoffs);
    const items = choiceOf(result.answers.items_band);
    const orderKind = choiceOf(result.answers.order_kind);
    const payRange = rangeFor(payRanges, pay);
    const milesRange = rangeFor(milesRanges, miles);
    const pickupRange = rangeFor(countRanges, pickups);
    const dropRange = rangeFor(countRanges, drops);
    const itemRange = rangeFor(itemRanges, items);
    const fast = policyResult(
      payRange,
      milesRange,
      pickupRange,
      dropRange,
      itemRange,
      orderKind,
      5,
    );
    const slow = policyResult(
      payRange,
      milesRange,
      pickupRange,
      dropRange,
      itemRange,
      orderKind,
      7,
    );

    console.log(
      `${order.entry_id} | ${order.app_name ?? "unknown"} | ` +
        `pay=${pay} miles=${miles} p=${pickups} d=${drops} items=${items} ` +
        `kind=${orderKind} | fast=${fast} slow=${slow}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
