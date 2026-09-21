import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";

const outputPath = resolve(
  process.argv[2] ?? ".analysis/delivery-orders.sqlite",
);

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function textOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = textOrNull(value);
    if (text) return text;
  }
  return null;
}

function jsonOrNull(value: unknown) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function sqlValue(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = String(value).replaceAll("'", "''");
  return `'${text}'`;
}

async function main() {
  await connectDB();

  try {
    const orders = await DeliveryOrder.find({}).sort({ processedAt: 1 }).lean();
    const rows = orders.map((order) => {
      const metadata = order.metadata ?? {};
      const extracted = metadata.extractedData ?? metadata;
      const ocrText = firstText(
        metadata.ocrText,
        metadata.extractedText,
        extracted.extractedText,
      );
      const rawResponse = stringOrNull(order.rawResponse);
      const analysisText = ocrText ?? rawResponse;
      const analysisTextSource = ocrText
        ? "stored_ocr_text"
        : rawResponse
          ? "raw_response_fallback"
          : null;
      const processedAt =
        order.processedAt instanceof Date
          ? order.processedAt.toISOString()
          : String(order.processedAt);

      return [
        String(order._id),
        order.entryId,
        order.userId,
        stringOrNull(order.appName),
        numberOrNull(order.money),
        numberOrNull(order.miles),
        numberOrNull(order.milesToMoneyRatio),
        stringOrNull(order.restaurantName),
        stringOrNull(order.restaurantAddress),
        stringOrNull(order.time),
        processedAt,
        firstText(extracted.time),
        firstText(extracted.delivery_time, extracted.deliveryTime),
        firstText(
          extracted.distance,
          extracted.delivery_distance,
          extracted.guaranteed_delivery_miles,
        ),
        firstText(
          extracted.price,
          extracted.earnings,
          extracted.guaranteed_amount,
        ),
        firstText(
          extracted.pickups,
          extracted.pickup,
          extracted.pickup_location,
        ),
        firstText(
          extracted.drops,
          extracted.drop,
          extracted.customer_dropoff,
          extracted.customer_dropoff_location,
        ),
        firstText(
          extracted.items,
          extracted.total_items,
          extracted.items_for_delivery,
        ),
        firstText(extracted.orderType, extracted.order_type),
        firstText(extracted.completionTime, extracted.completion_time),
        firstText(extracted.completeBy, extracted.complete_by),
        firstText(
          extracted.deliverBy,
          extracted.deliver_by,
          extracted.delivery_delivery_by,
        ),
        ocrText,
        rawResponse,
        analysisText,
        analysisTextSource,
        analysisText,
        analysisTextSource,
        jsonOrNull(extracted),
        jsonOrNull(order.additionalRestaurants),
        jsonOrNull(metadata),
        order.screenshot ? 1 : 0,
        typeof order.screenshot === "string" ? order.screenshot.length : 0,
      ];
    });

    const columns = [
      "mongo_id",
      "entry_id",
      "user_id",
      "app_name",
      "pay",
      "miles",
      "miles_to_pay",
      "restaurant_name",
      "restaurant_address",
      "offer_time",
      "processed_at",
      "extracted_time",
      "delivery_time_text",
      "distance_text",
      "pay_text",
      "pickups_text",
      "drops_text",
      "items_text",
      "order_type",
      "completion_time",
      "complete_by",
      "deliver_by",
      "ocr_text",
      "raw_response",
      "analysis_text",
      "analysis_text_source",
      "text",
      "text_source",
      "extracted_json",
      "additional_restaurants_json",
      "metadata_json",
      "screenshot_present",
      "screenshot_length",
    ];

    const statements = [
      "PRAGMA journal_mode = WAL;",
      "DROP TABLE IF EXISTS delivery_orders;",
      `CREATE TABLE delivery_orders (${columns
        .map(
          (column) =>
            `${column} ${column.endsWith("_json") || column.includes("text") || column.includes("name") || column.includes("address") || column.includes("time") || column.includes("id") || column === "app_name" || column === "raw_response" || column === "processed_at" ? "TEXT" : column === "screenshot_present" || column === "screenshot_length" ? "INTEGER" : "REAL"}`,
        )
        .join(", ")});`,
      `CREATE INDEX idx_delivery_orders_processed_at ON delivery_orders(processed_at);`,
      `CREATE INDEX idx_delivery_orders_app_name ON delivery_orders(app_name);`,
      `CREATE INDEX idx_delivery_orders_verification ON delivery_orders(pay, miles);`,
      ...rows.map(
        (row) =>
          `INSERT INTO delivery_orders (${columns.join(", ")}) VALUES (${row
            .map(sqlValue)
            .join(", ")});`,
      ),
    ];

    mkdirSync(dirname(outputPath), { recursive: true });
    execFileSync("sqlite3", [outputPath], {
      input: `${statements.join("\n")}\n`,
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    });

    console.log(`Exported ${orders.length} orders to ${outputPath}`);
    console.log(
      "Includes structured fields, extracted JSON, available OCR text, raw response, analysis text, and text alias.",
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
