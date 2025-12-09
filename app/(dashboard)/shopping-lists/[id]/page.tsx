"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Layout from "@/components/Layout";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import { ShoppingCart, ExternalLink, Barcode, Loader2, Search, Check, Upload, Plus, Edit, Trash2, Scan, X, AlertTriangle } from "lucide-react";
import { KrogerProduct } from "@/lib/types/kroger";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { barcodesMatch } from "@/lib/barcode-utils";

// Audio feedback utilities
const playBeep = (frequency: number, duration: number, type: "sine" | "square" = "sine") => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    // Fade out to avoid clicks
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    // Silently fail if audio context is not available
    console.debug("Audio playback not available:", error);
  }
};

const playSuccessSound = () => {
  // Play two ascending beeps (success sound)
  playBeep(523.25, 0.1, "sine"); // C5
  setTimeout(() => {
    playBeep(659.25, 0.15, "sine"); // E5
  }, 100);
};

const playFailureSound = () => {
  // Play a low descending beep (error sound)
  playBeep(392.00, 0.2, "square"); // G4
  setTimeout(() => {
    playBeep(311.13, 0.3, "square"); // D#4
  }, 150);
};

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
  app?: string; // "Instacart" or "DoorDash"
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
  done?: boolean;
  problem?: boolean;
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

// App tag colors
const getAppTagColor = (appName?: string) => {
  if (!appName) return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400" };
  if (appName === "Instacart") return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-400" };
  if (appName === "DoorDash") return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-400" };
  return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400" };
};

// App tag colors for badge (non-transparent, dark background)
const getAppTagColorForBadge = (appName?: string) => {
  if (!appName) return { bg: "bg-gray-800 dark:bg-gray-700", text: "text-gray-300 dark:text-gray-300" };
  if (appName === "Instacart") return { bg: "bg-green-700 dark:bg-green-800", text: "text-white dark:text-white" };
  if (appName === "DoorDash") return { bg: "bg-red-700 dark:bg-red-800", text: "text-white dark:text-white" };
  return { bg: "bg-gray-800 dark:bg-gray-700", text: "text-gray-300 dark:text-gray-300" };
};

// Swipeable Item Component
function CustomerBadge({ customer, app }: { customer?: string; app?: string }) {
  if (!customer) return null;
  const bgColor = customerColors[customer] || "bg-gray-500";
  const appColor = getAppTagColorForBadge(app);
  
  // Convert app name to short version
  const getShortAppName = (appName?: string) => {
    if (appName === "Instacart") return "IC";
    if (appName === "DoorDash") return "DD";
    return appName;
  };
  
  return (
    <div className="absolute -top-1 -left-1 flex flex-col gap-1 z-10">
      <div className="flex items-center gap-1">
        <div 
          className={`w-6 h-6 ${bgColor} text-white rounded-full flex items-center justify-center text-xs font-bold shadow`}
        >
          {customer}
        </div>
        {app && (
          <span className={`text-xs px-2 py-0.5 rounded ${appColor.bg} ${appColor.text} font-semibold shadow whitespace-nowrap`}>
            {getShortAppName(app)}
          </span>
        )}
      </div>
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

  const handleSelectProduct = (productId: string) => {
    const product = searchResults.find(p => p.productId === productId);
    if (product) {
      setSelectedProduct(product);
    }
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
        app: item.app,
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
                    onClick={() => handleSelectProduct(product.productId)}
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

// Edit Item Modal Component
function EditItemModal({
  item,
  itemIndex,
  shoppingListId,
  locationId,
  isOpen,
  onClose,
  onItemUpdated,
}: {
  item: ShoppingListItem;
  itemIndex: number;
  shoppingListId: string;
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated: () => void;
}) {
  const [customer, setCustomer] = useState(item.customer || "A");
  const [quantity, setQuantity] = useState(item.quantity || "1");
  const [app, setApp] = useState(item.app || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KrogerProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<KrogerProduct | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCustomer(item.customer || "A");
      setQuantity(item.quantity || "1");
      setApp(item.app || "");
      setError(null);
      setProductName("");
      setSearchResults([]);
      setSelectedProduct(null);
      setSearchError(null);
    }
  }, [isOpen, item]);

  const handleSearch = async () => {
    if (!productName.trim() || productName.trim().length < 2) {
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setSelectedProduct(null);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/kroger/products/search?term=${encodeURIComponent(productName)}&locationId=${locationId}&limit=10`
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      let updatedItem: ShoppingListItem;

      // If a new product was selected, replace the item with new product data
      if (selectedProduct) {
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

        updatedItem = {
          searchTerm: productName,
          productName: selectedProduct.description || productName,
          customer: customer,
          quantity: quantity,
          app: app || undefined,
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
      } else {
        // Just update the existing item's fields
        updatedItem = {
          ...item,
          customer,
          quantity,
          app: app || undefined,
        };
      }

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
      setError(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Item">
      <div className="space-y-4">
        {/* Current Product Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Current Product
          </label>
          <p className="text-gray-900 dark:text-white font-medium">{item.productName}</p>
        </div>

        {/* Search for Different Product */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search for Different Product (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !searching) {
                  handleSearch();
                }
              }}
              placeholder="Enter product name to search..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !productName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {searchError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Product
            </label>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchResults.map((product) => {
                const imageUrl = getImageUrl(product);
                const isSelected = selectedProduct?.productId === product.productId;
                const handleProductClick = () => {
                  const foundProduct = searchResults.find(p => p.productId === product.productId);
                  if (foundProduct) {
                    setSelectedProduct(foundProduct);
                  }
                };
                return (
                  <div
                    key={product.productId}
                    onClick={handleProductClick}
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
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {product.description}
                        </p>
                        {product.brand && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{product.brand}</p>
                        )}
                        {product.items?.[0]?.price?.regular && (
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                            ${product.items[0].price.regular.toFixed(2)}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedProduct && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              ✓ New product selected: <strong>{selectedProduct.description}</strong>
            </p>
          </div>
        )}

        {/* Customer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Customer
          </label>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Quantity
          </label>
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="1"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* App */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            App
          </label>
          <select
            value={app}
            onChange={(e) => setApp(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None</option>
            <option value="Instacart">Instacart</option>
            <option value="DoorDash">DoorDash</option>
          </select>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Manual Entry Modal Component
function ManualEntryModal({
  locationId,
  shoppingListId,
  isOpen,
  onClose,
  onItemAdded,
  selectedApp,
}: {
  locationId: string;
  shoppingListId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: () => void;
  selectedApp: string;
}) {
  const [productName, setProductName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KrogerProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<KrogerProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customer, setCustomer] = useState("A");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    if (isOpen) {
      setProductName("");
      setSearchResults([]);
      setSelectedProduct(null);
      setSearchError(null);
      setCustomer("A");
      setQuantity("1");
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!productName.trim() || productName.trim().length < 2) {
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setSelectedProduct(null);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/kroger/products/search?term=${encodeURIComponent(productName)}&locationId=${locationId}&limit=10`
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

      const newItem: ShoppingListItem = {
        searchTerm: productName,
        productName: selectedProduct.description || productName,
        customer: customer,
        quantity: quantity,
        app: selectedApp || undefined,
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

      // Add the item via API
      const response = await fetch(`/api/shopping-lists/${shoppingListId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: [newItem] }),
      });

      if (!response.ok) {
        throw new Error("Failed to add item");
      }

      onItemAdded();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setSearchError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  const getImageUrl = (product: KrogerProduct) => {
    if (product.images && product.images.length > 0) {
      // Match the same logic used when saving: prioritize front perspective, then default, then first image
      const frontImg = product.images.find(img => img.perspective === "front");
      const defaultImg = product.images.find(img => img.default);
      const imgToUse = frontImg || defaultImg || product.images[0];
      
      if (imgToUse?.sizes && imgToUse.sizes.length > 0) {
        const sizeOrder = ["xlarge", "large", "medium", "small", "thumbnail"];
        for (const size of sizeOrder) {
          const found = imgToUse.sizes.find(s => s.size === size);
          if (found?.url) return found.url;
        }
        return imgToUse.sizes[0]?.url;
      }
    }
    return null;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Product Manually">
      <div className="space-y-4">
        {/* Product Name Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Product Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !searching) {
                  handleSearch();
                }
              }}
              placeholder="Enter product name..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !productName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {/* Customer and Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Customer
            </label>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="E">E</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quantity
            </label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {searchError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Product
            </label>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchResults.map((product) => {
                const imageUrl = getImageUrl(product);
                const isSelected = selectedProduct?.productId === product.productId;
                const handleProductClick = () => {
                  const foundProduct = searchResults.find(p => p.productId === product.productId);
                  if (foundProduct) {
                    setSelectedProduct(foundProduct);
                  }
                };
                return (
                  <div
                    key={product.productId}
                    onClick={handleProductClick}
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
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {product.description}
                        </p>
                        {product.brand && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{product.brand}</p>
                        )}
                        {product.items?.[0]?.price?.regular && (
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                            ${product.items[0].price.regular.toFixed(2)}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
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
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add to List
                </>
              )}
            </button>
          </div>
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
  onEdit,
  onDelete,
  onMoveToProblem,
  onMoveToTodo,
  onMoveToDone,
}: {
  item: ShoppingListItem;
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMoveToProblem?: () => void;
  onMoveToTodo?: () => void;
  onMoveToDone?: () => void;
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

  // Get best image - prioritize item.imageUrl (same as shown in list), then fall back to product images
  const getImageUrl = () => {
    // First, use the image from the item (same as shown in the todo list)
    if (item.imageUrl) {
      return item.imageUrl;
    }
    // Fall back to product images if item doesn't have one
    if (product?.images && product.images.length > 0) {
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
      <div className="space-y-4 relative">
        {/* Close button in top right */}
        <button
          onClick={onClose}
          className="absolute top-0 right-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Image with Customer Badge and App Tag */}
            <div className="flex justify-center">
              {imageUrl ? (
                <div className="relative w-48 h-48 bg-white rounded-lg overflow-visible">
                  <CustomerBadge customer={item.customer} app={item.app} />
                  <div className="relative w-full h-full overflow-hidden rounded-lg">
                    <Image
                      src={imageUrl}
                      alt={item.description || item.productName}
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                  </div>
                </div>
              ) : (
                <div className="relative w-48 h-48 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-visible">
                  <CustomerBadge customer={item.customer} app={item.app} />
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

            {/* Status Change and Action Buttons */}
            <div className="space-y-2 pt-2">
              {/* Status Change Buttons */}
              <div className="flex gap-2">
                {onMoveToTodo && (item.done || item.problem) && (
                  <button
                    onClick={() => {
                      onMoveToTodo();
                      onClose();
                    }}
                    className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Move to Todo
                  </button>
                )}
                {onMoveToProblem && !item.problem && (
                  <button
                    onClick={() => {
                      onMoveToProblem();
                      onClose();
                    }}
                    className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    Move to Problem
                  </button>
                )}
                {onMoveToDone && !item.done && (
                  <button
                    onClick={() => {
                      onMoveToDone();
                      onClose();
                    }}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Mark as Done
                  </button>
                )}
              </div>
              
              {/* Edit and Delete Buttons */}
              <div className="flex gap-2">
                {onEdit && (
                  <button
                    onClick={() => {
                      onEdit();
                      onClose();
                    }}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit className="w-5 h-5" />
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => {
                      if (confirm("Delete this item?")) {
                        onDelete();
                        onClose();
                      }
                    }}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// Customer Identification Modal Component
function CustomerIdentificationModal({
  isOpen,
  onClose,
  shoppingListId,
  locationId,
  onItemUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  shoppingListId: string;
  locationId: string;
  onItemUpdated: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [matchingItems, setMatchingItems] = useState<ShoppingListItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setScanning(false);
      setScannedBarcode("");
      setMatchingItems([]);
      // Cleanup video stream
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }
  }, [isOpen]);

  // Start barcode scanner when scanning state becomes true
  useEffect(() => {
    if (!scanning || !isOpen) {
      // Cleanup when stopping
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }

    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    const videoElement = videoRef.current;
    if (!videoElement) {
      console.error("Video element not found");
      setScanning(false);
      return;
    }

    let isScanning = true;

    // Start scanning
    codeReader
      .decodeFromVideoDevice(undefined, videoElement, (result, error) => {
        if (result && isScanning) {
          isScanning = false;
          const scannedCode = result.getText();
          setScannedBarcode(scannedCode);
          
          // Find matching items in the done list
          fetch(`/api/shopping-lists/${shoppingListId}`)
            .then(res => res.json())
            .then(data => {
              const doneItems = data.items.filter((item: ShoppingListItem) => item.done);
              const matches = doneItems.filter((item: ShoppingListItem) => 
                item.upc && barcodesMatch(scannedCode, item.upc)
              );
              setMatchingItems(matches);
            })
            .catch(console.error);

          // Stop video stream
          if (videoElement.srcObject) {
            const stream = videoElement.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoElement.srcObject = null;
          }
          setScanning(false);
        }
        if (error && error.name !== "NotFoundException") {
          console.error("Scan error:", error);
        }
      })
      .catch((err) => {
        console.error("Failed to start scanner:", err);
        setScanning(false);
      });

    // Cleanup function
    return () => {
      isScanning = false;
      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
    };
  }, [scanning, isOpen, shoppingListId]);

  const handleSearch = async () => {
    if (!searchTerm.trim() || searchTerm.trim().length < 3) {
      return;
    }

    setSearching(true);
    setMatchingItems([]);

    try {
      // Fetch the shopping list and filter done items
      const response = await fetch(`/api/shopping-lists/${shoppingListId}`);
      
      if (!response.ok) {
        throw new Error("Failed to load shopping list");
      }

      const data = await response.json();
      const doneItems = data.items.filter((item: ShoppingListItem) => item.done);
      
      // Search through done items by product name, description, or UPC
      const searchLower = searchTerm.toLowerCase().trim();
      const matches = doneItems.filter((item: ShoppingListItem) => {
        const productName = (item.productName || "").toLowerCase();
        const description = (item.description || "").toLowerCase();
        const upc = (item.upc || "").toLowerCase();
        const searchTerm = (item.searchTerm || "").toLowerCase();
        
        return productName.includes(searchLower) ||
               description.includes(searchLower) ||
               upc.includes(searchLower) ||
               searchTerm.includes(searchLower);
      });
      
      setMatchingItems(matches);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleBarcodeScan = () => {
    setScannedBarcode("");
    setMatchingItems([]);
    setScanning(true);
  };

  const handleStopScan = () => {
    setScanning(false);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };



  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sorting Helper - Find Customer & App">
      <div className="space-y-4">
        {/* Search Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search by Product Name or UPC
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Enter product name or UPC..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchTerm.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </div>

        {/* Barcode Scan Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Or Scan Barcode
          </label>
          {!scanning ? (
            <button
              onClick={handleBarcodeScan}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Scan className="w-5 h-5" />
              Start Barcode Scan
            </button>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <video
                  ref={videoRef}
                  className="w-full rounded-lg border-2 border-gray-300 dark:border-gray-600"
                  style={{ aspectRatio: "4/3" }}
                  muted
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-green-500 rounded-lg w-3/4 h-1/2" />
                </div>
              </div>
              <button
                onClick={handleStopScan}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Stop Scanning
              </button>
              {scannedBarcode && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Scanned: {scannedBarcode}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Matching Items - Read-only display */}
        {matchingItems.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Matching Items ({matchingItems.length})
            </label>
            <div className="space-y-2">
              {matchingItems.map((item, idx) => {
                const customer = item.customer || "A";
                const customerBgColor = customerColors[customer] || customerColors.A;
                const appColor = getAppTagColorForBadge(item.app);
                return (
                  <div
                    key={idx}
                    className="w-full p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                  >
                    <p className="font-medium text-gray-900 dark:text-white mb-2">
                      {item.description || item.productName}
                    </p>
                    {item.upc && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">UPC: {item.upc}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer:</span>
                        <span className={`px-3 py-1 rounded-full text-white text-sm font-bold ${customerBgColor}`}>
                          {customer}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">App:</span>
                        <span className={`px-3 py-1 rounded text-white text-sm font-semibold ${appColor.bg} ${appColor.text}`}>
                          {item.app || "?"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {matchingItems.length === 0 && (searchTerm || scannedBarcode) && !searching && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            <p>No matching items found in done list</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Barcode Scanner Component
function BarcodeScanner({
  isOpen,
  onClose,
  onScan,
  item,
}: {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  item: ShoppingListItem;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<string>("");
  const [scannedCode, setScannedCode] = useState<string>("");
  const [manualUPC, setManualUPC] = useState<string>("");

  useEffect(() => {
    if (!isOpen) {
      // Cleanup when closing - stop video stream
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      setScannedCode("");
      setManualUPC("");
      return;
    }

    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    const videoElement = videoRef.current;
    if (!videoElement) {
      setError("No video element found.");
      return;
    }

    let scanning = true;

    // Start scanning
    const scanPromise = codeReader
      .decodeFromVideoDevice(
        undefined, // auto-select camera
        videoElement,
        (result, error) => {
          if (result && scanning) {
            const scannedCode = result.getText();
            setScannedCode(scannedCode);
            // Clear any existing timeout
            if (scanTimeoutRef.current) {
              clearTimeout(scanTimeoutRef.current);
            }
            // Wait a bit before finalizing to allow for manual override
            scanTimeoutRef.current = setTimeout(() => {
              if (scanning) {
                scanning = false;
                // Stop video stream
                if (videoElement.srcObject) {
                  const stream = videoElement.srcObject as MediaStream;
                  stream.getTracks().forEach(track => track.stop());
                  videoElement.srcObject = null;
                }
                onScan(scannedCode);
              }
            }, 1000);
          }
          if (error && !(error instanceof Error && error.name === "NotFoundException")) {
            // Only show non-"not found" errors
            console.error("Scan error:", error);
          }
        }
      )
      .catch((err) => {
        console.error(err);
        setError(String(err));
      });

    // Cleanup on unmount
    return () => {
      scanning = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      // Stop video stream
      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
    };
  }, [isOpen, onScan]);

  const handleManualOverride = () => {
    if (manualUPC.trim()) {
      // Cancel any pending auto-scan
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      // Stop video stream
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      onScan(manualUPC.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan Barcode">
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Point your camera at the barcode
          </p>
        </div>

        {/* Expected UPC Display */}
        {item.upc && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Expected UPC:</p>
            <p className="text-lg font-mono font-bold text-blue-900 dark:text-blue-100">{item.upc}</p>
          </div>
        )}

        {/* Video preview */}
        <div className="relative w-full max-w-md mx-auto">
          <video
            ref={videoRef}
            className="w-full rounded-lg border-2 border-gray-300 dark:border-gray-600"
            style={{ aspectRatio: "4/3" }}
            muted
            playsInline
          />
          {/* Scanning overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-blue-500 rounded-lg w-3/4 h-1/2" />
          </div>
        </div>

        {/* Scanned Code Display */}
        {scannedCode && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Scanned:</p>
            <p className="text-lg font-mono font-bold text-green-900 dark:text-green-100">{scannedCode}</p>
          </div>
        )}

        {/* Manual Override Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Manual Override UPC
          </label>
          {/* Quick Override Button - Use Expected UPC */}
          {item.upc && (
            <button
              onClick={() => {
                // Cancel any pending auto-scan
                if (scanTimeoutRef.current) {
                  clearTimeout(scanTimeoutRef.current);
                  scanTimeoutRef.current = null;
                }
                // Stop video stream
                if (videoRef.current?.srcObject) {
                  const stream = videoRef.current.srcObject as MediaStream;
                  stream.getTracks().forEach(track => track.stop());
                  videoRef.current.srcObject = null;
                }
                onScan(item.upc!);
              }}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium mb-2"
            >
              Use Expected UPC ({item.upc})
            </button>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={manualUPC}
              onChange={(e) => setManualUPC(e.target.value)}
              placeholder="Enter UPC manually"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualUPC.trim()) {
                  handleManualOverride();
                }
              }}
            />
            <button
              onClick={handleManualOverride}
              disabled={!manualUPC.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              Override
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Scan Result Modal Component
function ScanResultModal({
  isOpen,
  onClose,
  success,
  item,
  scannedBarcode,
  onForceDone,
  onConfirmQuantity,
}: {
  isOpen: boolean;
  onClose: () => void;
  success: boolean;
  item: ShoppingListItem;
  scannedBarcode?: string;
  onForceDone?: () => void;
  onConfirmQuantity?: () => void;
}) {
  const customer = item.customer || "A";
  const app = item.app || "";
  
  // Get customer color
  const customerColorMap: Record<string, { bg: string; text: string; border: string }> = {
    A: { bg: "bg-green-500", text: "text-white", border: "border-green-600" },
    B: { bg: "bg-blue-500", text: "text-white", border: "border-blue-600" },
    C: { bg: "bg-orange-500", text: "text-white", border: "border-orange-600" },
    D: { bg: "bg-purple-500", text: "text-white", border: "border-purple-600" },
    E: { bg: "bg-pink-500", text: "text-white", border: "border-pink-600" },
  };

  // Use red colors for failures, customer colors for success
  const failureColors = { bg: "bg-red-500", text: "text-white", border: "border-red-600" };
  const colors = success ? (customerColorMap[customer] || customerColorMap.A) : failureColors;
  
  // Get short app name
  const getShortAppName = (appName?: string) => {
    if (appName === "Instacart") return "IC";
    if (appName === "DoorDash") return "DD";
    return appName || "";
  };

  // Play audio feedback when modal opens
  useEffect(() => {
    if (isOpen) {
      if (success) {
        playSuccessSound();
      } else {
        playFailureSound();
      }
    }
  }, [isOpen, success]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className={`relative w-full max-w-md rounded-2xl shadow-2xl ${colors.bg} ${colors.text} border-4 ${colors.border}`}>
        <div className="p-8 text-center space-y-6">
          {/* App Name - Prominent */}
          {app && (
            <div className="mb-4">
              <div className="inline-block px-6 py-3 bg-white/20 backdrop-blur-sm rounded-lg border-2 border-white/30">
                <p className="text-2xl font-bold">{getShortAppName(app)}</p>
              </div>
            </div>
          )}

          {/* Customer Badge - Large */}
          <div className="flex justify-center">
            <div className={`w-24 h-24 ${colors.bg} rounded-full flex items-center justify-center text-4xl font-bold shadow-lg border-4 border-white/50`}>
              {customer}
            </div>
          </div>

          {/* Success/Error Message */}
          <div className="space-y-2">
            {success ? (
              <>
                <div className="flex justify-center">
                  <Check className="w-16 h-16 text-white" strokeWidth={3} />
                </div>
                <h2 className="text-3xl font-bold">Success!</h2>
                <p className="text-lg opacity-90">Correct item scanned</p>
              </>
            ) : (
              <>
                <div className="flex justify-center">
                  <X className="w-16 h-16 text-white" strokeWidth={3} />
                </div>
                <h2 className="text-3xl font-bold">Incorrect Barcode</h2>
                <p className="text-lg opacity-90">Scanned: {scannedBarcode}</p>
                <p className="text-base opacity-80">Expected: {item.upc || "N/A"}</p>
              </>
            )}
          </div>

          {/* Product Name */}
          <div className="pt-4 border-t border-white/30">
            <p className="text-lg font-semibold opacity-90">{item.productName}</p>
            {item.description && item.description !== item.productName && (
              <p className="text-sm opacity-75 mt-1">{item.description}</p>
            )}
          </div>

          {/* Quantity Confirmation (only for successful scans) */}
          {success && (
            <div className="pt-4 border-t border-white/30">
              <p className="text-lg font-semibold opacity-90 mb-2">Confirm Quantity:</p>
              <p className="text-2xl font-bold opacity-95">{item.quantity || "1"}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!success && onForceDone && (
              <button
                onClick={() => {
                  onForceDone();
                  onClose();
                }}
                className="flex-1 px-6 py-4 bg-white/30 backdrop-blur-sm rounded-lg border-2 border-white/40 hover:bg-white/40 transition-colors font-semibold text-lg"
              >
                Mark as Done
              </button>
            )}
            {success && onConfirmQuantity ? (
              <button
                onClick={() => {
                  onConfirmQuantity();
                  onClose();
                }}
                className="w-full px-6 py-4 bg-white/30 backdrop-blur-sm rounded-lg border-2 border-white/40 hover:bg-white/40 transition-colors font-semibold text-lg"
              >
                OK
              </button>
            ) : (
              <button
                onClick={onClose}
                className={`px-6 py-4 bg-white/20 backdrop-blur-sm rounded-lg border-2 border-white/30 hover:bg-white/30 transition-colors font-semibold text-lg ${!success && onForceDone ? "flex-1" : "w-full"}`}
              >
                {success ? "OK" : "Try Again"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
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
  const [editItem, setEditItem] = useState<{ item: ShoppingListItem; index: number } | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [selectedApp, setSelectedApp] = useState<string>("Instacart");
  const [activeTab, setActiveTab] = useState<"todo" | "problem" | "done">("todo");
  const [scanningItem, setScanningItem] = useState<ShoppingListItem | null>(null);
  const [scanResult, setScanResult] = useState<{ success: boolean; item: ShoppingListItem; scannedBarcode?: string } | null>(null);
  const [customerIdentificationOpen, setCustomerIdentificationOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!shoppingList) return;

    setUploading(true);
    setError(null);
    setUploadProgress(`Processing 1 of ${files.length} screenshots...`);

    try {
      // Process screenshots one at a time to avoid payload size limits
      const allItems: any[] = [];
      
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Processing ${i + 1} of ${files.length} screenshots...`);
        
        // Convert file to base64
        const base64 = await readFileAsBase64(files[i]);
        
        // Process single screenshot
        const response = await fetch("/api/shopping-lists/process-screenshot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            screenshot: base64,
            locationId: shoppingList.locationId,
            app: selectedApp || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to process screenshot" }));
          throw new Error(errorData.error || `Failed to process screenshot ${i + 1}`);
        }

        const data = await response.json();
        if (data.items && data.items.length > 0) {
          allItems.push(...data.items);
        }
      }

      if (allItems.length === 0) {
        setError("No products found in any of the screenshots");
        return;
      }

      setUploadProgress("Adding items to shopping list...");

      // Add items to existing shopping list
      const addResponse = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: allItems,
        }),
      });

      if (!addResponse.ok) {
        const errorData = await addResponse.json().catch(() => ({ error: "Failed to add items" }));
        throw new Error(errorData.error || "Failed to add items");
      }

      // Reload the shopping list
      await fetchShoppingList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process screenshots");
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleManualEntryAdded = async () => {
    await fetchShoppingList();
  };

  const handleScanBarcode = (item: ShoppingListItem) => {
    setScanningItem(item);
  };

  const handleBarcodeScanned = async (scannedCode: string) => {
    if (!scanningItem) return;

    if (!scanningItem.upc) {
      // No expected UPC to compare against
      setScanResult({
        success: false,
        item: scanningItem,
        scannedBarcode: scannedCode,
      });
      setScanningItem(null);
      return;
    }

    // Use proper barcode normalization that handles broken formats
    // This handles cases like "0007800001336" (broken 13-digit: "00" + body11)
    // and normalizes both to canonical 12-digit UPC-A format
    const success = barcodesMatch(scannedCode, scanningItem.upc);

    // Close scanner
    setScanningItem(null);

    // Show result modal (audio will play when modal opens)
    setScanResult({
      success,
      item: scanningItem,
      scannedBarcode: scannedCode,
    });

    // Don't automatically mark as done - wait for quantity confirmation
  };

  const handleScanResultClose = () => {
    // Capture the result before clearing it
    const result = scanResult;
    setScanResult(null);
    
    // If it was an error, reopen the scanner to try again
    if (result && !result.success) {
      setScanningItem(result.item);
    }
  };

  const handleForceMarkDone = async (item: ShoppingListItem) => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndex: shoppingList?.items.findIndex(i => i === item) ?? -1,
          item: {
            ...item,
            done: true,
          },
        }),
      });

      if (response.ok) {
        await fetchShoppingList();
      } else {
        setError("Failed to mark item as done");
      }
    } catch (err) {
      console.error("Failed to mark item as done:", err);
      setError("Failed to mark item as done");
    }
  };

  const handleMoveToProblem = async (item: ShoppingListItem) => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndex: shoppingList?.items.findIndex(i => i === item) ?? -1,
          item: {
            ...item,
            problem: true,
            done: false, // Ensure it's not marked as done when moved to problem
          },
        }),
      });

      if (response.ok) {
        await fetchShoppingList();
      } else {
        setError("Failed to move item to problem");
      }
    } catch (err) {
      console.error("Failed to move item to problem:", err);
      setError("Failed to move item to problem");
    }
  };

  const handleMoveToTodo = async (item: ShoppingListItem) => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndex: shoppingList?.items.findIndex(i => i === item) ?? -1,
          item: {
            ...item,
            problem: false,
            done: false,
          },
        }),
      });

      if (response.ok) {
        await fetchShoppingList();
      } else {
        setError("Failed to move item to todo");
      }
    } catch (err) {
      console.error("Failed to move item to todo:", err);
      setError("Failed to move item to todo");
    }
  };

  const handleMoveToDone = async (item: ShoppingListItem) => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndex: shoppingList?.items.findIndex(i => i === item) ?? -1,
          item: {
            ...item,
            done: true,
            problem: false, // Ensure it's not marked as problem when moved to done
          },
        }),
      });

      if (response.ok) {
        await fetchShoppingList();
      } else {
        setError("Failed to mark item as done");
      }
    } catch (err) {
      console.error("Failed to mark item as done:", err);
      setError("Failed to mark item as done");
    }
  };

  const handleConfirmQuantity = async (item: ShoppingListItem) => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndex: shoppingList?.items.findIndex(i => i === item) ?? -1,
          item: {
            ...item,
            done: true,
          },
        }),
      });

      if (response.ok) {
        await fetchShoppingList();
      } else {
        setError("Failed to mark item as done");
      }
    } catch (err) {
      console.error("Failed to mark item as done:", err);
      setError("Failed to mark item as done");
    }
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

  // Helper to get primary aisle info - uses the smallest aisle number
  const getPrimaryAisle = (item: ShoppingListItem) => {
    const aisles = item.krogerAisles;
    if (!aisles || aisles.length === 0) return undefined;
    
    // Find the aisle with the smallest aisle number
    return aisles.reduce((smallest, current) => {
      const smallestNum = parseInt(smallest?.aisleNumber || "999") || 999;
      const currentNum = parseInt(current?.aisleNumber || "999") || 999;
      return currentNum < smallestNum ? current : smallest;
    });
  };

  // Create items with their original indices before sorting
  const itemsWithIndices = shoppingList.items.map((item, index) => ({ item, originalIndex: index }));
  
  // Sort items by: 1) Aisle number (unknowns first), 2) Bay number, 3) Shelf number
  const sortedItemsWithIndices = itemsWithIndices.sort((a, b) => {
    const aisleA = getPrimaryAisle(a.item);
    const aisleB = getPrimaryAisle(b.item);
    
    // Check if aisles are unknown (no aisle number)
    const isUnknownA = !aisleA || !aisleA.aisleNumber;
    const isUnknownB = !aisleB || !aisleB.aisleNumber;
    
    // Unknown aisles go to the top
    if (isUnknownA && !isUnknownB) return -1; // A is unknown, B is not - A comes first
    if (!isUnknownA && isUnknownB) return 1;  // B is unknown, A is not - B comes first
    if (isUnknownA && isUnknownB) return 0;  // Both unknown - keep original order
    
    // At this point, both aisles are known (not undefined)
    if (!aisleA || !aisleB) return 0; // Type guard - should not happen but TypeScript needs it
    
    // Compare aisle numbers (both known)
    const aisleNumA = parseInt(aisleA.aisleNumber || "999") || 999;
    const aisleNumB = parseInt(aisleB.aisleNumber || "999") || 999;
    if (aisleNumA !== aisleNumB) return aisleNumA - aisleNumB;
    
    // Same aisle - sort by bay number
    const bayA = parseInt(aisleA?.bayNumber || "999") || 999;
    const bayB = parseInt(aisleB?.bayNumber || "999") || 999;
    if (bayA !== bayB) return bayA - bayB;
    
    // Same bay - sort by shelf number
    const shelfA = parseInt(aisleA?.shelfNumber || "999") || 999;
    const shelfB = parseInt(aisleB?.shelfNumber || "999") || 999;
    return shelfA - shelfB;
  });
  
  const sortedItems = sortedItemsWithIndices.map(({ item }) => item);

  // Group sorted items by aisle + bay + shelf for section headers
  const groupedItems: { aisle: string; bay: string; shelf: string; side: string; description: string; items: ShoppingListItem[]; originalIndices: number[] }[] = [];
  
  sortedItemsWithIndices.forEach(({ item, originalIndex }) => {
    const primaryAisle = getPrimaryAisle(item);
    const aisleNum = primaryAisle?.aisleNumber || "";
    const bay = primaryAisle?.bayNumber || "";
    const shelf = primaryAisle?.shelfNumber || "";
    const side = primaryAisle?.side || "";
    const description = primaryAisle?.description || "";
    
    const lastGroup = groupedItems[groupedItems.length - 1];
    if (lastGroup && lastGroup.aisle === aisleNum && lastGroup.bay === bay && lastGroup.shelf === shelf) {
      lastGroup.items.push(item);
      lastGroup.originalIndices.push(originalIndex);
    } else {
      groupedItems.push({ aisle: aisleNum, bay, shelf, side, description, items: [item], originalIndices: [originalIndex] });
    }
  });

  // If no aisle groupings, just show all items
  if (groupedItems.length === 0 || (groupedItems.length === 1 && !groupedItems[0].aisle)) {
    groupedItems.length = 0;
    groupedItems.push({ 
      aisle: "", 
      bay: "", 
      shelf: "", 
      side: "",
      description: "",
      items: sortedItems,
      originalIndices: sortedItemsWithIndices.map(({ originalIndex }) => originalIndex)
    });
  }

  // Filter items by status based on active tab
  const filteredGroupedItems = groupedItems.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (activeTab === "todo") return !item.done && !item.problem;
      if (activeTab === "problem") return item.problem;
      if (activeTab === "done") return item.done;
      return false;
    }),
    originalIndices: group.items
      .map((item, idx) => {
        if (activeTab === "todo" && !item.done && !item.problem) return group.originalIndices[idx];
        if (activeTab === "problem" && item.problem) return group.originalIndices[idx];
        if (activeTab === "done" && item.done) return group.originalIndices[idx];
        return -1;
      })
      .filter(idx => idx !== -1)
  })).filter(group => group.items.length > 0);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-4">
          {/* Todo/Problem/Done Tabs */}
          <div className="mb-4 flex gap-2 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab("todo")}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === "todo"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Todo ({shoppingList.items.filter(item => !item.done && !item.problem).length})
            </button>
            <button
              onClick={() => setActiveTab("problem")}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === "problem"
                  ? "text-orange-600 dark:text-orange-400 border-b-2 border-orange-600 dark:border-orange-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Problem ({shoppingList.items.filter(item => item.problem).length})
            </button>
            <button
              onClick={() => setActiveTab("done")}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === "done"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Done ({shoppingList.items.filter(item => item.done).length})
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
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
                {uploading && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{uploadProgress || "Processing..."}</span>
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 w-fit" role="group">
                <input
                  type="radio"
                  name="app-selector-detail"
                  id="app-instacart-detail"
                  value="Instacart"
                  checked={selectedApp === "Instacart"}
                  onChange={(e) => setSelectedApp(e.target.value)}
                  className="hidden"
                />
                <label
                  htmlFor="app-instacart-detail"
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                    selectedApp === "Instacart"
                      ? "bg-green-600 text-white"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  Instacart
                </label>
                
                <input
                  type="radio"
                  name="app-selector-detail"
                  id="app-doordash-detail"
                  value="DoorDash"
                  checked={selectedApp === "DoorDash"}
                  onChange={(e) => setSelectedApp(e.target.value)}
                  className="hidden"
                />
                <label
                  htmlFor="app-doordash-detail"
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                    selectedApp === "DoorDash"
                      ? "bg-red-600 text-white"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  DoorDash
                </label>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleScreenshotUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Add Screenshot</span>
                </button>
                <button
                  onClick={() => setManualEntryOpen(true)}
                  disabled={uploading}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Add Manually</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Identification Button - Only show on Done tab */}
        {activeTab === "done" && shoppingList.items.filter(item => item.done).length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setCustomerIdentificationOpen(true)}
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Search className="w-4 h-4" />
              Identify Customer for Item
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Items */}
        <div>
          {filteredGroupedItems.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>No {activeTab === "todo" ? "todo" : activeTab === "problem" ? "problem" : "completed"} items</p>
            </div>
          ) : (
            filteredGroupedItems.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Aisle/Bay/Shelf Header - Instacart Style */}
              {group.aisle && (
                <div className="pt-4 pb-2 border-b border-gray-200 dark:border-gray-700 mb-2">
                  <h2 className="font-bold text-gray-900 dark:text-white text-base">
                    {(() => {
                      const aisleNum = parseInt(group.aisle) || 0;
                      // If aisle number is 100+, show only the area description
                      if (aisleNum >= 100 && group.description) {
                        return `${group.description} | ${group.side || "?"} - Bay ${group.bay || "?"} | Shelf ${group.shelf || "?"}`;
                      }
                      // Otherwise show the full format with aisle number
                      return `Aisle ${group.aisle} | ${group.side || "?"} - Bay ${group.bay || "?"} | Shelf ${group.shelf || "?"}`;
                    })()}
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
                // Use the tracked original index from the grouped items
                const originalIndex = group.originalIndices[index];

                const handleItemClick = () => {
                  if (item.found) {
                    setSelectedItem(item);
                  } else if (originalIndex >= 0) {
                    setSearchItem({ item, index: originalIndex });
                  }
                };

                const handleEdit = () => {
                  if (originalIndex >= 0) {
                    setEditItem({ item, index: originalIndex });
                  }
                };

                const handleDelete = async () => {
                  if (originalIndex >= 0) {
                    try {
                      const response = await fetch(`/api/shopping-lists/${id}/items`, {
                        method: "DELETE",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ itemIndex: originalIndex }),
                      });

                      if (!response.ok) {
                        throw new Error("Failed to delete item");
                      }

                      await fetchShoppingList();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to delete item");
                    }
                  }
                };

                return (
                  <div
                    key={`${groupIndex}-${index}`}
                    className="mb-2 rounded-lg overflow-hidden"
                  >
                    <div 
                      className="flex gap-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors cursor-pointer"
                      onClick={handleItemClick}
                    >
                    {/* Product Image with Customer Badge */}
                    <div className="relative flex-shrink-0">
                      <CustomerBadge customer={item.customer} app={item.app} />
                      {item.imageUrl ? (
                        <div className="relative w-20 h-20 bg-white rounded-lg overflow-visible shadow-sm border border-gray-100 dark:border-gray-600">
                          <Image
                            src={item.imageUrl}
                            alt={item.found && item.description ? item.description : item.productName}
                            fill
                            className="object-contain p-2"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600 overflow-visible">
                          <ShoppingCart className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Quantity + Kroger Product Name */}
                          <p className="text-gray-900 dark:text-white leading-snug">
                            {item.found && item.description ? (
                              <>
                                {item.quantity && (
                                  <span className="font-bold">{item.quantity} </span>
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
                          {item.found && item.krogerAisles?.[0] && (() => {
                            const aisle = item.krogerAisles[0];
                            const locationParts: string[] = [];
                            
                            if (aisle.shelfNumber) {
                              locationParts.push(`Shelf ${aisle.shelfNumber}`);
                            }
                            
                            // Add side info if available
                            if (aisle.side) {
                              locationParts.push(`Side ${aisle.side}`);
                            }
                            
                            // Add bay if available
                            if (aisle.bayNumber) {
                              locationParts.push(`Bay ${aisle.bayNumber}`);
                            }
                            
                            const locationText = locationParts.join(" - ");
                            
                            return locationText ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                {locationText}
                              </p>
                            ) : null;
                          })()}

                          {/* Not found indicator */}
                          {!item.found && (
                            <p className="text-sm text-red-500 mt-1">
                              Not found at Kroger
                            </p>
                          )}
                        </div>
                        {/* Scan Button - Only show for todo items with UPC */}
                        {activeTab === "todo" && item.upc && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScanBarcode(item);
                            }}
                            className="flex-shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                          >
                            <Scan className="w-4 h-4" />
                            Scan
                          </button>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedItem && (() => {
        const itemIndex = shoppingList?.items.findIndex(i => i === selectedItem) ?? -1;
        return (
          <ProductDetailModal
            item={selectedItem}
            locationId={shoppingList.locationId}
            isOpen={!!selectedItem}
            onClose={() => setSelectedItem(null)}
            onEdit={() => {
              if (itemIndex >= 0) {
                setEditItem({ item: selectedItem, index: itemIndex });
                setSelectedItem(null);
              }
            }}
            onMoveToProblem={async () => {
              if (itemIndex >= 0) {
                await handleMoveToProblem(selectedItem);
                setSelectedItem(null);
              }
            }}
            onMoveToTodo={async () => {
              if (itemIndex >= 0) {
                await handleMoveToTodo(selectedItem);
                setSelectedItem(null);
              }
            }}
            onMoveToDone={async () => {
              if (itemIndex >= 0) {
                await handleMoveToDone(selectedItem);
                setSelectedItem(null);
              }
            }}
            onDelete={async () => {
              if (itemIndex >= 0) {
                try {
                  const response = await fetch(`/api/shopping-lists/${id}/items`, {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ itemIndex }),
                  });

                  if (!response.ok) {
                    throw new Error("Failed to delete item");
                  }

                  await fetchShoppingList();
                  setSelectedItem(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to delete item");
                }
              }
            }}
          />
        );
      })()}

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

      {/* Manual Entry Modal */}
      <ManualEntryModal
        locationId={shoppingList.locationId}
        shoppingListId={shoppingList._id}
        isOpen={manualEntryOpen}
        onClose={() => setManualEntryOpen(false)}
        onItemAdded={handleManualEntryAdded}
        selectedApp={selectedApp}
      />

      {/* Edit Item Modal */}
      {editItem && (
        <EditItemModal
          item={editItem.item}
          itemIndex={editItem.index}
          shoppingListId={shoppingList._id}
          locationId={shoppingList.locationId}
          isOpen={!!editItem}
          onClose={() => setEditItem(null)}
          onItemUpdated={fetchShoppingList}
        />
      )}

      {/* Barcode Scanner Modal */}
      {scanningItem && (
        <BarcodeScanner
          isOpen={!!scanningItem}
          onClose={() => setScanningItem(null)}
          onScan={handleBarcodeScanned}
          item={scanningItem}
        />
      )}

      {/* Scan Result Modal */}
      {scanResult && (
        <ScanResultModal
          isOpen={!!scanResult}
          onClose={handleScanResultClose}
          success={scanResult.success}
          item={scanResult.item}
          scannedBarcode={scanResult.scannedBarcode}
          onForceDone={() => handleForceMarkDone(scanResult.item)}
          onConfirmQuantity={() => handleConfirmQuantity(scanResult.item)}
        />
      )}

      {/* Customer Identification Modal */}
      {shoppingList && (
        <CustomerIdentificationModal
          isOpen={customerIdentificationOpen}
          onClose={() => setCustomerIdentificationOpen(false)}
          shoppingListId={shoppingList._id}
          locationId={shoppingList.locationId}
          onItemUpdated={fetchShoppingList}
        />
      )}
    </Layout>
  );
}
