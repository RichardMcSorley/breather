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
  ocrText?: string
): Promise<{ row: ParsedRow; rawResponse: string }> {
  if (!MOONDREAM_API_KEY) {
    // Return unknown values instead of throwing
    return {
      row: {
        "Customer Name": "unknown",
        "Customer Address": "unknown",
      },
      rawResponse: "MOONDREAM_API_KEY not set",
    };
  }

  const basePrompt = ocrText ? `${YAML_PROMPT}\n\nEXTRACTED TEXT:\n${ocrText}` : YAML_PROMPT;

  // Ensure the image is in data URL format
  let imageUrl = imageBase64;
  if (!imageUrl.startsWith("data:image")) {
    // If it's just base64, add the data URL prefix
    imageUrl = `data:image/png;base64,${imageUrl}`;
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
        question: basePrompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Moondream API error: ${response.status} - ${errorText}`);
      // Return unknown values instead of throwing
      return {
        row: {
          "Customer Name": "unknown",
          "Customer Address": "unknown",
        },
        rawResponse: `API error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    const rawResponse = (data.answer || "").trim();

    const { row, error } = parseYamlResponse(rawResponse);
    if (row && !error) {
      return { row, rawResponse };
    }
    
    // If parsing failed, return unknown values
    console.error(`Failed to parse YAML response: ${error}`);
    return {
      row: {
        "Customer Name": "unknown",
        "Customer Address": "unknown",
      },
      rawResponse,
    };
  } catch (error) {
    console.error("Moondream API request failed:", error);
    // Return unknown values instead of throwing
    return {
      row: {
        "Customer Name": "unknown",
        "Customer Address": "unknown",
      },
      rawResponse: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export async function processOcrScreenshot(
  screenshot: string,
  ocrText?: string
): Promise<{
  customerName: string;
  customerAddress: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  // Call YAML extraction (no retries, returns unknown on failure)
  const yamlResult = await requestYamlRow(screenshot, ocrText);
  const { row, rawResponse } = yamlResult;
  
  // Use extracted values, which will be "unknown" if extraction failed
  const customerName = row["Customer Name"] || "unknown";
  const customerAddress = row["Customer Address"] || "unknown";

  // Use ocrText as metadata instead of calling extractJsonMetadata
  const metadata: Record<string, any> = ocrText ? { extractedText: ocrText } : {};

  return {
    customerName,
    customerAddress,
    rawResponse,
    metadata,
  };
}
