import yaml from "js-yaml";

const MOONDREAM_API_KEY = process.env.MOONDREAM_API_KEY;
const MOONDREAM_API_URL = "https://api.moondream.ai/v1/query";

interface ParsedOrder {
  Miles: number;
  Money: number;
  "Restaurant/Pickup Name": string;
}

const YAML_PROMPT = `Extract the delivery order information from this image. Return in YAML format with the following keys:
- "Miles": The number of miles for this delivery (as a number, e.g., 2.5)
- "Money": The payment amount for this delivery (as a number, e.g., 8.50)
- "Restaurant/Pickup Name": The name of the restaurant or pickup location`;

function parseYamlResponse(rawText: string): { order: ParsedOrder | null; error: string | null } {
  rawText = rawText.trim();
  if (!rawText) {
    return { order: null, error: "empty response" };
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
      return { order: null, error: "response is not a YAML object" };
    }

    // Extract and parse values with fallbacks
    const milesValue = parsed["Miles"] ?? parsed.miles ?? parsed.Miles ?? 0;
    const moneyValue = parsed["Money"] ?? parsed.money ?? parsed.Money ?? 0;
    const restaurantName = parsed["Restaurant/Pickup Name"] ?? parsed["Restaurant Name"] ?? parsed.restaurantName ?? parsed.restaurant ?? parsed["Pickup Name"] ?? "";

    // Convert to numbers, handling strings that might contain currency symbols or units
    const miles = typeof milesValue === "number" 
      ? milesValue 
      : parseFloat(String(milesValue).replace(/[^\d.]/g, "")) || 0;
    
    const money = typeof moneyValue === "number"
      ? moneyValue
      : parseFloat(String(moneyValue).replace(/[^\d.]/g, "")) || 0;

    const order: ParsedOrder = {
      Miles: miles,
      Money: money,
      "Restaurant/Pickup Name": String(restaurantName).trim(),
    };

    console.log("📊 Extracted order data:", JSON.stringify(order, null, 2));

    // Validate that we have required numeric fields
    if (order.Miles <= 0) {
      return { order: null, error: "Miles must be greater than 0" };
    }
    if (order.Money <= 0) {
      return { order: null, error: "Money must be greater than 0" };
    }
    if (!order["Restaurant/Pickup Name"]) {
      return { order: null, error: "Restaurant/Pickup Name is required" };
    }

    return { order, error: null };
  } catch (parseError) {
    console.error("❌ YAML parse error:", parseError);
    return { 
      order: null, 
      error: `YAML parse error: ${parseError instanceof Error ? parseError.message : "unknown error"}` 
    };
  }
}

async function requestYamlOrder(
  imageBase64: string,
  maxAttempts: number = 3
): Promise<{ order: ParsedOrder; rawResponse: string }> {
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
      currentPrompt = `${YAML_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Please return valid YAML with exactly "Miles" (number), "Money" (number), "Restaurant/Pickup Name" (string), and "Time" (string) fields.`;
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

      const { order, error } = parseYamlResponse(rawResponse);
      if (order && !error) {
        return { order, rawResponse };
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

export async function processOrderScreenshot(screenshot: string): Promise<{
  miles: number;
  money: number;
  restaurantName: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  // Call both YAML extraction (existing) and JSON metadata extraction (new)
  const [yamlResult, metadata] = await Promise.all([
    requestYamlOrder(screenshot),
    extractJsonMetadata(screenshot).catch((error) => {
      console.error("Error extracting JSON metadata:", error);
      return {};
    }),
  ]);

  const { order, rawResponse } = yamlResult;

  return {
    miles: order.Miles,
    money: order.Money,
    restaurantName: order["Restaurant/Pickup Name"],
    rawResponse,
    metadata,
  };
}

