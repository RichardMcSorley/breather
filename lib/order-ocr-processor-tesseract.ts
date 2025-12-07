import { createWorker } from "tesseract.js";

interface ParsedRestaurant {
  restaurantName: string;
  address: string;
}

/**
 * Extracts restaurant name and address from OCR text using pattern matching
 */
function parseRestaurantFromText(ocrText: string): ParsedRestaurant | null {
  const text = ocrText.trim();
  if (!text) {
    return null;
  }

  console.log("📝 Raw Tesseract OCR text:", text);

  // Common patterns for restaurant screenshots
  // Restaurant name is often at the top, address is usually below it
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  // Try to identify restaurant name (usually first significant line)
  let restaurantName = "";
  let addressStartIndex = 0;

  // Look for common restaurant name patterns (first 1-3 lines, excluding common UI elements)
  const skipPatterns = [
    /^(back|close|menu|settings|home|search|filter|sort)$/i,
    /^\d+$/,
    /^[^\w\s]+$/, // Only symbols
  ];

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }
    if (line.length > 2 && line.length < 50) {
      // Restaurant names are usually 2-50 characters
      restaurantName = line;
      addressStartIndex = i + 1;
      break;
    }
  }

  // If no restaurant name found, use first non-skipped line
  if (!restaurantName && lines.length > 0) {
    for (const line of lines) {
      if (!skipPatterns.some((pattern) => pattern.test(line)) && line.length > 2) {
        restaurantName = line;
        break;
      }
    }
  }

  // Extract address - look for lines with address-like patterns
  // Addresses typically contain: street numbers, street names, city, state, zip
  const addressPatterns = [
    /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)/i,
    /[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/, // City, ST 12345
    /\d+\s+[A-Za-z\s]+,\s*[A-Za-z\s]+/i, // Number Street, City
  ];

  let address = "";
  const remainingLines = lines.slice(addressStartIndex);

  // Try to find address using patterns
  for (const line of remainingLines) {
    if (addressPatterns.some((pattern) => pattern.test(line))) {
      address = line;
      break;
    }
  }

  // If no pattern match, try to combine multiple lines that look like an address
  if (!address && remainingLines.length > 0) {
    // Look for lines with numbers (street numbers) or common address words
    const addressKeywords = [
      "street",
      "st",
      "avenue",
      "ave",
      "road",
      "rd",
      "boulevard",
      "blvd",
      "drive",
      "dr",
      "lane",
      "ln",
      "way",
      "court",
      "ct",
      "place",
      "pl",
    ];

    const potentialAddressLines: string[] = [];
    for (const line of remainingLines.slice(0, 5)) {
      // Check if line contains address keywords or starts with a number
      if (
        addressKeywords.some((keyword) => line.toLowerCase().includes(keyword)) ||
        /^\d+/.test(line)
      ) {
        potentialAddressLines.push(line);
      }
    }

    if (potentialAddressLines.length > 0) {
      address = potentialAddressLines.join(", ");
    } else if (remainingLines.length > 0) {
      // Fallback: use first remaining line as address
      address = remainingLines[0];
    }
  }

  // If still no address, try to extract from the full text using regex
  if (!address) {
    const addressMatch = text.match(
      /(\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)[\s,]*[A-Za-z\s,]*[A-Z]{0,2}[\s,]*\d{0,5})/i
    );
    if (addressMatch) {
      address = addressMatch[1].trim();
    }
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
 * Processes a restaurant screenshot using Tesseract OCR
 */
export async function processRestaurantScreenshotTesseract(
  screenshot: string,
  ocrText?: string
): Promise<{
  restaurantName: string;
  address: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  let extractedText = ocrText;

  // If ocrText is not provided, use Tesseract to extract text from image
  if (!extractedText) {
    try {
      // Convert base64 to buffer or use data URL directly
      let imageInput: Buffer | string = screenshot;
      
      if (screenshot.startsWith("data:image")) {
        // Tesseract can handle data URLs directly, but we can also convert to buffer
        const base64Data = screenshot.split(",")[1];
        imageInput = Buffer.from(base64Data, "base64");
      } else {
        // Assume it's base64 string, convert to buffer
        imageInput = Buffer.from(screenshot, "base64");
      }

      // Initialize Tesseract worker
      const worker = await createWorker("eng");
      
      // Perform OCR - tesseract.js can accept Buffer or data URL
      const { data: { text } } = await worker.recognize(imageInput);
      
      // Terminate worker
      await worker.terminate();

      extractedText = text;
      console.log("✅ Tesseract OCR extracted text:", extractedText);
    } catch (ocrError) {
      console.error("❌ Tesseract OCR error:", ocrError);
      return {
        restaurantName: "unknown",
        address: "unknown",
        rawResponse: ocrError instanceof Error ? ocrError.message : "OCR extraction failed",
        metadata: { error: "OCR extraction failed" },
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
      metadata: { extractedText, parseError: "Failed to parse restaurant information" },
    };
  }

  const metadata: Record<string, any> = {
    extractedText,
    ocrEngine: "tesseract",
  };

  return {
    restaurantName: parsed.restaurantName,
    address: parsed.address,
    rawResponse: extractedText || "",
    metadata,
  };
}

