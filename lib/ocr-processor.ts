import yaml from "js-yaml";

const MOONDREAM_API_KEY = process.env.MOONDREAM_API_KEY;
const MOONDREAM_API_URL = "https://api.moondream.ai/v1/query";

interface ParsedRow {
  "Customer Name": string;
  "Customer Address": string;
}

const YAML_PROMPT = `Extract the customer information from this image. In YAML, with keys "Customer Name" and "Customer Address".`;

function parseYamlResponse(rawText: string): { row: ParsedRow | null; error: string | null } {
  rawText = rawText.trim();
  if (!rawText) {
    return { row: null, error: "empty response" };
  }

  // Log the raw response
  console.log("📝 Raw Moondream response:", rawText);

  // Try to extract YAML from the response (might have markdown code blocks or other text)
  let yamlText = rawText;
  
  // Remove markdown code blocks if present
  const yamlMatch = rawText.match(/```(?:yaml)?\s*([\s\S]*?)\s*```/) || rawText.match(/([\s\S]+)/);
  if (yamlMatch) {
    yamlText = yamlMatch[1].trim();
  }

  console.log("🔍 Extracted YAML text:", yamlText);

  try {
    // Use js-yaml to parse the YAML
    const parsed = yaml.load(yamlText) as Record<string, any>;
    
    console.log("✅ Parsed YAML object:", JSON.stringify(parsed, null, 2));
    
    // Validate required fields
    if (typeof parsed !== "object" || parsed === null) {
      return { row: null, error: "response is not a YAML object" };
    }

    const row: ParsedRow = {
      "Customer Name": String(parsed["Customer Name"] || parsed.customerName || parsed.name || "").trim(),
      "Customer Address": String(parsed["Customer Address"] || parsed.customerAddress || parsed.address || "").trim(),
    };

    console.log("📊 Extracted row data:", JSON.stringify(row, null, 2));

    // Validate that we have at least some data
    if (!row["Customer Name"] && !row["Customer Address"]) {
      return { row: null, error: "all fields are empty" };
    }

    // Validate that we don't have placeholder text
    const headers = ["Customer Name", "Customer Address"];
    for (const header of headers) {
      const value = row[header as keyof ParsedRow].toLowerCase();
      if (value && value.startsWith(header.toLowerCase())) {
        return { row: null, error: `${header} still contains placeholder text` };
      }
    }

    return { row, error: null };
  } catch (parseError) {
    console.error("❌ YAML parse error:", parseError);
    return { 
      row: null, 
      error: `YAML parse error: ${parseError instanceof Error ? parseError.message : "unknown error"}` 
    };
  }
}

async function requestYamlRow(
  imageBase64: string,
  maxAttempts: number = 3
): Promise<{ row: ParsedRow; rawResponse: string }> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  let lastError: string | null = null;
  let currentPrompt = YAML_PROMPT;

  // Ensure the image is in data URL format
  let imageUrl = imageBase64;
  if (!imageUrl.startsWith("data:image")) {
    // If it's just base64, add the data URL prefix
    imageUrl = `data:image/png;base64,${imageUrl}`;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      currentPrompt = `${YAML_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Please return valid YAML with exactly "Customer Name" and "Customer Address" fields.`;
    }

    try {
      const response = await fetch(MOONDREAM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Moondream-Auth": MOONDREAM_API_KEY,
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
      const rawResponse = (data.answer || "").trim();

      const { row, error } = parseYamlResponse(rawResponse);
      if (row && !error) {
        return { row, rawResponse };
      }
      lastError = error || "unknown parsing error";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
    }
  }

  throw new Error(`Failed to obtain valid YAML response after ${maxAttempts} attempts: ${lastError}`);
}

const JSON_METADATA_PROMPT = `return everything as JSON`;

async function extractJsonMetadata(
  imageBase64: string,
  maxAttempts: number = 3
): Promise<Record<string, any>> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  let lastError: string | null = null;
  let currentPrompt = JSON_METADATA_PROMPT;

  // Ensure the image is in data URL format
  let imageUrl = imageBase64;
  if (!imageUrl.startsWith("data:image")) {
    // If it's just base64, add the data URL prefix
    imageUrl = `data:image/png;base64,${imageUrl}`;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      currentPrompt = `${JSON_METADATA_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Please return valid JSON only, no markdown code blocks or additional text.`;
    }

    try {
      const response = await fetch(MOONDREAM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Moondream-Auth": MOONDREAM_API_KEY,
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
      const rawResponse = (data.answer || "").trim();

      // Try to extract JSON from the response (might have markdown code blocks or other text)
      let jsonText = rawResponse;
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawResponse.match(/([\s\S]+)/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      try {
        const metadata = JSON.parse(jsonText);
        if (typeof metadata === "object" && metadata !== null) {
          console.log("✅ Extracted JSON metadata:", JSON.stringify(metadata, null, 2));
          return metadata;
        }
        lastError = "response is not a JSON object";
      } catch (parseError) {
        lastError = `JSON parse error: ${parseError instanceof Error ? parseError.message : "unknown error"}`;
        console.error("❌ JSON parse error:", parseError);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
    }
  }

  // If we can't get valid JSON after all attempts, return empty object rather than throwing
  // This allows the YAML extraction to still work
  console.warn(`⚠️ Failed to extract JSON metadata after ${maxAttempts} attempts: ${lastError}`);
  return {};
}

export async function processOcrScreenshot(screenshot: string): Promise<{
  customerName: string;
  customerAddress: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  // Call both YAML extraction (existing) and JSON metadata extraction (new)
  const [yamlResult, metadata] = await Promise.all([
    requestYamlRow(screenshot),
    extractJsonMetadata(screenshot).catch((error) => {
      console.error("Error extracting JSON metadata:", error);
      return {};
    }),
  ]);

  const { row, rawResponse } = yamlResult;

  return {
    customerName: row["Customer Name"],
    customerAddress: row["Customer Address"],
    rawResponse,
    metadata,
  };
}
