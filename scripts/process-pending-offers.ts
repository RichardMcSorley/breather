import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { processPendingOffers } from "@/lib/process-pending-offers";

const limit = Math.max(1, Number.parseInt(process.argv[2] ?? "10", 10));

async function main() {
  await connectDB();

  try {
    const results = await processPendingOffers({ limit });
    console.log(`Pending offers processed: ${results.length}`);
    for (const result of results) {
      console.log(
        `${result.status}: ${result.entryId}` +
          (result.pay === undefined ? "" : ` $${result.pay.toFixed(2)}`),
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
