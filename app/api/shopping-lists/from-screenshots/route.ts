import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import { extractProductsFromScreenshot } from "@/lib/order-ocr-processor-gemini";
import { searchProducts } from "@/lib/kroger-api";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { screenshots, locationId } = body;

    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
      return NextResponse.json(
        { error: "At least one screenshot is required" },
        { status: 400 }
      );
    }

    if (!locationId) {
      return NextResponse.json(
        { error: "Location ID is required" },
        { status: 400 }
      );
    }

    // Extract products from all screenshots using Gemini
    const allExtractedProducts = [];
    for (const screenshot of screenshots) {
      const { products: extractedProducts } = await extractProductsFromScreenshot(screenshot);
      if (extractedProducts && extractedProducts.length > 0) {
        allExtractedProducts.push(...extractedProducts);
      }
    }

    console.log(`Extracted ${allExtractedProducts.length} products from ${screenshots.length} screenshots`);

    if (allExtractedProducts.length === 0) {
      return NextResponse.json(
        { error: "No products found in screenshots" },
        { status: 400 }
      );
    }

    // Search Kroger for each product and build list items
    const items: IShoppingListItem[] = await Promise.all(
      allExtractedProducts.map(async (product) => {
        const searchTerm = product.searchTerm || product.productName;
        
        try {
          const result = await searchProducts({
            term: searchTerm,
            locationId,
            limit: 1,
          });

          if (result.data && result.data.length > 0) {
            const krogerProduct = result.data[0];
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
              app: product.app,
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
            app: product.app,
            quantity: product.quantity,
            aisleLocation: product.aisleLocation,
            found: false,
          };
        } catch {
          return {
            searchTerm,
            productName: product.productName,
            customer: product.customer || "A",
            app: product.app,
            quantity: product.quantity,
            aisleLocation: product.aisleLocation,
            found: false,
          };
        }
      })
    );

    // Save shopping list to database
    await connectDB();

    const shoppingList = await ShoppingList.create({
      userId: session.user.id,
      name: `Shopping List - ${new Date().toLocaleDateString()}`,
      locationId,
      items,
    });

    return NextResponse.json({
      success: true,
      shoppingListId: shoppingList._id.toString(),
      itemCount: items.length,
      foundCount: items.filter(i => i.found).length,
      screenshotsProcessed: screenshots.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
