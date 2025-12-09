/**
 * Processes order screenshots using Google Gemini 2.5 Flash API
 * Based on: https://ai.google.dev/gemini-api/docs/structured-output
 */

import { GoogleGenAI, MediaResolution } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export type ScreenshotType = "order" | "restaurant" | "customer" | "customer-pickup" | "shopping-list";

// Schema for order extraction - only essential fields
const ORDER_SCHEMA = {
  type: "object",
  properties: {
    earnings: {
      type: "number",
      description: "The total payment amount in dollars"
    },
    distance: {
      type: "number",
      description: "The total delivery distance in miles"
    },
    restaurants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          restaurantName: {
            type: "string",
            description: "The name of the restaurant or store"
          },
          deliveryType: {
            type: "string",
            description: "The delivery type: 'pickup', 'retail pickup', 'shop for items', or similar"
          },
          itemCount: {
            type: "number",
            description: "Number of items to shop for (only include if deliveryType involves shopping like 'shop for items' or 'Shop & Deliver')"
          },
          units: {
            type: "number",
            description: "Total number of units across all items (only include if available and deliveryType involves shopping)"
          },
          hasRestrictedItems: {
            type: "boolean",
            description: "Whether the order contains restricted items (e.g., alcohol, age-restricted items, prescription medications)"
          }
        },
        required: ["restaurantName", "deliveryType"]
      },
      description: "Array of restaurants/stores with their delivery types (can be multiple for batch orders)"
    }
  },
  required: ["earnings", "distance", "restaurants"]
};

// Schema for restaurant extraction - only essential fields
const RESTAURANT_SCHEMA = {
  type: "object",
  properties: {
    restaurantName: {
      type: "string",
      description: "The name of the restaurant or store"
    },
    address: {
      type: "string",
      description: "The full address of the restaurant including street, city, state, and zip code"
    }
  },
  required: ["restaurantName", "address"]
};

// Schema for customer extraction - only essential fields
const CUSTOMER_SCHEMA = {
  type: "object",
  properties: {
    customerName: {
      type: "string",
      description: "The customer's full name or first name and last initial"
    },
    deliveryAddress: {
      type: "string",
      description: "The full delivery address including street, city, state, and zip code"
    },
    deliveryInstructions: {
      type: "string",
      description: "Any special delivery instructions or notes from the customer"
    },
    deliveryType: {
      type: "string",
      description: "The delivery preference: 'leave at door' or 'hand it to me'"
    },
    requiresDeliveryPIN: {
      type: "boolean",
      description: "Whether a delivery PIN is required to complete the delivery"
    }
  },
  required: ["customerName", "deliveryAddress"]
};

// Schema for customer pickup extraction - only essential fields
const CUSTOMER_PICKUP_SCHEMA = {
  type: "object",
  properties: {
    customerName: {
      type: "string",
      description: "The customer's full name or first name and last initial"
    },
    pickupAddress: {
      type: "string",
      description: "The full pickup address including street, city, state, and zip code"
    },
    restaurantName: {
      type: "string",
      description: "The name of the restaurant where pickup is happening"
    }
  },
  required: ["customerName", "pickupAddress"]
};

// Schema for shopping list extraction - for Instacart-style shopping lists
const SHOPPING_LIST_SCHEMA = {
  type: "object",
  properties: {
    app: {
      type: "string",
      enum: ["Instacart", "DoorDash"],
      description: "The app name: 'Instacart' if the screenshot has a light background/theme, 'DoorDash' if it has a dark background/theme"
    },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productName: {
            type: "string",
            description: "The full product name including brand, flavor, and description"
          },
          searchTerm: {
            type: "string",
            description: "A simplified search term for finding the product (brand + main product type, e.g., 'Ensure Max Protein', 'Dr Pepper Blackberry Zero', 'Coca Cola Cherry Zero')"
          },
          customer: {
            type: "string",
            description: "The customer letter badge shown next to the product (A, B, C, etc.) or null if no badge"
          },
          quantity: {
            type: "string",
            description: "The quantity or count shown (e.g., '1 ct', '2')"
          },
          size: {
            type: "string",
            description: "The size or unit information (e.g., '11 fl oz', '12 x 12 fl oz')"
          },
          price: {
            type: "string",
            description: "The price if visible (e.g., '$13.49')"
          },
          aisleLocation: {
            type: "string",
            description: "The aisle and shelf location if visible"
          }
        },
        required: ["productName", "searchTerm"]
      },
      description: "Array of products from the shopping list"
    }
  },
  required: ["app", "products"]
};

// Get the appropriate prompt based on screenshot type - focused only on essential fields
function getPromptForScreenshotType(type: ScreenshotType, customers?: string[]): string {
  switch (type) {
    case "order":
      return `Extract from this delivery order offer screenshot:
- earnings: Total payment amount in dollars (the main dollar amount shown)
- distance: Delivery distance in miles (numeric value only)
- restaurants: Array of restaurant/store objects, each with:
  - restaurantName: Name of the restaurant or store
  - deliveryType: Type of delivery (e.g., "pickup", "retail pickup", "shop for items", "Delivery", "Shop & Deliver")
  - itemCount: Number of items to shop for (only include if deliveryType involves shopping like "shop for items" or "Shop & Deliver")
  - units: Total number of units across all items (only include if available and deliveryType involves shopping)
  - hasRestrictedItems: Whether the order contains restricted items (e.g., alcohol, age-restricted items, prescription medications)

For batch orders with multiple restaurants, include all restaurants in the array. Extract the delivery type for each restaurant shown on the screen. If the delivery type involves shopping, extract the item count and units if available. Check if there are any indicators of restricted items (alcohol, age restrictions, etc.) and set hasRestrictedItems accordingly.`;

    case "restaurant":
      return `Extract from this restaurant screenshot:
- restaurantName: Exact restaurant or store name as displayed
- address: Complete address including street number, street name, city, state, and zip code

Extract the restaurant name at the top and the full address below it.`;

    case "customer":
      return `Extract from this customer delivery information screenshot:
- customerName: Customer's full name or first name with last initial
- deliveryAddress: Complete delivery address including street number, street name, city, state, and zip code
- deliveryInstructions: Any special delivery instructions or notes from the customer (if present)
- deliveryType: Delivery preference - either "leave at door" or "hand it to me"
- requiresDeliveryPIN: Whether a delivery PIN is required to complete the delivery

Extract the customer name, full delivery address, delivery instructions, delivery preference (leave at door or hand it to me), and whether a delivery PIN is required.`;

    case "customer-pickup":
      return `Extract from this customer pickup information screenshot:
- customerName: Customer's full name or first name with last initial
- pickupAddress: Complete pickup address including street number, street name, city, state, and zip code
- restaurantName: Name of restaurant where pickup is happening (if visible)

Extract the customer name, pickup address, and restaurant name if shown.`;

    case "shopping-list":
      const customerGuidance = customers && customers.length > 0
        ? `\n\nCRITICAL CUSTOMER GUIDANCE:
- The user has indicated they have the following customers: ${customers.join(", ")}
- ${customers.length === 1 
    ? `ALL products in this screenshot should be assigned to customer "${customers[0]}" since only one customer is active. Do NOT assign products to other customers (${["A", "B", "C", "D"].filter(c => !customers.includes(c)).join(", ")}).`
    : `Products should ONLY be assigned to one of these customers: ${customers.join(", ")}. Do NOT assign products to customers not in this list (${["A", "B", "C", "D"].filter(c => !customers.includes(c)).join(", ")}).`
  }
- If you cannot clearly see a customer badge on a product, assign it to the first customer in the list (${customers[0]}) as a default.
- Only extract customer badges that match the provided list.`
        : "";

      return `Extract from this shopping list screenshot:
- app: Determine which app this is based on the theme/background: "Instacart" if the screenshot has a light background/theme (white or light colors), "DoorDash" if it has a dark background/theme (black or dark colors)
- products: Array of product objects, each with:
  - productName: The full product name as displayed (e.g., "Ensure® Max Protein Cafe Mocha Nutrition Shakes")
  - searchTerm: A simplified search term for finding the product - just the brand and main product type, remove extra descriptions like "Limited Edition", pack sizes, etc. (e.g., "Ensure Max Protein Mocha", "Dr Pepper Blackberry Zero Sugar", "Coca Cola Cherry Zero Sugar")
  - customer: The customer letter badge (A, B, C, D) shown in a colored circle next to the product image. Look for small colored circles with letters. If no badge visible, set to null.
  - quantity: The quantity count shown before the product name (e.g., "1 ct", "2")
  - size: The size/volume info (e.g., "11 fl oz", "12 x 12 fl oz")
  - price: The price shown (e.g., "$13.49")
  - aisleLocation: The aisle and shelf location (e.g., "Aisle 11 - Shelf 5 (from the bottom)")

IMPORTANT: 
- First, determine the app by looking at the overall theme: light/white background = Instacart, dark/black background = DoorDash
- Look carefully for customer badges - they are small colored circles (green for A, blue for B, orange for C, purple for D) with a letter inside, usually positioned near the product image. Extract all products visible.${customerGuidance}`;

    default:
      throw new Error(`Unknown screenshot type: ${type}`);
  }
}

// Get the appropriate schema based on screenshot type
function getSchemaForScreenshotType(type: ScreenshotType): any {
  switch (type) {
    case "order":
      return ORDER_SCHEMA;
    case "restaurant":
      return RESTAURANT_SCHEMA;
    case "customer":
      return CUSTOMER_SCHEMA;
    case "customer-pickup":
      return CUSTOMER_PICKUP_SCHEMA;
    case "shopping-list":
      return SHOPPING_LIST_SCHEMA;
    default:
      throw new Error(`Unknown screenshot type: ${type}`);
  }
}

export async function processOrderScreenshotGemini(
  screenshot: string,
  ocrText?: string,
  screenshotType: ScreenshotType = "order",
  customers?: string[]
): Promise<{
  miles: number;
  money: number;
  restaurantName: string;
  rawResponse: string;
  metadata: Record<string, any>;
}> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  try {
    // Initialize Gemini client
    // The SDK reads GEMINI_API_KEY from environment, but we can also pass it explicitly
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Convert base64 to buffer and determine MIME type
    let imageBuffer: Buffer;
    let mimeType: string = "image/png";
    
    if (screenshot.startsWith("data:image")) {
      const base64Data = screenshot.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
      
      // Extract MIME type from data URL
      const mimeMatch = screenshot.match(/data:image\/([^;]+)/);
      if (mimeMatch) {
        const format = mimeMatch[1].toLowerCase();
        mimeType = `image/${format === "jpg" ? "jpeg" : format}`;
      }
    } else {
      imageBuffer = Buffer.from(screenshot, "base64");
    }

    // Convert buffer to base64 string for inline data
    const base64ImageData = imageBuffer.toString("base64");

    // Get type-specific prompt and schema
    const prompt = getPromptForScreenshotType(screenshotType, customers);
    const schema = getSchemaForScreenshotType(screenshotType);

    // Prepare contents with image and prompt
    const contents = [
      {
        inlineData: {
          mimeType: mimeType,
          data: base64ImageData,
        },
      },
      { text: prompt },
    ];

    // Generate content with structured output
    // Using gemini-2.5-flash-lite for fastest processing (1.5x faster than flash)
    // MEDIA_RESOLUTION_LOW: 64 tokens vs 256+ default
    // Disabling thinking (thinkingBudget: 0) for faster response and lower cost
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // Fastest model - optimized for low latency
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW, // Faster: 64 tokens vs 256+ default
        thinkingConfig: {
          thinkingBudget: 0, // Disable thinking for faster response and lower cost
        },
        temperature: 0, // Deterministic output for faster processing
      },
    });

    // Parse the JSON response
    let extractedData: any = {};
    let rawResponse = "";

    try {
      const responseText = response.text || "";
      rawResponse = responseText;
      
      // Parse JSON (may be wrapped in markdown code blocks)
      let jsonText = responseText.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      
      extractedData = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(`Failed to parse Gemini response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }

    // Map extracted data to our format based on screenshot type
    let miles = 0;
    let money = 0;
    let restaurantName = "unknown";

    if (screenshotType === "order") {
      miles = extractedData.distance || 0;
      money = extractedData.earnings || 0;
      // Handle restaurants array - extract restaurant names
      if (extractedData.restaurants && Array.isArray(extractedData.restaurants) && extractedData.restaurants.length > 0) {
        // Join all restaurant names for backward compatibility
        restaurantName = extractedData.restaurants
          .map((r: any) => r.restaurantName || "")
          .filter((name: string) => name)
          .join(", ") || "unknown";
      } else if (extractedData.restaurantNames && Array.isArray(extractedData.restaurantNames)) {
        // Fallback for old format
        restaurantName = extractedData.restaurantNames.length > 0 
          ? extractedData.restaurantNames.join(", ") 
          : "unknown";
      } else {
        // Fallback for old single restaurantName format
        restaurantName = extractedData.restaurantName || "unknown";
      }
    } else if (screenshotType === "restaurant") {
      restaurantName = extractedData.restaurantName || "unknown";
    } else if (screenshotType === "customer") {
      // Customer screenshots don't have miles/money/restaurant
      restaurantName = "unknown";
    } else if (screenshotType === "customer-pickup") {
      restaurantName = extractedData.restaurantName || "unknown";
    }

    const metadata: Record<string, any> = {
      ocrEngine: "gemini-2.5-flash",
      screenshotType,
      extractedData,
      fullResponse: response,
    };

    return {
      miles,
      money,
      restaurantName,
      rawResponse,
      metadata,
    };
  } catch (error) {
    throw error;
  }
}

// Convenience function for extracting products from shopping list screenshots
export interface ExtractedProduct {
  productName: string;
  searchTerm: string;
  customer?: string | null;
  quantity?: string;
  size?: string;
  price?: string;
  aisleLocation?: string;
  app?: string; // "Instacart" or "DoorDash"
}

export async function extractProductsFromScreenshot(
  screenshot: string,
  customers?: string[]
): Promise<{ products: ExtractedProduct[]; app?: string }> {
  const result = await processOrderScreenshotGemini(screenshot, undefined, "shopping-list", customers);
  
  const extractedData = result.metadata?.extractedData || {};
  const products = extractedData.products || [];
  const app = extractedData.app;
  
  // Add app to each product for convenience
  const productsWithApp = products.map((p: ExtractedProduct) => ({
    ...p,
    app,
  }));
  
  return {
    products: productsWithApp as ExtractedProduct[],
    app,
  };
}

