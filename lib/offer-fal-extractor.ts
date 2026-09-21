import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const SYSTEM_PROMPT = `You extract delivery offer details from text. Return ONLY valid JSON.

SCHEMA:
- pay: Total dollar amount (number) - add base + tip if separate
- pickups: Number of pickups (integer, default 1)
- drops: Number of drop-offs (integer, default 1)
- miles: Distance in miles (number)
- items: Shopping items count (integer, default 0)
- restaurants: List of restaurant names (array of strings, default [])

RULES:
- Add base pay + tip together for total pay
- "batch" or multiple orders = multiple drops
- "shop and deliver" = has items
- Only include fields you find
- Return ONLY JSON, no explanation`;

export type ExactOfferExtraction = {
  pay?: number;
  pickups?: number;
  drops?: number;
  miles?: number;
  items?: number;
  restaurants?: string[];
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseExtraction(value: unknown): ExactOfferExtraction {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const restaurants = Array.isArray(record.restaurants)
    ? record.restaurants.filter(
        (restaurant): restaurant is string => typeof restaurant === "string",
      )
    : undefined;

  return {
    pay: finiteNumber(record.pay),
    pickups: finiteNumber(record.pickups),
    drops: finiteNumber(record.drops),
    miles: finiteNumber(record.miles),
    items: finiteNumber(record.items),
    ...(restaurants && { restaurants }),
  };
}

export async function extractOfferWithFal(ocrText: string) {
  if (!process.env.FAL_KEY) {
    throw new Error("FAL_KEY not configured");
  }

  const result = await fal.subscribe("openrouter/router", {
    input: {
      prompt: `${SYSTEM_PROMPT}\n\nInput: "${ocrText}"\nOutput:`,
      model: "google/gemini-3-flash-preview",
    },
  });

  const data = result.data as { output?: unknown };
  const rawResponse = typeof data.output === "string" ? data.output : "";
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("FAL extraction did not return JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (error) {
    throw new Error(
      `Could not parse FAL extraction: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { parsed: parseExtraction(parsed), rawResponse };
}
