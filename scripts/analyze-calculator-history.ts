import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { DEFAULT_SETTINGS, evaluateOffer } from "@/lib/calculations";

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function quantile(values: number[], probability: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function distribution(
  values: number[],
  buckets: Array<{ label: string; test: (value: number) => boolean }>,
) {
  return buckets.map(({ label, test }) => ({
    label,
    count: values.filter(test).length,
  }));
}

async function main() {
  await connectDB();

  try {
    const orders = await DeliveryOrder.find({
      money: { $gt: 0 },
      miles: { $gt: 0 },
    })
      .sort({ processedAt: -1 })
      .lean();

    const evaluated = orders.map((order) => {
      const metadata = order.metadata ?? {};
      const extracted = metadata.extractedData ?? metadata;
      const pay = numberOrDefault(order.money, 0);
      const miles = numberOrDefault(order.miles, 0);
      const pickups = numberOrDefault(extracted.pickups, 1);
      const drops = numberOrDefault(extracted.drops, 1);
      const items = numberOrDefault(extracted.items, 0);
      const evaluation = evaluateOffer(
        { pay, miles, pickups, drops, items },
        DEFAULT_SETTINGS,
      );
      return { pay, miles, pickups, drops, items, evaluation };
    });

    const fields = {
      pay: evaluated.map(({ pay }) => pay),
      miles: evaluated.map(({ miles }) => miles),
      items: evaluated.map(({ items }) => items),
      effectiveHourly: evaluated.map(
        ({ evaluation }) => evaluation.effectiveHourly,
      ),
    };

    console.log(`Orders analyzed: ${evaluated.length}`);
    console.log("\nCurrent calculator verdicts:");
    for (const verdict of ["good", "decent", "bad"] as const) {
      console.log(
        `${verdict}: ${evaluated.filter(({ evaluation }) => evaluation.verdict === verdict).length}`,
      );
    }

    console.log("\nQuantiles (p10 / p25 / p50 / p75 / p90):");
    for (const [name, values] of Object.entries(fields)) {
      console.log(
        `${name}: ${[0.1, 0.25, 0.5, 0.75, 0.9]
          .map((probability) => quantile(values, probability).toFixed(2))
          .join(" / ")}`,
      );
    }

    console.log("\nCandidate pay buckets:");
    console.table(
      distribution(fields.pay, [
        { label: "under $7", test: (value) => value < 7 },
        { label: "$7-$9.99", test: (value) => value >= 7 && value < 10 },
        { label: "$10-$14.99", test: (value) => value >= 10 && value < 15 },
        { label: "$15-$19.99", test: (value) => value >= 15 && value < 20 },
        { label: "$20-$29.99", test: (value) => value >= 20 && value < 30 },
        { label: "$30+", test: (value) => value >= 30 },
      ]),
    );

    console.log("\nCandidate mileage buckets:");
    console.table(
      distribution(fields.miles, [
        { label: "under 3", test: (value) => value < 3 },
        { label: "3-4.99", test: (value) => value >= 3 && value < 5 },
        { label: "5-7.99", test: (value) => value >= 5 && value < 8 },
        { label: "8-11.99", test: (value) => value >= 8 && value < 12 },
        { label: "12-19.99", test: (value) => value >= 12 && value < 20 },
        { label: "20+", test: (value) => value >= 20 },
      ]),
    );

    console.log("\nCandidate item buckets:");
    console.table(
      distribution(fields.items, [
        { label: "0", test: (value) => value === 0 },
        { label: "1-5", test: (value) => value >= 1 && value <= 5 },
        { label: "6-15", test: (value) => value >= 6 && value <= 15 },
        { label: "16-30", test: (value) => value >= 16 && value <= 30 },
        { label: "31+", test: (value) => value >= 31 },
      ]),
    );

    const nearBoundary = evaluated.filter(
      ({ evaluation }) =>
        evaluation.effectiveHourly >= 19.5 && evaluation.effectiveHourly <= 22,
    );
    console.log(
      `\nNear decision boundary ($19.50-$22/hr): ${nearBoundary.length}`,
    );
    console.log(
      "These need finer buckets or review; wide buckets risk wrong decisions.",
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
