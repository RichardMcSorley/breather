import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { extractOfferWithFal } from "@/lib/offer-fal-extractor";

export type PendingOfferProcessResult = {
  entryId: string;
  status: "processed" | "failed";
  pay?: number;
  error?: string;
};

async function processOnePendingOffer(userId?: string) {
  const filter = {
    step: "OCR_PENDING",
    ocrText: { $type: "string", $ne: "" },
    ...(userId ? { userId } : {}),
  };
  const claimed = await DeliveryOrder.findOneAndUpdate(
    filter,
    {
      $set: {
        step: "OCR_PROCESSING",
        "metadata.ocrStartedAt": new Date().toISOString(),
      },
      $inc: { "metadata.ocrAttempts": 1 },
    },
    { new: true, sort: { processedAt: 1 } },
  ).lean();

  if (!claimed || typeof claimed.ocrText !== "string") return null;

  try {
    const extraction = await extractOfferWithFal(claimed.ocrText);
    const parsed = extraction.parsed;
    const now = new Date().toISOString();
    const restaurants = parsed.restaurants ?? [];
    const update: Record<string, unknown> = {
      step: "CREATED",
      rawResponse: extraction.rawResponse,
      "metadata.exactExtraction": parsed,
      "metadata.ocrCompletedAt": now,
      "metadata.ocrStatus": "complete",
    };

    if (parsed.pay !== undefined && parsed.pay > 0) {
      update.money = parsed.pay;
      update.moneyEstimated = false;
    }
    if (parsed.miles !== undefined && parsed.miles > 0) {
      update.miles = parsed.miles;
    }
    if (
      parsed.pay !== undefined &&
      parsed.pay > 0 &&
      parsed.miles !== undefined &&
      parsed.miles > 0
    ) {
      update.milesToMoneyRatio = parsed.pay / parsed.miles;
    }
    if (parsed.pickups !== undefined) {
      update["metadata.extractedData.pickups"] = parsed.pickups;
    }
    if (parsed.drops !== undefined) {
      update["metadata.extractedData.drops"] = parsed.drops;
    }
    if (parsed.items !== undefined) {
      update["metadata.extractedData.items"] = parsed.items;
    }
    if (restaurants.length > 0) {
      update.restaurantName = restaurants[0];
      update.additionalRestaurants = restaurants
        .slice(1)
        .map((name) => ({ name }));
      update["metadata.extractedData.restaurants"] = restaurants.map(
        (restaurantName) => ({ restaurantName }),
      );
    }

    await DeliveryOrder.updateOne({ _id: claimed._id }, { $set: update });

    if (parsed.pay !== undefined && parsed.pay > 0) {
      await Transaction.updateMany(
        { linkedDeliveryOrderIds: claimed._id },
        {
          $set: {
            amount: parsed.pay,
            amountEstimated: false,
          },
        },
      );
      await Transaction.updateMany(
        {
          linkedDeliveryOrderIds: claimed._id,
          notes: "Estimated pay; pending OCR correction",
        },
        { $set: { notes: "" } },
      );
    }

    return {
      entryId: claimed.entryId,
      status: "processed" as const,
      pay: parsed.pay,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await DeliveryOrder.updateOne(
      { _id: claimed._id },
      {
        $set: {
          step: "OCR_FAILED",
          "metadata.ocrStatus": "failed",
          "metadata.ocrError": message,
          "metadata.ocrFailedAt": new Date().toISOString(),
        },
      },
    );
    return {
      entryId: claimed.entryId,
      status: "failed" as const,
      error: message,
    };
  }
}

export async function processPendingOffers(options?: {
  limit?: number;
  userId?: string;
}) {
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const results: PendingOfferProcessResult[] = [];

  while (results.length < limit) {
    const result = await processOnePendingOffer(options?.userId);
    if (!result) break;
    results.push(result);
  }

  return results;
}
