import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { DEFAULT_SETTINGS, evaluateOffer } from "@/lib/calculations";

type Bucket = {
  label: string;
  test: (value: number) => boolean;
};

type Evaluated = {
  pay: number;
  miles: number;
  items: number;
  evaluation: ReturnType<typeof evaluateOffer>;
};

const payBuckets: Bucket[] = [
  { label: "<$7", test: (value) => value < 7 },
  { label: "$7-9.99", test: (value) => value >= 7 && value < 10 },
  { label: "$10-14.99", test: (value) => value >= 10 && value < 15 },
  { label: "$15-19.99", test: (value) => value >= 15 && value < 20 },
  { label: "$20-29.99", test: (value) => value >= 20 && value < 30 },
  { label: "$30+", test: (value) => value >= 30 },
];

const mileBuckets: Bucket[] = [
  { label: "<3", test: (value) => value < 3 },
  { label: "3-4.99", test: (value) => value >= 3 && value < 5 },
  { label: "5-7.99", test: (value) => value >= 5 && value < 8 },
  { label: "8-11.99", test: (value) => value >= 8 && value < 12 },
  { label: "12-19.99", test: (value) => value >= 12 && value < 20 },
  { label: "20+", test: (value) => value >= 20 },
];

const itemBuckets: Bucket[] = [
  { label: "0", test: (value) => value === 0 },
  { label: "1-5", test: (value) => value >= 1 && value <= 5 },
  { label: "6-15", test: (value) => value >= 6 && value <= 15 },
  { label: "16-30", test: (value) => value >= 16 && value <= 30 },
  { label: "31+", test: (value) => value >= 31 },
];

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function summary(orders: Evaluated[]) {
  if (orders.length === 0) return "-";
  const good = orders.filter(
    ({ evaluation }) => evaluation.verdict === "good",
  ).length;
  const decent = orders.filter(
    ({ evaluation }) => evaluation.verdict === "decent",
  ).length;
  const bad = orders.length - good - decent;
  return `${Math.round((good / orders.length) * 100)}G/${Math.round((decent / orders.length) * 100)}D/${Math.round((bad / orders.length) * 100)}B n=${orders.length}`;
}

async function main() {
  await connectDB();

  try {
    const orders = await DeliveryOrder.find({
      money: { $gt: 0 },
      miles: { $gt: 0 },
    }).lean();

    const evaluated: Evaluated[] = orders.map((order) => {
      const metadata = order.metadata ?? {};
      const extracted = metadata.extractedData ?? metadata;
      const pay = numberOrDefault(order.money, 0);
      const miles = numberOrDefault(order.miles, 0);
      const pickups = numberOrDefault(extracted.pickups, 1);
      const drops = numberOrDefault(extracted.drops, 1);
      const items = numberOrDefault(extracted.items, 0);
      return {
        pay,
        miles,
        items,
        evaluation: evaluateOffer(
          { pay, miles, pickups, drops, items },
          DEFAULT_SETTINGS,
        ),
      };
    });

    console.log(`Orders analyzed: ${evaluated.length}`);
    console.log("Cell format: GOOD% / DECENT% / BAD% (sample size)");
    console.log("\nPay × miles observed outcome matrix:");
    console.table(
      payBuckets.map((payBucket) => {
        const row: Record<string, string> = { pay: payBucket.label };
        for (const mileBucket of mileBuckets) {
          row[mileBucket.label] = summary(
            evaluated.filter(
              ({ pay, miles }) => payBucket.test(pay) && mileBucket.test(miles),
            ),
          );
        }
        return row;
      }),
    );

    console.log("\nItems observed outcome matrix:");
    console.table(
      itemBuckets.map((itemBucket) => ({
        items: itemBucket.label,
        outcomes: summary(
          evaluated.filter(({ items }) => itemBucket.test(items)),
        ),
      })),
    );

    console.log(
      "\nFirst mileage bucket where BAD becomes majority, by pay bucket:",
    );
    for (const payBucket of payBuckets) {
      const transition = mileBuckets.find((mileBucket) => {
        const matching = evaluated.filter(
          ({ pay, miles }) => payBucket.test(pay) && mileBucket.test(miles),
        );
        if (matching.length < 5) return false;
        const bad = matching.filter(
          ({ evaluation }) => evaluation.verdict === "bad",
        ).length;
        return bad > matching.length / 2;
      });
      console.log(`${payBucket.label}: ${transition?.label ?? "not observed"}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
