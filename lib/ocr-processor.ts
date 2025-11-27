import { vl } from "moondream";

const MOONDREAM_ENDPOINT = process.env.MOONDREAM_ENDPOINT;

const CSV_HEADERS = ["Customer Name", "Customer Address"];

const CSV_PROMPT = `Output one tab-separated row with these columns: ${CSV_HEADERS.join(", ")}.`;

interface ParsedRow {
  "Customer Name": string;
  "Customer Address": string;
}

function normalizeRawText(rawText: string): string {
  rawText = rawText.trim();
  if (!rawText) {
    return "";
  }

  const lines = rawText.split("\n").map((line) => line.trim()).filter((line) => line);
  if (!lines.length) {
    return "";
  }

  // If tabs already present anywhere, collapse multiple whitespace-only lines
  if (lines.some((line) => line.includes("\t"))) {
    return lines.filter((line) => line).join("\t");
  }

  // Special case: two-column output without delimiters (name on first line, address on rest)
  if (lines.length >= 2 && !lines[0].includes(",")) {
    const name = lines[0];
    const address = lines.slice(1).join(" ");
    return `${name}\t${address}`;
  }

  // Otherwise treat commas/quoted CSV, even if broken across lines.
  const strippedLines = lines.map((line) => line.replace(/,$/, ""));
  return strippedLines.join(",");
}

function parseCsvRow(rawText: string): { row: ParsedRow | null; error: string | null } {
  const normalizedText = normalizeRawText(rawText);
  if (!normalizedText) {
    return { row: null, error: "empty response" };
  }

  const delimiter = normalizedText.includes("\t") ? "\t" : ",";
  const parts = normalizedText.split(delimiter).map((part) => part.trim());

  if (parts.length < CSV_HEADERS.length) {
    return { row: null, error: `expected ${CSV_HEADERS.length} columns, got ${parts.length}` };
  }

  // Take the last N columns if we have more than expected
  const relevantParts = parts.slice(-CSV_HEADERS.length);

  const row: ParsedRow = {
    "Customer Name": relevantParts[0] || "",
    "Customer Address": relevantParts[1] || "",
  };

  // Validate that we don't have placeholder text
  for (const header of CSV_HEADERS) {
    const value = row[header as keyof ParsedRow].toLowerCase();
    if (value && value.startsWith(header.toLowerCase())) {
      return { row: null, error: `${header} still contains placeholder text` };
    }
  }

  return { row, error: null };
}

async function requestCsvRow(
  imageBase64: string,
  model: vl,
  maxAttempts: number = 3
): Promise<{ row: ParsedRow; rawResponse: string }> {
  let lastError: string | null = null;
  let currentPrompt = CSV_PROMPT;

  // Convert base64 to buffer for moondream
  // Remove data URL prefix if present
  let base64Data = imageBase64;
  if (base64Data.startsWith("data:image")) {
    base64Data = base64Data.split(",")[1];
  }
  const imageBuffer = Buffer.from(base64Data, "base64");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      currentPrompt = `${CSV_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Respond again with only one line containing exactly ${CSV_HEADERS.length} tab-separated fields in the specified order.`;
    }

    try {
      const response = await model.query({
        image: imageBuffer,
        question: currentPrompt,
      });
      
      // Handle both string and async generator responses
      let rawCsv: string;
      if (typeof response.answer === "string") {
        rawCsv = response.answer.trim();
      } else {
        // Handle async generator - collect all chunks
        let fullAnswer = "";
        for await (const chunk of response.answer) {
          fullAnswer += chunk;
        }
        rawCsv = fullAnswer.trim();
      }

      const { row, error } = parseCsvRow(rawCsv);
      if (row && !error) {
        return { row, rawResponse: rawCsv };
      }
      lastError = error || "unknown parsing error";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
    }
  }

  throw new Error(`Failed to obtain valid CSV row after ${maxAttempts} attempts: ${lastError}`);
}

export async function processOcrScreenshot(screenshot: string): Promise<{
  customerName: string;
  customerAddress: string;
  rawResponse: string;
}> {
  // Initialize Moondream model with custom endpoint
  const model = new vl({ endpoint: MOONDREAM_ENDPOINT });

  const { row, rawResponse } = await requestCsvRow(screenshot, model);

  return {
    customerName: row["Customer Name"],
    customerAddress: row["Customer Address"],
    rawResponse,
  };
}

