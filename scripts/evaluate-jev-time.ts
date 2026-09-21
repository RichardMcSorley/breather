import "dotenv/config";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { evaluateOcrOfferWithJev } from "@/lib/jev-offer-evaluator";

const limit = Math.max(1, Number.parseInt(process.argv[2] ?? "20", 10));
const databasePath = resolve(
  process.argv[3] ?? ".analysis/delivery-orders.sqlite",
);

type StoredOrder = {
  entry_id: string;
  app_name: string | null;
  text: string;
};

type TimeBucket = "under_20" | "20_to_29" | "30_to_59" | "60_plus" | "unknown";

type ExpectedTime = {
  bucket: TimeBucket;
  minutes: number | null;
  basis: string;
};

type AppStats = {
  orders: number;
  missingSignal: number;
  comparable: number;
  matches: number;
  mismatches: number;
  jevUnknown: number;
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

function bucketForMinutes(minutes: number): TimeBucket {
  if (minutes < 20) return "under_20";
  if (minutes < 30) return "20_to_29";
  if (minutes < 60) return "30_to_59";
  return "60_plus";
}

function clockMinutes(hour: number, minute: number, meridiem?: string) {
  let normalizedHour = hour;
  if (meridiem?.toLowerCase() === "pm" && normalizedHour < 12) {
    normalizedHour += 12;
  }
  if (meridiem?.toLowerCase() === "am" && normalizedHour === 12) {
    normalizedHour = 0;
  }
  return normalizedHour * 60 + minute;
}

function expectedTime(text: string): ExpectedTime {
  const explicit = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i);
  if (explicit) {
    const minutes = Number(explicit[1]);
    return {
      bucket: bucketForMinutes(minutes),
      minutes,
      basis: "explicit_minutes",
    };
  }

  const deadline = text.match(
    /\b(?:deliver|complete|delivery)\s+by\D{0,20}(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)?\b/i,
  );
  if (!deadline) {
    return { bucket: "unknown", minutes: null, basis: "no_time_signal" };
  }

  const timePattern = /\b(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.|am|pm)?\b/gi;
  const current = timePattern.exec(text);
  if (!current) {
    return {
      bucket: "unknown",
      minutes: null,
      basis: "deadline_without_current_time",
    };
  }

  const deadlineMeridiem = deadline[3];
  const currentValue = clockMinutes(
    Number(current[1]),
    Number(current[2]),
    current[3] ?? deadlineMeridiem,
  );
  let deadlineValue = clockMinutes(
    Number(deadline[1]),
    Number(deadline[2] ?? 0),
    deadlineMeridiem,
  );

  if (!deadlineMeridiem && deadlineValue < currentValue) {
    deadlineValue += 12 * 60;
  }

  const minutes = deadlineValue - currentValue;
  if (minutes < 0 || minutes > 180) {
    return { bucket: "unknown", minutes: null, basis: "invalid_time_interval" };
  }

  return {
    bucket: bucketForMinutes(minutes),
    minutes,
    basis: "current_to_deadline",
  };
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

  if (orders.length === 0) {
    throw new Error(
      "No stored OCR text found. Refresh the SQLite export first.",
    );
  }

  const counts = new Map<string, number>();
  const appStats = new Map<string, AppStats>();
  let comparable = 0;
  let matches = 0;

  for (const order of orders) {
    const expected = expectedTime(order.text);
    const app = order.app_name ?? "unknown";
    const stats = appStats.get(app) ?? {
      orders: 0,
      missingSignal: 0,
      comparable: 0,
      matches: 0,
      mismatches: 0,
      jevUnknown: 0,
    };
    stats.orders += 1;
    const jev = await evaluateOcrOfferWithJev({ ocrText: order.text });
    const answer = jev?.answers.completion_time;
    const observed = answer?.type === "choice" ? answer.choice : "unknown";
    counts.set(observed, (counts.get(observed) ?? 0) + 1);

    const match = expected.bucket !== "unknown" && observed === expected.bucket;
    if (expected.bucket === "unknown") {
      stats.missingSignal += 1;
    } else {
      comparable += 1;
      stats.comparable += 1;
      if (match) {
        matches += 1;
        stats.matches += 1;
      } else {
        stats.mismatches += 1;
      }
    }
    if (observed === "unknown") stats.jevUnknown += 1;
    appStats.set(app, stats);

    console.log(
      `${order.entry_id} | ${order.app_name ?? "unknown"} | expected ${expected.bucket}` +
        `${expected.minutes === null ? "" : ` (${expected.minutes}m)`}` +
        ` via ${expected.basis} | Jev ${observed} | ${match ? "MATCH" : "CHECK"}`,
    );
  }

  console.log("\nJev time classifications:");
  for (const [bucket, count] of counts) console.log(`${bucket}: ${count}`);
  console.log(`Comparable: ${comparable}/${orders.length}`);
  console.log(
    `Bucket agreement: ${matches}/${comparable || 0}` +
      (comparable ? ` (${Math.round((matches / comparable) * 100)}%)` : ""),
  );
  console.log("\nBy app:");
  console.table(
    [...appStats.entries()].map(([app, stats]) => ({
      app,
      ...stats,
      agreement:
        stats.comparable > 0
          ? `${Math.round((stats.matches / stats.comparable) * 100)}%`
          : "-",
    })),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
