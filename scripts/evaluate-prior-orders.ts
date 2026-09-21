import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import {
  DEFAULT_SETTINGS,
  evaluateOffer,
  type OfferEvaluation,
} from "@/lib/calculations";
import { evaluateOcrOfferWithJev } from "@/lib/jev-offer-evaluator";

type Comparison = {
  entryId: string;
  processedAt: Date;
  pay: number;
  miles: number;
  pickups: number;
  drops: number;
  items: number;
  jevInput: string;
  calculator: OfferEvaluation;
  jev: Awaited<ReturnType<typeof evaluateOcrOfferWithJev>>;
};

const positionalArgs = process.argv
  .slice(2)
  .filter((argument) => !argument.startsWith("--"));
const limit = Number(positionalArgs[0] ?? 10);
const userId = positionalArgs[1];
const showInputs = process.argv.includes("--verbose");

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function choiceOf(result: Comparison["jev"]) {
  const answer = result?.answers.acceptance;
  return answer?.type === "choice" ? answer.choice : "unavailable";
}

function confidenceOf(result: Comparison["jev"]) {
  const answer = result?.answers.acceptance;
  return answer?.type === "choice" && answer.confidence !== undefined
    ? `${Math.round(answer.confidence * 100)}%`
    : "-";
}

function complexityOf(result: Comparison["jev"]) {
  const answer = result?.answers.complexity;
  return answer?.type === "score" ? answer.score.toFixed(1) : "-";
}

function completionTimeOf(result: Comparison["jev"]) {
  const answer = result?.answers.completion_time;
  return answer?.type === "choice" ? answer.choice : "unavailable";
}

async function main() {
  await connectDB();

  try {
    const orders = await DeliveryOrder.find({
      ...(userId ? { userId } : {}),
      money: { $gt: 0 },
      miles: { $gte: 0 },
    })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    if (orders.length === 0) {
      console.log("No prior orders matched.");
      return;
    }

    const comparisons: Comparison[] = [];

    for (const order of orders) {
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
      const storedText = firstText(
        metadata.ocrText,
        metadata.extractedText,
        extracted.extractedText,
        order.rawResponse,
      );
      const ocrText =
        storedText ??
        `Delivery offer: $${pay.toFixed(2)}, ${miles.toFixed(1)} miles, ${pickups} pickup(s), ${drops} drop(s), ${items} item(s)`;
      const jev = await evaluateOcrOfferWithJev({ ocrText });

      comparisons.push({
        entryId: order.entryId,
        processedAt: order.processedAt,
        pay,
        miles,
        pickups,
        drops,
        items,
        jevInput: ocrText,
        calculator: evaluation,
        jev,
      });
    }

    console.log(
      "entryId | date | offer | calculator | Jev-direct | conf | complexity | $/hr",
    );
    console.log("-".repeat(110));

    for (const comparison of comparisons) {
      const { calculator } = comparison;
      const date = comparison.processedAt.toISOString().slice(0, 10);
      const offer = `$${comparison.pay.toFixed(2)}/${comparison.miles.toFixed(1)}mi`;
      const calculatorDecision =
        calculator.verdict === "bad" ? "decline" : "accept";
      console.log(
        `${comparison.entryId.slice(0, 8)} | ${date} | ${offer.padEnd(16)} | ${calculatorDecision.padEnd(10)} | ${choiceOf(comparison.jev).padEnd(7)} | ${confidenceOf(comparison.jev).padEnd(4)} | ${complexityOf(comparison.jev).padEnd(10)} | ${calculator.effectiveHourly.toFixed(2)}`,
      );
      if (showInputs) {
        console.log(`  Jev input: ${comparison.jevInput.slice(0, 1000)}`);
        console.log(
          `  Calculator: ${calculator.verdict} | ${calculator.effectiveHourly.toFixed(2)}/hr | ${calculator.totalMinutes.toFixed(1)} min`,
        );
        console.log(
          `  Jev: ${choiceOf(comparison.jev)} | confidence ${confidenceOf(comparison.jev)} | time ${completionTimeOf(comparison.jev)} | complexity ${complexityOf(comparison.jev)}`,
        );
      }
    }

    const calculatorAccepts = comparisons.filter(
      ({ calculator }) => calculator.verdict !== "bad",
    ).length;
    const jevAccepts = comparisons.filter(
      (comparison) => choiceOf(comparison.jev) === "accept",
    ).length;
    const jevDeclines = comparisons.filter(
      (comparison) => choiceOf(comparison.jev) === "decline",
    ).length;
    const jevReviews = comparisons.length - jevAccepts - jevDeclines;
    const directAgreement = comparisons.filter((comparison) => {
      const calculatorDecision =
        comparison.calculator.verdict === "bad" ? "decline" : "accept";
      return choiceOf(comparison.jev) === calculatorDecision;
    }).length;

    console.log("\nSummary");
    console.log(`Orders: ${comparisons.length}`);
    console.log(`Calculator accepts: ${calculatorAccepts}`);
    console.log(`Jev accepts: ${jevAccepts}`);
    console.log(`Jev declines: ${jevDeclines}`);
    console.log(`Jev reviews/unavailable: ${jevReviews}`);
    console.log(
      `Direct agreement: ${directAgreement}/${comparisons.length} (${Math.round((directAgreement / comparisons.length) * 100)}%)`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
