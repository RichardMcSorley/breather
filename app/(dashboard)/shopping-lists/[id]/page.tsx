"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Layout from "@/components/Layout";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import { ShoppingCart, ExternalLink, Barcode, Loader2, Search, Check } from "lucide-react";
import { KrogerProduct } from "@/lib/types/kroger";

interface KrogerAisleLocation {
  aisleNumber?: string;
  shelfNumber?: string;
  side?: string;
  description?: string;
  bayNumber?: string;
}

interface KrogerImageSize {
  size: string;
  url: string;
}

interface KrogerImage {
  perspective?: string;
  default?: boolean;
  sizes: KrogerImageSize[];
}

interface ShoppingListItem {
  searchTerm: string;
  productName: string;
  customer?: string;
  quantity?: string;
  aisleLocation?: string;
  productId?: string;
  upc?: string;
  brand?: string;
  description?: string;
  size?: string;
  price?: number;
  promoPrice?: number;
  stockLevel?: string;
  imageUrl?: string;
  images?: KrogerImage[];
  krogerAisles?: KrogerAisleLocation[];
  productPageURI?: string;
  categories?: string[];
  found: boolean;
}

interface ShoppingList {
  _id: string;
  name: string;
  locationId: string;
  items: ShoppingListItem[];
  createdAt: string;
}

// Customer badge colors matching Instacart
const customerColors: Record<string, string> = {
  A: "bg-green-500",
  B: "bg-blue-500",
  C: "bg-orange-500",
  D: "bg-purple-500",
  E: "bg-pink-500",
};

function CustomerBadge({ customer }: { customer?: string }) {
  if (!customer) return null;
  const bgColor = customerColors[customer] || "bg-gray-500";
  return (
    <div 
      className={`absolute -top-1 -left-1 w-6 h-6 ${bgColor} text-white rounded-full flex items-center justify-center text-xs font-bold shadow z-10`}
    >
      {customer}
    </div>
  );
}

// Search Product Modal Component for unfound items
function SearchProductModal({
  item,
  itemIndex,
  locationId,
  shoppingListId,
  isOpen,
  onClose,
  onItemUpdated,
}: {
  item: ShoppingListItem;
  itemIndex: number;
  locationId: string;
  shoppingListId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState(item.searchTerm || item.productName);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KrogerProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<KrogerProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Clear error when modal opens or search term changes
  useEffect(() => {
    if (isOpen) {
      setSearchError(null);
      setSearchResults([]);
      setSelectedProduct(null);
    }
  }, [isOpen]);

  // Clear error when user types
  const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (searchError) {
      setSearchError(null);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim() || searchTerm.trim().length < 3) {
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setSelectedProduct(null);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/kroger/products/search?term=${encodeURIComponent(searchTerm)}&locationId=${locationId}&limit=10`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Search failed" }));
        const errorMessage = errorData.error || `Search failed (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.data) {
        setSearchResults(data.data);
        if (data.data.length === 0) {
          setSearchError("No products found. Try a different search term.");
        }
      } else {
        setSearchError("No products found. Try a different search term.");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Search failed. Please try again.";
      setSearchError(errorMessage);
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectProduct = (product: KrogerProduct) => {
    setSelectedProduct(product);
  };

  const handleSave = async () => {
    if (!selectedProduct) return;

    setSaving(true);
    try {
      const krogerItem = selectedProduct.items?.[0];

      // Get best image URL
      let imageUrl: string | undefined;
      if (selectedProduct.images && selectedProduct.images.length > 0) {
        const frontImg = selectedProduct.images.find(img => img.perspective === "front");
        const defaultImg = selectedProduct.images.find(img => img.default);
        const imgToUse = frontImg || defaultImg || selectedProduct.images[0];

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
      const images = selectedProduct.images?.map(img => ({
        perspective: img.perspective,
        default: img.default,
        sizes: img.sizes?.map(s => ({ size: s.size, url: s.url })) || [],
      })) || [];

      // Store all Kroger aisle locations
      const krogerAisles = selectedProduct.aisleLocations?.map(aisle => ({
        aisleNumber: aisle.number,
        shelfNumber: aisle.shelfNumber,
        side: aisle.side,
        description: aisle.description,
        bayNumber: aisle.bayNumber,
      })) || [];

      const updatedItem: ShoppingListItem = {
        searchTerm: searchTerm,
        productName: item.productName,
        customer: item.customer || "A",
        quantity: item.quantity,
        aisleLocation: item.aisleLocation,
        productId: selectedProduct.productId,
        upc: selectedProduct.upc || krogerItem?.itemId,
        brand: selectedProduct.brand,
        description: selectedProduct.description,
        size: krogerItem?.size,
        price: krogerItem?.price?.regular,
        promoPrice: krogerItem?.price?.promo,
        stockLevel: krogerItem?.inventory?.stockLevel,
        imageUrl,
        images,
        krogerAisles,
        productPageURI: selectedProduct.productPageURI,
        categories: selectedProduct.categories,
        found: true,
      };

      // Update the item via API
      const response = await fetch(`/api/shopping-lists/${shoppingListId}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemIndex, item: updatedItem }),
      });

      if (!response.ok) {
        throw new Error("Failed to update item");
      }

      onItemUpdated();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const getImageUrl = (product: KrogerProduct) => {
    if (product.images && product.images.length > 0) {
      const defaultImg = product.images.find(img => img.default) || product.images[0];
      const sizes = ["xlarge", "large", "medium", "small"];
      for (const size of sizes) {
        const found = defaultImg?.sizes?.find(s => s.size === size);
        if (found?.url) return found.url;
      }
      return defaultImg?.sizes?.[0]?.url;
    }
    return null;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search for Product">
      <div className="space-y-4">
        {/* Product Name */}
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Product Name</p>
          <p className="font-medium text-gray-900 dark:text-white">{item.productName}</p>
        </div>

        {/* Search Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search Term
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchTermChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter search term..."
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchTerm.trim() || searchTerm.trim().length < 3}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </button>
          </div>
        </div>

        {/* Error Message */}
        {searchError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Results ({searchResults.length})
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((product) => {
                const imageUrl = getImageUrl(product);
                const krogerItem = product.items?.[0];
                const isSelected = selectedProduct?.productId === product.productId;

                return (
                  <div
                    key={product.productId}
                    onClick={() => handleSelectProduct(product)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex gap-3">
                      {imageUrl ? (
                        <div className="relative w-16 h-16 bg-white rounded overflow-hidden flex-shrink-0">
                          <Image
                            src={imageUrl}
                            alt={product.description || ""}
                            fill
                            className="object-contain p-1"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                          <ShoppingCart className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {product.brand && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                            {product.brand}
                          </p>
                        )}
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {product.description}
                        </p>
                        {krogerItem?.size && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {krogerItem.size}
                          </p>
                        )}
                        {krogerItem?.price?.regular && (
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                            ${krogerItem.price.regular.toFixed(2)}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="flex-shrink-0 flex items-center">
                          <Check className="w-5 h-5 text-blue-600" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Save Button */}
        {selectedProduct && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Save Product
              </>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

// Product Detail Modal Component
function ProductDetailModal({
  item,
  locationId,
  isOpen,
  onClose,
}: {
  item: ShoppingListItem;
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [productDetails, setProductDetails] = useState<KrogerProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);

  useEffect(() => {
    if (isOpen && item.productId && !productDetails) {
      setLoading(true);
      fetch(`/api/kroger/products/${item.productId}?locationId=${locationId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            setProductDetails(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, item.productId, locationId, productDetails]);

  const formatPrice = (amount?: number) => {
    if (amount === undefined) return null;
    return `$${amount.toFixed(2)}`;
  };

  const product = productDetails;
  const krogerItem = product?.items?.[0];
  const price = krogerItem?.price || krogerItem?.nationalPrice;
  const upc = product?.upc || krogerItem?.itemId;
  const stockLevel = krogerItem?.inventory?.stockLevel;
  
  const stockLevelText = stockLevel === "HIGH" ? "In Stock" 
    : stockLevel === "LOW" ? "Low Stock" 
    : stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "Out of Stock" 
    : null;
  
  const stockLevelColor = stockLevel === "HIGH" ? "text-green-600 dark:text-green-400"
    : stockLevel === "LOW" ? "text-yellow-600 dark:text-yellow-400"
    : stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "text-red-600 dark:text-red-400"
    : "";

  // Get best image
  const getImageUrl = () => {
    if (product?.images && product.images.length > 0) {
      const defaultImg = product.images.find(img => img.default) || product.images[0];
      const sizes = ["xlarge", "large", "medium", "small"];
      for (const size of sizes) {
        const found = defaultImg?.sizes?.find(s => s.size === size);
        if (found?.url) return found.url;
      }
      return defaultImg?.sizes?.[0]?.url;
    }
    return item.imageUrl;
  };

  const imageUrl = getImageUrl();

  // Calculate UPC-A check digit (11 digits -> 12th is check)
  // Odd positions (1,3,5,7,9,11) × 3, Even positions (2,4,6,8,10) × 1
  const calculateUPCACheckDigit = (digits: string): string => {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(digits[i]);
      // Positions 1,3,5,7,9,11 (odd, 1-indexed) × 3
      if ((i + 1) % 2 === 1) {
        sum += digit * 3;
      } else {
        sum += digit;
      }
    }
    const remainder = sum % 10;
    return remainder === 0 ? "0" : String(10 - remainder);
  };

  // Calculate EAN-13 check digit (12 digits -> 13th is check)
  // Odd positions (1,3,5,7,9,11) × 1, Even positions (2,4,6,8,10,12) × 3
  const calculateEAN13CheckDigit = (digits: string): string => {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(digits[i]);
      // Positions 1,3,5,7,9,11 (odd, 1-indexed) × 1
      // Positions 2,4,6,8,10,12 (even, 1-indexed) × 3
      if ((i + 1) % 2 === 1) {
        sum += digit;
      } else {
        sum += digit * 3;
      }
    }
    const remainder = sum % 10;
    return remainder === 0 ? "0" : String(10 - remainder);
  };

  // Normalize and validate UPC
  const normalizeUPC = (upcCode: string): { code: string; type: string } | null => {
    const digits = upcCode.replace(/\D/g, "");
    if (digits.length === 0) return null;

    // For 11-digit codes, calculate check digit to make it 12 (UPC-A)
    if (digits.length === 11) {
      const checkDigit = calculateUPCACheckDigit(digits);
      return { code: digits + checkDigit, type: "UPCA" };
    }

    // For 12-digit codes, recalculate check digit (UPC-A)
    if (digits.length === 12) {
      const codeWithoutCheck = digits.slice(0, 11);
      const calculatedCheck = calculateUPCACheckDigit(codeWithoutCheck);
      return { code: codeWithoutCheck + calculatedCheck, type: "UPCA" };
    }

    // For 13-digit codes (EAN-13), recalculate check digit
    if (digits.length === 13) {
      const codeWithoutCheck = digits.slice(0, 12);
      const calculatedCheck = calculateEAN13CheckDigit(codeWithoutCheck);
      return { code: codeWithoutCheck + calculatedCheck, type: "EAN13" };
    }

    // For shorter codes, pad to 11 digits and calculate check
    if (digits.length < 11) {
      const padded = digits.padStart(11, "0");
      const checkDigit = calculateUPCACheckDigit(padded);
      return { code: padded + checkDigit, type: "UPCA" };
    }

    return null;
  };

  // Barcode URL generator with check digit correction
  const getBarcodeUrl = (upcCode: string) => {
    const normalized = normalizeUPC(upcCode);
    if (!normalized) return null;
    return `https://barcode.tec-it.com/barcode.ashx?data=${normalized.code}&code=${normalized.type}&dpi=96`;
  };

  const normalizedUpc = upc ? normalizeUPC(upc) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Image */}
            <div className="flex justify-center">
              {imageUrl ? (
                <div className="relative w-48 h-48 bg-white rounded-lg overflow-hidden">
                  <Image
                    src={imageUrl}
                    alt={item.description || item.productName}
                    fill
                    className="object-contain p-2"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="text-center">
              {item.brand && (
                <p className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {item.brand}
                </p>
              )}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {item.description || item.productName}
              </h3>
              {item.size && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {item.size}
                </p>
              )}
            </div>

            {/* Price */}
            <div className="text-center">
              {price?.promo && price.promo !== price.regular ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatPrice(price.promo)}
                  </span>
                  <span className="text-lg text-gray-400 line-through">
                    {formatPrice(price.regular)}
                  </span>
                </div>
              ) : (
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(price?.regular || item.price)}
                </span>
              )}
            </div>

            {/* Stock Level */}
            {stockLevelText && (
              <div className={`text-center text-sm font-medium ${stockLevelColor}`}>
                {stockLevelText}
              </div>
            )}

            {/* Aisle Locations from Kroger */}
            {product?.aisleLocations && product.aisleLocations.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  📍 Store Location
                </p>
                {product.aisleLocations.map((aisle, idx) => (
                  <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                    {aisle.number && `Aisle ${aisle.number}`}
                    {aisle.description && ` - ${aisle.description}`}
                    {aisle.shelfNumber && ` • Shelf ${aisle.shelfNumber}`}
                    {aisle.side && ` (Side ${aisle.side})`}
                  </div>
                ))}
              </div>
            )}

            {/* Original Aisle from Screenshot */}
            {item.aisleLocation && (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Original: {item.aisleLocation}
              </div>
            )}

            {/* Barcode */}
            {upc && (
              <button
                onClick={() => setShowBarcode(!showBarcode)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Barcode className="w-5 h-5" />
                {showBarcode ? "Hide Barcode" : `UPC: ${upc}`}
              </button>
            )}

            {showBarcode && upc && normalizedUpc && (
              <div className="text-center bg-white p-4 rounded-lg">
                {getBarcodeUrl(upc) ? (
                  <img
                    src={getBarcodeUrl(upc)!}
                    alt={`Barcode for ${normalizedUpc.code}`}
                    className="mx-auto"
                  />
                ) : (
                  <p className="text-gray-500">Unable to generate barcode</p>
                )}
                <p className="font-mono text-sm text-gray-700 mt-2">{normalizedUpc.code}</p>
                {normalizedUpc.code !== upc.replace(/\D/g, "") && (
                  <p className="text-xs text-gray-500 mt-1">
                    Original: {upc} (check digit corrected)
                  </p>
                )}
              </div>
            )}

            {/* Kroger Link */}
            {product?.productPageURI && (
              <a
                href={`https://www.kroger.com${product.productPageURI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
                View on Kroger
              </a>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function ShoppingListDetailPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ShoppingListItem | null>(null);
  const [searchItem, setSearchItem] = useState<{ item: ShoppingListItem; index: number } | null>(null);
  const hasAutoRefreshedRef = useRef(false);

  const fetchShoppingList = async () => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to load shopping list" }));
        throw new Error(errorData.error || "Failed to load shopping list");
      }

      const data = await response.json();
      setShoppingList(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shopping list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchShoppingList();
      hasAutoRefreshedRef.current = false; // Reset flag when id changes
    }
  }, [id]);

  // Auto-refresh if items are missing krogerAisles data (only once per page load)
  useEffect(() => {
    if (!shoppingList || refreshing || loading || hasAutoRefreshedRef.current) return;
    
    // Check if any found items are missing krogerAisles data
    const needsRefresh = shoppingList.items.some(
      item => item.found && (!item.krogerAisles || item.krogerAisles.length === 0)
    );
    
    if (needsRefresh) {
      hasAutoRefreshedRef.current = true; // Mark as refreshed to prevent loop
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoppingList, refreshing, loading]);

  const handleRefresh = async () => {
    if (!id || refreshing) return;
    
    setRefreshing(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/shopping-lists/${id}/refresh`, {
        method: "POST",
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to refresh" }));
        throw new Error(errorData.error || "Failed to refresh");
      }
      
      // Reload the shopping list data
      await fetchShoppingList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const formatPrice = (price?: number) => {
    if (price === undefined) return null;
    return `$${price.toFixed(2)}`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (error || !shoppingList) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">{error || "Shopping list not found"}</p>
        </div>
      </Layout>
    );
  }

  // Helper to get primary aisle info
  const getPrimaryAisle = (item: ShoppingListItem) => item.krogerAisles?.[0];

  // Sort items by: 1) Aisle number, 2) Shelf number, 3) Side (L before R)
  const sortedItems = [...shoppingList.items].sort((a, b) => {
    const aisleA = getPrimaryAisle(a);
    const aisleB = getPrimaryAisle(b);
    
    // Compare aisle numbers first
    const aisleNumA = parseInt(aisleA?.aisleNumber || "999") || 999;
    const aisleNumB = parseInt(aisleB?.aisleNumber || "999") || 999;
    if (aisleNumA !== aisleNumB) return aisleNumA - aisleNumB;
    
    // Same aisle - sort by shelf number
    const shelfA = parseInt(aisleA?.shelfNumber || "999") || 999;
    const shelfB = parseInt(aisleB?.shelfNumber || "999") || 999;
    if (shelfA !== shelfB) return shelfA - shelfB;
    
    // Same shelf - sort by side (L before R)
    const sideA = aisleA?.side || "Z";
    const sideB = aisleB?.side || "Z";
    return sideA.localeCompare(sideB);
  });

  // Group sorted items by aisle + shelf + side for section headers
  const groupedItems: { aisle: string; shelf: string; side: string; items: ShoppingListItem[] }[] = [];
  
  sortedItems.forEach((item) => {
    const primaryAisle = getPrimaryAisle(item);
    const aisleNum = primaryAisle?.aisleNumber || "";
    const shelf = primaryAisle?.shelfNumber || "";
    const side = primaryAisle?.side || "";
    
    const lastGroup = groupedItems[groupedItems.length - 1];
    if (lastGroup && lastGroup.aisle === aisleNum && lastGroup.shelf === shelf && lastGroup.side === side) {
      lastGroup.items.push(item);
    } else {
      groupedItems.push({ aisle: aisleNum, shelf, side, items: [item] });
    }
  });

  // If no aisle groupings, just show all items
  if (groupedItems.length === 0 || (groupedItems.length === 1 && !groupedItems[0].aisle)) {
    groupedItems.length = 0;
    groupedItems.push({ aisle: "", shelf: "", side: "", items: sortedItems });
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {shoppingList.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {shoppingList.items.length} items
            {refreshing && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating...
              </span>
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Items */}
        <div>
          {groupedItems.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Aisle/Shelf/Side Header - Instacart Style */}
              {group.aisle && (
                <div className="pt-4 pb-2 border-b border-gray-200 dark:border-gray-700 mb-2">
                  <h2 className="font-bold text-gray-900 dark:text-white text-base">
                    Aisle {group.aisle} - Shelf {group.shelf || "?"} ({group.side || "?"})
                  </h2>
                </div>
              )}
              {!group.aisle && groupIndex === 0 && (
                <div className="pt-4 pb-2 border-b border-gray-200 dark:border-gray-700 mb-2">
                  <h2 className="font-bold text-gray-900 dark:text-white text-base">
                    Unknown Location
                  </h2>
                </div>
              )}
              
              {/* Items in this aisle */}
              {group.items.map((item, index) => {
                // Find the original index in the shopping list items array
                // Use a combination of searchTerm, productName, and customer to uniquely identify
                const originalIndex = shoppingList.items.findIndex(
                  (listItem) =>
                    listItem.searchTerm === item.searchTerm &&
                    listItem.productName === item.productName &&
                    listItem.customer === item.customer
                );

                return (
                  <div
                    key={`${groupIndex}-${index}`}
                    className="flex gap-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
                    onClick={() => {
                      if (item.found) {
                        setSelectedItem(item);
                      } else if (originalIndex >= 0) {
                        setSearchItem({ item, index: originalIndex });
                      }
                    }}
                  >
                    {/* Product Image with Customer Badge */}
                    <div className="relative flex-shrink-0">
                      <CustomerBadge customer={item.customer} />
                      {item.imageUrl ? (
                        <div className="relative w-20 h-20 bg-white rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-600">
                          <Image
                            src={item.imageUrl}
                            alt={item.found && item.description ? item.description : item.productName}
                            fill
                            className="object-contain p-2"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600">
                          <ShoppingCart className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0 pt-1">
                      {/* Quantity + Kroger Product Name */}
                      <p className="text-gray-900 dark:text-white leading-snug">
                        {item.found && item.description ? (
                          <>
                            {item.quantity && (
                              <span className="font-bold">{item.quantity} </span>
                            )}
                            {item.brand && (
                              <span className="text-sm text-gray-500 dark:text-gray-400 uppercase">
                                {item.brand}{" "}
                              </span>
                            )}
                            {item.description}
                          </>
                        ) : (
                          <>
                            <span className="font-bold">{item.quantity || "1 ct"}</span>{" "}
                            {item.productName}
                          </>
                        )}
                      </p>
                      
                      {/* Kroger Size • Price */}
                      {item.found && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {item.size}
                          {item.size && (item.price || item.promoPrice) && " • "}
                          {item.promoPrice ? (
                            <span className="text-red-600 dark:text-red-400">
                              {formatPrice(item.promoPrice)}
                            </span>
                          ) : item.price ? (
                            <span>{formatPrice(item.price)}</span>
                          ) : null}
                        </p>
                      )}

                      {/* Kroger Aisle Location */}
                      {item.found && item.krogerAisles?.[0]?.aisleNumber && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          Aisle {item.krogerAisles[0].aisleNumber}
                          {item.krogerAisles[0].description && ` - ${item.krogerAisles[0].description}`}
                          {item.krogerAisles[0].shelfNumber && ` • Shelf ${item.krogerAisles[0].shelfNumber}`}
                          {item.krogerAisles[0].side && ` (Side ${item.krogerAisles[0].side})`}
                        </p>
                      )}

                      {/* Not found indicator */}
                      {!item.found && (
                        <p className="text-sm text-red-500 mt-1">
                          Not found at Kroger
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedItem && (
        <ProductDetailModal
          item={selectedItem}
          locationId={shoppingList.locationId}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Search Product Modal for unfound items */}
      {searchItem && (
        <SearchProductModal
          item={searchItem.item}
          itemIndex={searchItem.index}
          locationId={shoppingList.locationId}
          shoppingListId={shoppingList._id}
          isOpen={!!searchItem}
          onClose={() => setSearchItem(null)}
          onItemUpdated={fetchShoppingList}
        />
      )}
    </Layout>
  );
}
