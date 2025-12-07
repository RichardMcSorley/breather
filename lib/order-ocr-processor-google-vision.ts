import { ImageAnnotatorClient } from "@google-cloud/vision";

/**
 * Initialize Google Vision client with credentials from environment variables
 * Supports Vercel deployment by reading credentials from env vars
 * 
 * Priority:
 * 1. GOOGLE_VISION_CREDENTIALS (JSON string) - for Vercel/serverless
 * 2. GOOGLE_APPLICATION_CREDENTIALS (file path) - for local development
 * 3. Default credentials - for GCP environments
 */
function createVisionClient(): ImageAnnotatorClient {
  // Check if we have service account credentials in environment variable (Vercel/serverless)
  const credentialsJson = process.env.GOOGLE_VISION_CREDENTIALS;
  
  if (credentialsJson) {
    try {
      // Parse the JSON credentials from environment variable
      // The JSON might be minified (single line) or formatted
      const credentials = typeof credentialsJson === 'string' 
        ? JSON.parse(credentialsJson) 
        : credentialsJson;
      
      return new ImageAnnotatorClient({
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key.replace(/\\n/g, '\n'), // Handle escaped newlines
          project_id: credentials.project_id,
        },
      });
    } catch (error) {
      console.error("Failed to parse GOOGLE_VISION_CREDENTIALS:", error);
      // Fall back to default credentials
      return new ImageAnnotatorClient();
    }
  }
  
  // Fall back to default credentials
  // This will use GOOGLE_APPLICATION_CREDENTIALS if set, or default service account
  return new ImageAnnotatorClient();
}

interface ParsedOrder {
  miles: number;
  money: number;
  restaurantName: string;
}

interface ParsedRestaurant {
  restaurantName: string;
  address: string;
}

/**
 * Extracts order information (miles, money, restaurant name) from OCR text
 */
function parseOrderFromText(ocrText: string): ParsedOrder | null {
  const text = ocrText.trim();
  if (!text) {
    return null;
  }

  console.log("📝 Raw Google Vision OCR text for order:", text);

  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  let miles = 0;
  let money = 0;
  let restaurantName = "";

  // Pattern matching for miles
  const milesPatterns = [
    /(\d+\.?\d*)\s*(?:mi|mile|miles|MI|MILE|MILES)/i,
    /(\d+\.?\d*)\s*(?:km|kilometer|kilometers|KM)/i,
  ];

  // Pattern matching for money
  const moneyPatterns = [
    /\$(\d+\.?\d*)/,
    /(\d+\.?\d*)\s*(?:dollar|dollars|USD)/i,
  ];

  // Search through all lines for miles and money
  for (const line of lines) {
    // Try to find miles
    for (const pattern of milesPatterns) {
      const match = line.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0) {
          if (pattern.source.includes("km")) {
            miles = value * 0.621371;
          } else {
            miles = value;
          }
          break;
        }
      }
    }

    // Try to find money
    for (const pattern of moneyPatterns) {
      const match = line.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0) {
          money = value;
          break;
        }
      }
    }
  }

  // If no miles found with patterns, look for standalone numbers
  if (miles === 0) {
    for (const line of lines) {
      const numberMatch = line.match(/(\d+\.?\d*)/);
      if (numberMatch) {
        const value = parseFloat(numberMatch[1]);
        if (value > 0 && value <= 100 && !line.includes("$") && !line.includes("dollar")) {
          miles = value;
          break;
        }
      }
    }
  }

  // Extract restaurant name
  const skipPatterns = [
    /^(back|close|menu|settings|home|search|filter|sort|order|delivery|pickup)$/i,
    /^\d+\.?\d*\s*(?:mi|mile|miles|km|\$|dollar)/i,
    /^\$?\d+\.?\d*$/,
    /^[^\w\s]+$/,
  ];

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }
    
    if (milesPatterns.some((p) => p.test(line)) || moneyPatterns.some((p) => p.test(line))) {
      continue;
    }

    if (line.length > 2 && line.length < 50 && /[A-Za-z]/.test(line)) {
      restaurantName = line;
      break;
    }
  }

  // Fallback: if no restaurant name found
  if (!restaurantName && lines.length > 0) {
    for (const line of lines) {
      if (
        line.length > 2 &&
        line.length < 50 &&
        /[A-Za-z]/.test(line) &&
        !skipPatterns.some((pattern) => pattern.test(line))
      ) {
        restaurantName = line;
        break;
      }
    }
  }

  const result: ParsedOrder = {
    miles: miles || 0,
    money: money || 0,
    restaurantName: restaurantName || "unknown",
  };

  console.log("📊 Extracted order data:", JSON.stringify(result, null, 2));

  if (miles === 0 && money === 0 && (!restaurantName || restaurantName === "unknown")) {
    return null;
  }

  return result;
}

/**
 * Extracts restaurant name and address from OCR text
 */
function parseRestaurantFromText(ocrText: string): ParsedRestaurant | null {
  const text = ocrText.trim();
  if (!text) {
    return null;
  }

  console.log("📝 Raw Google Vision OCR text for restaurant:", text);

  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  let restaurantName = "";
  let address = "";

  // Restaurant name is usually at the top
  const skipPatterns = [
    /^(back|close|menu|settings|home|search|filter|sort)$/i,
    /^\d+$/,
    /^[^\w\s]+$/,
  ];

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }
    if (line.length > 2 && line.length < 50) {
      restaurantName = line;
      break;
    }
  }

  // Extract address - look for lines with address patterns
  const addressPatterns = [
    /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)/i,
    /[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/,
    /\d+\s+[A-Za-z\s]+,\s*[A-Za-z\s]+/i,
  ];

  const remainingLines = lines.slice(restaurantName ? lines.indexOf(restaurantName) + 1 : 0);

  for (const line of remainingLines) {
    if (addressPatterns.some((pattern) => pattern.test(line))) {
      address = line;
      break;
    }
  }

  // Fallback: use first remaining line as address
  if (!address && remainingLines.length > 0) {
    address = remainingLines[0];
  }

  const result: ParsedRestaurant = {
    restaurantName: restaurantName || "unknown",
    address: address || "unknown",
  };

  console.log("📊 Extracted restaurant data:", JSON.stringify(result, null, 2));

  if (!restaurantName || restaurantName === "unknown") {
    return null;
  }
  if (!address || address === "unknown") {
    return null;
  }

  return result;
}

/**
 * Processes an order screenshot using Google Cloud Vision API
 */
export async function processOrderScreenshotGoogleVision(
  screenshot: string,
  ocrText?: string
): Promise<{
  miles: number;
  money: number;
  restaurantName: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  let extractedText = ocrText;

  // If ocrText is not provided, use Google Vision API to extract text
  if (!extractedText) {
    try {
      // Initialize Google Vision client with credentials from environment
      const client = createVisionClient();

      // Convert base64 to buffer
      let imageBuffer: Buffer;
      if (screenshot.startsWith("data:image")) {
        const base64Data = screenshot.split(",")[1];
        imageBuffer = Buffer.from(base64Data, "base64");
      } else {
        imageBuffer = Buffer.from(screenshot, "base64");
      }

      // Perform OCR using Google Vision API
      const [result] = await client.textDetection({
        image: { content: imageBuffer },
      });

      // Extract text from all detected text annotations
      const detections = result.textAnnotations || [];
      if (detections.length > 0) {
        // First element contains the full text
        extractedText = detections[0].description || "";
        console.log("✅ Google Vision OCR extracted text:", extractedText);
      } else {
        extractedText = "";
        console.log("⚠️ No text detected in image");
      }
    } catch (visionError) {
      console.error("❌ Google Vision API error:", visionError);
      return {
        miles: 0,
        money: 0,
        restaurantName: "unknown",
        rawResponse: visionError instanceof Error ? visionError.message : "OCR extraction failed",
        metadata: { error: "OCR extraction failed", ocrEngine: "google-vision" },
      };
    }
  }

  // Parse order information from extracted text
  const parsed = parseOrderFromText(extractedText || "");

  if (!parsed) {
    return {
      miles: 0,
      money: 0,
      restaurantName: "unknown",
      rawResponse: extractedText || "",
      metadata: { extractedText, parseError: "Failed to parse order information", ocrEngine: "google-vision" },
    };
  }

  const metadata: Record<string, any> = {
    extractedText,
    ocrEngine: "google-vision",
  };

  return {
    miles: parsed.miles,
    money: parsed.money,
    restaurantName: parsed.restaurantName,
    rawResponse: extractedText || "",
    metadata,
  };
}

/**
 * Processes a restaurant screenshot using Google Cloud Vision API
 */
export async function processRestaurantScreenshotGoogleVision(
  screenshot: string,
  ocrText?: string
): Promise<{
  restaurantName: string;
  address: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  let extractedText = ocrText;

  // If ocrText is not provided, use Google Vision API to extract text
  if (!extractedText) {
    try {
      // Initialize Google Vision client with credentials from environment
      const client = createVisionClient();

      // Convert base64 to buffer
      let imageBuffer: Buffer;
      if (screenshot.startsWith("data:image")) {
        const base64Data = screenshot.split(",")[1];
        imageBuffer = Buffer.from(base64Data, "base64");
      } else {
        imageBuffer = Buffer.from(screenshot, "base64");
      }

      // Perform OCR using Google Vision API
      const [result] = await client.textDetection({
        image: { content: imageBuffer },
      });

      // Extract text from all detected text annotations
      const detections = result.textAnnotations || [];
      if (detections.length > 0) {
        extractedText = detections[0].description || "";
        console.log("✅ Google Vision OCR extracted text:", extractedText);
      } else {
        extractedText = "";
        console.log("⚠️ No text detected in image");
      }
    } catch (visionError) {
      console.error("❌ Google Vision API error:", visionError);
      return {
        restaurantName: "unknown",
        address: "unknown",
        rawResponse: visionError instanceof Error ? visionError.message : "OCR extraction failed",
        metadata: { error: "OCR extraction failed", ocrEngine: "google-vision" },
      };
    }
  }

  // Parse restaurant information from extracted text
  const parsed = parseRestaurantFromText(extractedText || "");

  if (!parsed) {
    return {
      restaurantName: "unknown",
      address: "unknown",
      rawResponse: extractedText || "",
      metadata: { extractedText, parseError: "Failed to parse restaurant information", ocrEngine: "google-vision" },
    };
  }

  const metadata: Record<string, any> = {
    extractedText,
    ocrEngine: "google-vision",
  };

  return {
    restaurantName: parsed.restaurantName,
    address: parsed.address,
    rawResponse: extractedText || "",
    metadata,
  };
}

