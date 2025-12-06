import yaml from "js-yaml";

const MOONDREAM_API_KEY = process.env.MOONDREAM_API_KEY;
const MOONDREAM_API_URL = "https://api.moondream.ai/v1/query";

interface ParsedOrder {
  Miles: number;
  Money: number;
  "Restaurant/Pickup Name": string;
}

const YAML_PROMPT = `Extract the delivery order information from this image. Return in YAML format with the following keys: Miles, Money, "Restaurant/Pickup Name".`

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
  maxAttempts: number = 3,
  ocrText?: string
): Promise<{ order: ParsedOrder; rawResponse: string }> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  let lastError: string | null = null;
  let basePrompt = YAML_PROMPT;
  if (ocrText) {
    basePrompt = `${YAML_PROMPT}\n\nEXTRACTED TEXT:\n${ocrText}`;
  }
  let currentPrompt = basePrompt;

  // Ensure the image is in data URL format
  let imageUrl = imageBase64;
  if (!imageUrl.startsWith("data:image")) {
    // If it's just base64, add the data URL prefix
    imageUrl = `data:image/png;base64,${imageUrl}`;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const retryPrompt = `${YAML_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Please return valid YAML with exactly "Miles" (number), "Money" (number), "Restaurant/Pickup Name" (string), and "Time" (string) fields.`;
      currentPrompt = ocrText ? `${retryPrompt}\n\nEXTRACTED TEXT:\n${ocrText}` : retryPrompt;
    } else {
      currentPrompt = basePrompt;
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

export async function processOrderScreenshot(
  screenshot: string,
  ocrText?: string
): Promise<{
  miles: number;
  money: number;
  restaurantName: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  // Call YAML extraction
  const yamlResult = await requestYamlOrder(screenshot, 3, ocrText);
  const { order, rawResponse } = yamlResult;

  // Use ocrText as metadata instead of calling extractJsonMetadata
  const metadata: Record<string, any> = ocrText ? { extractedText: ocrText } : {};

  return {
    miles: order.Miles,
    money: order.Money,
    restaurantName: order["Restaurant/Pickup Name"],
    rawResponse,
    metadata,
  };
}

interface ParsedRestaurant {
  "Restaurant Name": string;
  Address: string;
}

const RESTAURANT_YAML_PROMPT = `Extract the restaurant information from this image. In YAML, with keys "Restaurant Name" and "Address".`

function parseRestaurantYamlResponse(rawText: string): { restaurant: ParsedRestaurant | null; error: string | null } {
  rawText = rawText.trim();
  if (!rawText) {
    return { restaurant: null, error: "empty response" };
  }

  console.log("📝 Raw Moondream restaurant response:", rawText);

  let yamlText = rawText;
  const yamlMatch = rawText.match(/```(?:yaml)?\s*([\s\S]*?)\s*```/) || rawText.match(/([\s\S]+)/);
  if (yamlMatch) {
    yamlText = yamlMatch[1].trim();
  }

  console.log("🔍 Extracted restaurant YAML text:", yamlText);

  try {
    const parsed = yaml.load(yamlText) as Record<string, any>;
    
    console.log("✅ Parsed restaurant YAML object:", JSON.stringify(parsed, null, 2));
    
    if (typeof parsed !== "object" || parsed === null) {
      return { restaurant: null, error: "response is not a YAML object" };
    }

    const restaurantName = parsed["Restaurant Name"] ?? parsed.restaurantName ?? parsed.restaurant ?? parsed.name ?? "";
    const address = parsed["Address"] ?? parsed.address ?? "";

    const restaurant: ParsedRestaurant = {
      "Restaurant Name": String(restaurantName).trim(),
      Address: String(address).trim(),
    };

    console.log("📊 Extracted restaurant data:", JSON.stringify(restaurant, null, 2));

    if (!restaurant["Restaurant Name"]) {
      return { restaurant: null, error: "Restaurant Name is required" };
    }
    if (!restaurant.Address) {
      return { restaurant: null, error: "Address is required" };
    }

    return { restaurant, error: null };
  } catch (parseError) {
    console.error("❌ Restaurant YAML parse error:", parseError);
    return { 
      restaurant: null, 
      error: `YAML parse error: ${parseError instanceof Error ? parseError.message : "unknown error"}` 
    };
  }
}

async function requestRestaurantYaml(
  imageBase64: string,
  maxAttempts: number = 3,
  ocrText?: string
): Promise<{ restaurant: ParsedRestaurant; rawResponse: string }> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  let lastError: string | null = null;
  let basePrompt = RESTAURANT_YAML_PROMPT;
  if (ocrText) {
    basePrompt = `${RESTAURANT_YAML_PROMPT}\n\nEXTRACTED TEXT:\n${ocrText}`;
  }
  let currentPrompt = basePrompt;

  let imageUrl = imageBase64;
  if (!imageUrl.startsWith("data:image")) {
    imageUrl = `data:image/png;base64,${imageUrl}`;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const retryPrompt = `${RESTAURANT_YAML_PROMPT}\n\nThe previous response was invalid because ${lastError || "it could not be parsed"}. Please return valid YAML with exactly "Restaurant Name" and "Address" fields.`;
      currentPrompt = ocrText ? `${retryPrompt}\n\nEXTRACTED TEXT:\n${ocrText}` : retryPrompt;
    } else {
      currentPrompt = basePrompt;
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

      const { restaurant, error } = parseRestaurantYamlResponse(rawResponse);
      if (restaurant && !error) {
        return { restaurant, rawResponse };
      }
      lastError = error || "unknown parsing error";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
    }
  }

  throw new Error(`Failed to obtain valid YAML response after ${maxAttempts} attempts: ${lastError}`);
}

export async function processRestaurantScreenshot(
  screenshot: string,
  ocrText?: string
): Promise<{
  restaurantName: string;
  address: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  if (!MOONDREAM_API_KEY) {
    throw new Error("MOONDREAM_API_KEY environment variable is not set");
  }

  const yamlResult = await requestRestaurantYaml(screenshot, 3, ocrText);
  const { restaurant, rawResponse } = yamlResult;

  const metadata: Record<string, any> = ocrText ? { extractedText: ocrText } : {};

  return {
    restaurantName: restaurant["Restaurant Name"],
    address: restaurant.Address,
    rawResponse,
    metadata,
  };
}

