import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import { extractProductsFromScreenshot, matchProductFromSearchResults } from "@/lib/order-ocr-processor-gemini";
import { searchProducts } from "@/lib/kroger-api";
import { IShoppingListItem } from "@/lib/models/ShoppingList";
import { handleApiError } from "@/lib/api-error-handler";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { screenshot, locationId, app: selectedApp, customers } = body;

    if (!screenshot) {
      return NextResponse.json(
        { error: "Screenshot is required" },
        { status: 400 }
      );
    }

    if (!locationId) {
      return NextResponse.json(
        { error: "Location ID is required" },
        { status: 400 }
      );
    }

    // Extract products from screenshot using Gemini
    // Pass customers array to guide Gemini on which customer tags to use
    const { products: extractedProducts, app } = await extractProductsFromScreenshot(
      screenshot,
      customers // Array of customer letters (e.g., ["A"] or ["A", "B", "C", "D"])
    );

    if (!extractedProducts || extractedProducts.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
      });
    }

    // Search Kroger for each product and build list items
    const items: IShoppingListItem[] = await Promise.all(
      extractedProducts.map(async (product) => {
        const searchTerm = product.searchTerm || product.productName;
        
        try {
          const result = await searchProducts({
            term: searchTerm,
            locationId,
            limit: 10,
          });

          if (result.data && result.data.length > 0) {
            // Use Gemini to match the correct product from search results
            let krogerProduct = result.data[0]; // Default to first result as fallback
            let matchedProductId: string | null = null;

            try {
              const matchResult = await matchProductFromSearchResults(
                screenshot,
                product,
                result.data
              );

              if (matchResult.productId) {
                matchedProductId = matchResult.productId;
                // Find the matched product in the results
                const matchedProduct = result.data.find(p => p.productId === matchResult.productId);
                if (matchedProduct) {
                  krogerProduct = matchedProduct;
                }
                // If matched product not found, fall back to first result
              }
              // If matchResult.productId is null, fall back to first result
            } catch (matchError) {
              // If matching fails, fall back to first result
              console.error("Error matching product with Gemini:", matchError);
              // krogerProduct already set to first result
            }

            const item = krogerProduct.items?.[0];
            
            // Get best image URL
            let imageUrl: string | undefined;
            if (krogerProduct.images && krogerProduct.images.length > 0) {
              const frontImg = krogerProduct.images.find(img => img.perspective === "front");
              const defaultImg = krogerProduct.images.find(img => img.default);
              const imgToUse = frontImg || defaultImg || krogerProduct.images[0];
              
              if (imgToUse?.sizes && imgToUse.sizes.length > 0) {
                const sizeOrder = ["xlarge", "large", "medium", "small", "thumbnail"];
                for (const size of sizeOrder) {
                  const found = imgToUse.sizes.find(s => s.size === size);
                  if (found?.url) {
                    imageUrl = found.url;
                    break;
                  }
                }
                if (!imageUrl && imgToUse.sizes[0]?.url) {
                  imageUrl = imgToUse.sizes[0].url;
                }
              }
            }

            // Store all images
            const images = krogerProduct.images?.map(img => ({
              perspective: img.perspective,
              default: img.default,
              sizes: img.sizes?.map(s => ({ size: s.size, url: s.url })) || [],
            })) || [];

            // Store all Kroger aisle locations
            const krogerAisles = krogerProduct.aisleLocations?.map(aisle => ({
              aisleNumber: aisle.number,
              shelfNumber: aisle.shelfNumber,
              side: aisle.side,
              description: aisle.description,
              bayNumber: aisle.bayNumber,
            })) || [];

            return {
              searchTerm,
              productName: product.productName,
              customer: product.customer || "A",
              app: selectedApp || product.app || app,
              quantity: product.quantity,
              aisleLocation: product.aisleLocation,
              productId: krogerProduct.productId,
              upc: krogerProduct.upc || item?.itemId,
              brand: krogerProduct.brand,
              description: krogerProduct.description,
              size: item?.size,
              price: item?.price?.regular,
              promoPrice: item?.price?.promo,
              stockLevel: item?.inventory?.stockLevel,
              imageUrl,
              images,
              krogerAisles,
              productPageURI: krogerProduct.productPageURI,
              categories: krogerProduct.categories,
              found: true,
            };
          }

          return {
            searchTerm,
            productName: product.productName,
            customer: product.customer || "A",
            app: selectedApp || product.app || app,
            quantity: product.quantity,
            aisleLocation: product.aisleLocation,
            found: false,
          };
        } catch {
          return {
            searchTerm,
            productName: product.productName,
            customer: product.customer || "A",
            app: selectedApp || product.app || app,
            quantity: product.quantity,
            aisleLocation: product.aisleLocation,
            found: false,
          };
        }
      })
    );

    // Generate a unique screenshot ID
    const screenshotId = randomUUID();

    return NextResponse.json({
      success: true,
      items,
      screenshotId, // Return screenshot ID so frontend can link items to screenshot
      screenshot, // Return the screenshot base64 so it can be saved
    });
  } catch (error) {
    return handleApiError(error);
  }
}
