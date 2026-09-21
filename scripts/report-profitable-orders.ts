import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { DEFAULT_SETTINGS, evaluateOffer } from "@/lib/calculations";

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

      return { order, pay, miles, pickups, drops, items, evaluation };
    });

    const good = evaluated.filter(
      ({ evaluation }) => evaluation.verdict === "good",
    );
    const above21 = good.filter(
      ({ evaluation }) => evaluation.effectiveHourly > 21,
    );

    console.log(`Orders with pay and miles > 0: ${evaluated.length}`);
    console.log(`GOOD orders: ${good.length}`);
    console.log(`GOOD and strictly above $21/hr: ${above21.length}`);
    console.log("\nGOOD orders above $21/hr:");

    for (const {
      order,
      pay,
      miles,
      pickups,
      drops,
      items,
      evaluation,
    } of above21) {
      console.log(
        `${order.entryId.slice(0, 8)} | ${order.processedAt.toISOString().slice(0, 10)} | $${pay.toFixed(2)} | ${miles.toFixed(1)} mi | ${pickups}p/${drops}d/${items}i | $${evaluation.effectiveHourly.toFixed(2)}/hr`,
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
