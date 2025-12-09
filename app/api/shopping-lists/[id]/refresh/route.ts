import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import { searchProducts, getProductDetails } from "@/lib/kroger-api";
import ShoppingList, { IShoppingListItem } from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await connectDB();

    const shoppingList = await ShoppingList.findOne({
      _id: id,
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    const isOwner = shoppingList.userId === session.user.id;
    const isSharedUser = !isOwner && shoppingList.sharedWith?.includes(session.user.id);
    const sharedIndices = shoppingList.sharedItemIndices || [];

    // Determine which items to refresh
    const itemsToRefresh = isSharedUser
      ? shoppingList.items.filter((_, index) => sharedIndices.includes(index))
      : shoppingList.items;

    // Map original indices to items being refreshed
    const itemIndexMap = isSharedUser
      ? shoppingList.items
          .map((_, index) => ({ originalIndex: index, isShared: sharedIndices.includes(index) }))
          .filter(({ isShared }) => isShared)
          .map(({ originalIndex }, newIndex) => ({ originalIndex, newIndex }))
      : shoppingList.items.map((_, index) => ({ originalIndex: index, newIndex: index }));

    // Refresh each item with current Kroger data
    const updatedItems: IShoppingListItem[] = await Promise.all(
      itemsToRefresh.map(async (item) => {
        // If item already has a productId, use it to fetch the specific product
        // This preserves manually selected products and prevents them from being overwritten
        if (item.productId && item.found) {
          try {
            const result = await getProductDetails(item.productId, shoppingList.locationId);
            
            if (result.data) {
              const krogerProduct = result.data;
              const krogerItem = krogerProduct.items?.[0];

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
                ...item,
                customer: item.customer || "A",
                // Use the product data from the API for this specific productId
                // This ensures manually selected products stay as selected
                productId: krogerProduct.productId,
                upc: krogerProduct.upc || krogerItem?.itemId || item.upc,
                brand: krogerProduct.brand,
                description: krogerProduct.description,
                size: krogerItem?.size,
                price: krogerItem?.price?.regular,
                promoPrice: krogerItem?.price?.promo,
                stockLevel: krogerItem?.inventory?.stockLevel,
                imageUrl: imageUrl || item.imageUrl, // Preserve image if API doesn't have one
                images: images.length > 0 ? images : item.images, // Preserve images if API doesn't have any
                krogerAisles: krogerAisles.length > 0 ? krogerAisles : item.krogerAisles, // Preserve aisles if API doesn't have any
                productPageURI: krogerProduct.productPageURI || item.productPageURI,
                categories: krogerProduct.categories || item.categories,
                found: true,
              } as IShoppingListItem;
            }
          } catch {
            // If productId lookup fails, fall through to search
          }
        }

        // Fallback to search if no productId or productId lookup failed
        // Use searchTerm or productName to search
        const searchTerm = item.searchTerm || item.productName;
        
        if (!searchTerm) {
          return {
            ...item,
            customer: item.customer || "A",
          } as IShoppingListItem;
        }

        try {
          const result = await searchProducts({
            term: searchTerm,
            locationId: shoppingList.locationId,
            limit: 1,
          });

          if (result.data && result.data.length > 0) {
            const krogerProduct = result.data[0];
            const krogerItem = krogerProduct.items?.[0];

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
              ...item,
              customer: item.customer || "A",
              productId: krogerProduct.productId,
              upc: krogerProduct.upc || krogerItem?.itemId,
              brand: krogerProduct.brand,
              description: krogerProduct.description,
              size: krogerItem?.size,
              price: krogerItem?.price?.regular,
              promoPrice: krogerItem?.price?.promo,
              stockLevel: krogerItem?.inventory?.stockLevel,
              imageUrl,
              images,
              krogerAisles,
              productPageURI: krogerProduct.productPageURI,
              categories: krogerProduct.categories,
              found: true,
            } as IShoppingListItem;
          }

          return {
            ...item,
            customer: item.customer || "A",
            found: false,
          } as IShoppingListItem;
        } catch {
          return {
            ...item,
            customer: item.customer || "A",
          } as IShoppingListItem;
        }
      })
    );

    // Update the shopping list with refreshed items
    if (isSharedUser) {
      // For shared users, only update the shared items
      itemIndexMap.forEach(({ originalIndex, newIndex }) => {
        shoppingList.items[originalIndex] = updatedItems[newIndex];
      });
    } else {
      // For owner, update all items
      shoppingList.items = updatedItems;
    }
    
    await shoppingList.save();

    return NextResponse.json({
      success: true,
      itemCount: updatedItems.length,
      foundCount: updatedItems.filter(i => i.found).length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
