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
  endpoint: string,
  maxAttempts: number = 3
): Promise<{ row: ParsedRow; rawResponse: string }> {
  if (!endpoint) {
    throw new Error("MOONDREAM_ENDPOINT environment variable is not set");
  }

  let lastError: string | null = null;
  let currentPrompt = CSV_PROMPT;

  // Ensure the image is in data URL format
  let imageUrl = imageBase64;
  if (!imageUrl.startsWith("data:image")) {
    // If it's just base64, add the data URL prefix
    imageUrl = `data:image/png;base64,${imageUrl}`;
  }

  // Ensure endpoint has /v1/query path
  const queryUrl = endpoint.endsWith("/") 
    ? `${endpoint}v1/query` 
    : `${endpoint}/v1/query`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      currentPrompt = `${CSV_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Respond again with only one line containing exactly ${CSV_HEADERS.length} tab-separated fields in the specified order.`;
    }

    try {
      const response = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
          question: currentPrompt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Moondream API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const rawCsv = (data.answer || "").trim();

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
  if (!MOONDREAM_ENDPOINT) {
    throw new Error("MOONDREAM_ENDPOINT environment variable is not set");
  }

  const { row, rawResponse } = await requestCsvRow(screenshot, MOONDREAM_ENDPOINT);

  return {
    customerName: row["Customer Name"],
    customerAddress: row["Customer Address"],
    rawResponse,
  };
}

