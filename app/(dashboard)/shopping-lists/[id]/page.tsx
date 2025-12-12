"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import { ShoppingCart, ExternalLink, Barcode, Loader2, Search, Check, Upload, Plus, Edit, Trash2, Scan, X, AlertTriangle, Code, Share2, ArrowRight, ChevronDown, ChevronUp, FileImage, Eye, EyeOff } from "lucide-react";
import { useScreenshotProcessing } from "@/hooks/useScreenshotProcessing";
import JsonViewerModal from "@/components/JsonViewer";
import { KrogerProduct } from "@/lib/types/kroger";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
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

// Create optimized hints for UPC/EAN barcode scanning only
// This significantly improves performance by avoiding checks for QR codes, Code 128, etc.
// Performance improvement: ~50-70% faster by eliminating format checks
const createBarcodeHints = (): Map<DecodeHintType, any> => {
  const hints = new Map<DecodeHintType, any>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
  ]);
  return hints;
};

// Create optimized camera constraints for faster barcode scanning
// Lower resolution and frame rate reduce processing overhead
const createCameraConstraints = (): MediaStreamConstraints => {
  return {
    video: {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 20, max: 30 },
      facingMode: "environment", // Prefer back camera
    },
  };
};

// Target resolution for downsampling (sufficient for UPC/EAN barcodes)
// Performance improvement: ~30-50% faster by processing fewer pixels
const DOWNSAMPLE_WIDTH = 640;
const DOWNSAMPLE_HEIGHT = 480;
// Throttle scanning to process every Nth frame
// Performance improvement: ~20-30% faster by reducing CPU load
const SCAN_THROTTLE_FRAMES = 3; // Process every 3rd frame

// Create a downsampled canvas from video frame for faster processing
const createDownsampledCanvas = (
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement | null => {
  if (video.readyState < video.HAVE_CURRENT_DATA) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  
  if (!ctx) {
    return null;
  }

  // Draw video frame scaled down to target resolution
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  return canvas;
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
  screenshotId?: string; // Reference to the screenshot this item came from
  croppedImage?: string; // Base64 cropped image from moondream detection
  boundingBox?: { xMin: number; yMin: number; xMax: number; yMax: number }; // Bounding box coordinates from moondream (normalized 0-1)
  aiDetectedCroppedImage?: boolean; // AI detected if cropped image is cut off
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

interface ShoppingListScreenshot {
  id: string;
  base64: string;
  uploadedAt: string;
  app?: string;
  customers?: string[];
}

interface ShoppingList {
  _id: string;
  name: string;
  locationId: string;
  items: ShoppingListItem[];
  screenshots?: ShoppingListScreenshot[];
  sharedWith?: string[];
  sharedItemIndices?: number[];
  sharedItems?: { [userId: string]: number[] } | Map<string, number[]>; // Map of userId to item indices
  originalIndicesMap?: number[]; // Map from filtered index to original index (for shared users)
  isShared?: boolean;
  createdAt: string;
}

// Customer badge colors matching Instacart
const customerColors: Record<string, string> = {
  A: "bg-orange-500",
  B: "bg-blue-500",
  C: "bg-green-500",
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

// Generate a consistent color for a user based on their ID
const getUserColor = (userId: string): string => {
  // Hash the userId to get a consistent number
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use a palette of distinct colors
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-yellow-500",
    "bg-red-500",
    "bg-teal-500",
    "bg-orange-500",
    "bg-cyan-500",
    "bg-rose-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-sky-500",
    "bg-fuchsia-500",
  ];
  
  // Use absolute value of hash to get index
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

// Get user initials: first letter of first name and first letter of last name
const getUserInitials = (name: string | undefined, email: string | undefined, fallback: string): string => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return fallback.charAt(0).toUpperCase();
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
  shoppingList,
}: {
  item: ShoppingListItem;
  itemIndex: number;
  locationId: string;
  shoppingListId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated: () => void;
  shoppingList?: ShoppingList | null;
}) {
  const [searchTerm, setSearchTerm] = useState(item.searchTerm || item.productName);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KrogerProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<KrogerProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/shopping-lists/${shoppingListId}/items`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemIndex }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete item");
      }

      onItemUpdated();
      onClose();
    } catch (err) {
      console.error("Delete error:", err);
      setSearchError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setDeleting(false);
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
        price: krogerItem?.price?.regular ?? krogerItem?.nationalPrice?.regular,
        promoPrice: krogerItem?.price?.promo ?? krogerItem?.nationalPrice?.promo,
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

  // Find screenshot if item has screenshotId
  const screenshot = item.screenshotId && shoppingList?.screenshots 
    ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
    : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search for Product">
      <div className="space-y-4">
        {/* Product Image - Match what's displayed on todo list */}
        {item.croppedImage ? (
          <div className="w-full bg-white dark:bg-gray-50 border border-gray-200 dark:border-gray-300 rounded-lg overflow-hidden">
            <img
              src={item.croppedImage}
              alt={item.productName}
              className="w-full h-auto max-h-64 object-contain mx-auto block"
            />
          </div>
        ) : screenshot ? (
          <div className="w-full bg-gray-100 dark:bg-gray-200 border border-gray-200 dark:border-gray-300 rounded-lg overflow-hidden py-3 px-4">
            <img
              src={screenshot.base64}
              alt={item.productName}
              className="w-full h-auto max-h-64 object-contain mx-auto block"
            />
          </div>
        ) : null}

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

        {/* Action Buttons */}
        <div className="flex gap-3">
          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            title="Delete this item (useful for duplicates)"
          >
            {deleting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                Delete
              </>
            )}
          </button>

          {/* Save Button */}
          {selectedProduct && (
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
  shoppingList,
}: {
  item: ShoppingListItem;
  itemIndex: number;
  shoppingListId: string;
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated: () => void;
  shoppingList?: ShoppingList | null;
}) {
  const [customer, setCustomer] = useState(item.customer || "A");
  const [quantity, setQuantity] = useState(item.quantity || "1");
  const [app, setApp] = useState(item.app || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState(item.searchTerm || item.productName || "");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KrogerProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<KrogerProduct | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showOriginalScreenshot, setShowOriginalScreenshot] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCustomer(item.customer || "A");
      setQuantity(item.quantity || "1");
      setApp(item.app || "");
      setError(null);
      // Prefill with searchTerm (original Gemini response) if available, otherwise use productName
      setProductName(item.searchTerm || item.productName || "");
      setSearchResults([]);
      setSelectedProduct(null);
      setSearchError(null);
      // Hide original screenshot by default if cropped image exists
      setShowOriginalScreenshot(false);
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

        // Get price - prefer location-specific price, fall back to national price
        const price = krogerItem?.price?.regular ?? krogerItem?.nationalPrice?.regular;
        const promoPrice = krogerItem?.price?.promo ?? krogerItem?.nationalPrice?.promo;

        updatedItem = {
          // Preserve original Gemini data
          searchTerm: item.searchTerm || productName, // Keep original searchTerm from Gemini
          productName: selectedProduct.description || productName,
          customer: customer,
          quantity: quantity || item.quantity, // Preserve original quantity if not changed
          app: app || item.app || undefined,
          // Preserve screenshot and cropped image data
          screenshotId: item.screenshotId, // Preserve screenshot reference
          croppedImage: item.croppedImage, // Preserve cropped image
          // New Kroger product data
          productId: selectedProduct.productId,
          upc: selectedProduct.upc || krogerItem?.itemId,
          brand: selectedProduct.brand,
          description: selectedProduct.description,
          size: krogerItem?.size,
          price: price,
          promoPrice: promoPrice,
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

  // Find screenshot if item has screenshotId
  const screenshot = item.screenshotId && shoppingList?.screenshots 
    ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
    : null;

  // Determine which image to show by default
  const hasCroppedImage = !!item.croppedImage;
  const hasOriginalScreenshot = !!screenshot;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Item">
      <div className="space-y-4">
        {/* Screenshot Reference */}
        {(screenshot || item.croppedImage) && (
          <div className="space-y-3">
            {/* Cropped Product Image - Show by default if exists */}
            {item.croppedImage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Cropped Product Image
                </label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
                  <div className="relative inline-block w-full">
                    <img 
                      src={item.croppedImage} 
                      alt="Cropped product" 
                      className="max-w-full h-auto max-h-64 mx-auto block"
                    />
                    {/* Cropped button in bottom left */}
                    <button
                      className="absolute bottom-2 left-2 px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors shadow-md"
                      title="This is a cropped product image"
                    >
                      Cropped
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Product detected and cropped from screenshot
                </p>
              </div>
            )}
            
            {/* Original Screenshot Reference - Show if no cropped, or if toggled on */}
            {screenshot && (!hasCroppedImage || showOriginalScreenshot) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {item.croppedImage ? "Original Screenshot Reference" : "Screenshot Reference"}
                </label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
                  <img 
                    src={screenshot.base64} 
                    alt="Original screenshot" 
                    className="max-w-full h-auto max-h-64 mx-auto block"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {item.croppedImage 
                    ? "Full screenshot for context" 
                    : "Use this screenshot to verify the correct product name and quantity"}
                </p>
              </div>
            )}

            {/* Toggle button to show/hide original screenshot (only if cropped exists) */}
            {hasCroppedImage && hasOriginalScreenshot && (
              <button
                onClick={() => setShowOriginalScreenshot(!showOriginalScreenshot)}
                className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {showOriginalScreenshot ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Hide Original Screenshot
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Show Original Screenshot
                  </>
                )}
              </button>
            )}
          </div>
        )}

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
                return (
                  <div
                    key={product.productId}
                    onClick={() => setSelectedProduct(product)}
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {product.items?.[0]?.size && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {product.items[0].size}
                            </p>
                          )}
                          {product.items?.[0]?.price?.regular && (
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              ${product.items[0].price.regular.toFixed(2)}
                            </p>
                          )}
                        </div>
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

// Screenshot Upload Modal Component
function ScreenshotUploadModal({
  locationId,
  shoppingListId,
  isOpen,
  onClose,
  onItemsAdded,
}: {
  locationId: string;
  shoppingListId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemsAdded: () => void;
}) {
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use shared screenshot processing hook
  const {
    uploading,
    setUploading,
    processingComplete,
    setProcessingComplete,
    processScreenshots,
    cropItems,
  } = useScreenshotProcessing({
    locationId,
    selectedApp,
    selectedCustomers,
    onProgress: setUploadProgress,
    onError: setError,
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedApp("");
      setSelectedCustomers([]);
      setUploading(false);
      setUploadProgress("");
      setError(null);
      setProcessingComplete(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [isOpen, setUploading, setProcessingComplete]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate app selection is mandatory
    if (!selectedApp || selectedApp.trim() === "") {
      setError("Please select an app (Instacart or DoorDash) before uploading screenshots.");
      return;
    }

    // Validate customer selection is mandatory
    if (selectedCustomers.length === 0) {
      setError("Please select at least one customer (A, B, C, or D) before uploading screenshots.");
      return;
    }

    setUploading(true);
    setError(null);
    setProcessingComplete(false);
    setUploadProgress(`Processing 1 of ${files.length} screenshots...`);

    try {
      // Process screenshots using shared hook
      const screenshotData = await processScreenshots(files);

      console.log("📊 Screenshot processing complete:", {
        totalScreenshots: files.length,
        screenshotsWithItems: screenshotData.length,
        totalItems: screenshotData.reduce((sum, s) => sum + s.items.length, 0),
      });

      if (screenshotData.length === 0) {
        console.warn("⚠️ No items found in any screenshots");
        setError("No products found in any of the screenshots");
        setUploading(false);
        return;
      }

      // Save items to shopping list
      for (const screenshotInfo of screenshotData) {
        setUploadProgress(`Saving items from screenshot ${screenshotInfo.screenshotId}...`);
        const addResponse = await fetch(`/api/shopping-lists/${shoppingListId}/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: screenshotInfo.items,
            screenshotId: screenshotInfo.screenshotId,
            screenshot: screenshotInfo.screenshot,
            app: selectedApp,
            customers: selectedCustomers,
          }),
        });

        if (!addResponse.ok) {
          const errorData = await addResponse.json().catch(() => ({ error: "Failed to add items" }));
          throw new Error(errorData.error || `Failed to add items from screenshot`);
        }

        console.log(`✅ Saved ${screenshotInfo.items.length} items from screenshot`, {
          screenshotId: screenshotInfo.screenshotId,
          itemNames: screenshotInfo.items.map((item: any) => item.productName),
        });
      }

      console.log("🚀 Starting moondream cropping process...", {
        screenshotDataCount: screenshotData.length,
        totalScreenshotItems: screenshotData.reduce((sum, s) => sum + s.items.length, 0),
      });

      // Crop items using shared hook
      await cropItems(shoppingListId, screenshotData);

      // Refresh the list when processing completes
      console.log("✅ All processing complete - refreshing list");
      setProcessingComplete(true);
      setUploadProgress("✅ All items processed and cropped! Refreshing list...");
      // Refresh the shopping list to show new items and cropped images
      onItemsAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process screenshots");
      // Don't close modal on error either - let user see the error
    } finally {
      setUploading(false);
      // Keep progress message visible instead of clearing it
      // setUploadProgress("");
    }
  };

  // Allow closing the modal - refresh list when closing
  const handleClose = () => {
    // If processing is complete, refresh the list before closing
    if (processingComplete) {
      console.log("✅ Processing complete, refreshing list and closing modal");
      onItemsAdded(); // Refresh the shopping list
    } else if (!uploading) {
      // Allow canceling if not currently uploading
      console.log("✅ Canceling - refreshing list and closing modal");
      onItemsAdded(); // Refresh the shopping list in case any items were added
    } else {
      // During active upload, still allow canceling but warn user
      console.log("⚠️ Closing modal during upload - items may still be processing");
      // Don't refresh yet - let background processing continue
    }
    onClose();
  };

  // Only prevent close during active upload, allow closing otherwise
  const shouldPreventClose = uploading;
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Screenshot" preventClose={shouldPreventClose}>
      <div className="space-y-4">
        {/* App Selector - Mandatory */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            App <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="radio"
              name="app-selector-screenshot"
              id="app-instacart-screenshot"
              value="Instacart"
              checked={selectedApp === "Instacart"}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="hidden"
            />
            <label
              htmlFor="app-instacart-screenshot"
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors text-center ${
                selectedApp === "Instacart"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Instacart
            </label>
            
            <input
              type="radio"
              name="app-selector-screenshot"
              id="app-doordash-screenshot"
              value="DoorDash"
              checked={selectedApp === "DoorDash"}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="hidden"
            />
            <label
              htmlFor="app-doordash-screenshot"
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors text-center ${
                selectedApp === "DoorDash"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              DoorDash
            </label>
          </div>
        </div>

        {/* Customer Selection - Mandatory */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Customers <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {["A", "B", "C", "D"].map((customer) => {
              const customerIndex = customer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
              const isSelected = selectedCustomers.includes(customer);
              
              return (
                <button
                  key={customer}
                  type="button"
                  onClick={() => {
                    const customers = ["A", "B", "C", "D"];
                    // Cascading selection: selecting D selects A,B,C,D, selecting B selects A,B, etc.
                    const newSelection = customers.slice(0, customerIndex + 1);
                    setSelectedCustomers(newSelection);
                    setError(null); // Clear error when customer is selected
                  }}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {customer}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {selectedCustomers.length === 0
              ? "Select which customers you have (selecting D selects A, B, C, and D)"
              : `Selected: ${selectedCustomers.join(", ")}`}
          </p>
        </div>

        {/* File Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Screenshots
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={uploading || !selectedApp || selectedCustomers.length === 0}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {!selectedApp 
              ? "Please select an app first" 
              : selectedCustomers.length === 0
              ? "Please select customers first"
              : "You can select multiple images at once"}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {uploadProgress && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-600 dark:text-blue-400">{uploadProgress}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processingComplete ? "Close" : uploading ? "Processing..." : "Cancel"}
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
}: {
  locationId: string;
  shoppingListId: string;
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: () => void;
}) {
  const [productName, setProductName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KrogerProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<KrogerProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customer, setCustomer] = useState("A");
  const [quantity, setQuantity] = useState("1");
  const [selectedApp, setSelectedApp] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setProductName("");
      setSearchResults([]);
      setSelectedProduct(null);
      setSearchError(null);
      setCustomer("A");
      setQuantity("1");
      setSelectedApp(""); // Reset app selection - user must select
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
        app: selectedApp,
        productId: selectedProduct.productId,
        upc: selectedProduct.upc || krogerItem?.itemId,
        brand: selectedProduct.brand,
        description: selectedProduct.description,
        size: krogerItem?.size,
        price: krogerItem?.price?.regular ?? krogerItem?.nationalPrice?.regular,
        promoPrice: krogerItem?.price?.promo ?? krogerItem?.nationalPrice?.promo,
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
        {/* App Selector - Mandatory */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            App <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="radio"
              name="app-selector-manual"
              id="app-instacart-manual"
              value="Instacart"
              checked={selectedApp === "Instacart"}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="hidden"
            />
            <label
              htmlFor="app-instacart-manual"
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors text-center ${
                selectedApp === "Instacart"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Instacart
            </label>
            
            <input
              type="radio"
              name="app-selector-manual"
              id="app-doordash-manual"
              value="DoorDash"
              checked={selectedApp === "DoorDash"}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="hidden"
            />
            <label
              htmlFor="app-doordash-manual"
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors text-center ${
                selectedApp === "DoorDash"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              DoorDash
            </label>
          </div>
        </div>

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
                return (
                  <div
                    key={product.productId}
                    onClick={() => setSelectedProduct(product)}
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {product.items?.[0]?.size && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {product.items[0].size}
                            </p>
                          )}
                          {product.items?.[0]?.price?.regular && (
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              ${product.items[0].price.regular.toFixed(2)}
                            </p>
                          )}
                        </div>
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
  onScan,
  shoppingList,
  onViewScreenshot,
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
  onScan?: () => void;
  shoppingList?: ShoppingList | null;
  onViewScreenshot?: (screenshot: { base64: string; item: ShoppingListItem; itemIndex: number }) => void;
}) {
  const [productDetails, setProductDetails] = useState<KrogerProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showJson, setShowJson] = useState(false);

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

  // Check cropped image height for modal
  const modalItemId = `modal-item-${item.productId || Math.random()}`;
  const [modalImageHeight, setModalImageHeight] = useState<number | null>(null);
  
  useEffect(() => {
    if (item.croppedImage && !modalImageHeight) {
      const img = document.createElement('img') as HTMLImageElement;
      img.onload = () => {
        setModalImageHeight(img.naturalHeight);
      };
      img.src = item.croppedImage;
    }
  }, [item.croppedImage, modalImageHeight]);

  const isModalImageTooSmall = modalImageHeight !== null && modalImageHeight < 300;
  
  // Find screenshot if item has screenshotId
  const screenshot = item.screenshotId && shoppingList?.screenshots 
    ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
    : null;

  const handleScreenshotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (screenshot && onViewScreenshot) {
      // Find the item index in the shopping list
      const itemIndex = shoppingList?.items.findIndex(i => 
        i.productName === item.productName && 
        i.customer === item.customer && 
        i.app === item.app
      ) ?? 0;
      onViewScreenshot({ base64: screenshot.base64, item, itemIndex });
    }
  };

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
            {/* Cropped Image at Top - Larger version */}
            {item.croppedImage ? (
              <div className="w-full bg-white dark:bg-gray-50 border border-gray-200 dark:border-gray-300 rounded-lg overflow-hidden mb-4 relative">
                {/* Image Too Small Indicator Badge */}
                {isModalImageTooSmall && (
                  <div className="absolute top-2 right-2 z-10">
                    <div className="px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Image may be cut off
                    </div>
                  </div>
                )}
                {/* AI Detected Cropped Image Badge */}
                {item.aiDetectedCroppedImage && (
                  <div className="absolute top-2 right-2 z-10" style={{ top: isModalImageTooSmall ? '3.5rem' : '0.5rem' }}>
                    <div className="px-2 py-1 bg-purple-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      AI: Image cropped off
                    </div>
                  </div>
                )}
                {/* Original Screenshot Thumbnail - Top right */}
                {screenshot && (
                  <button
                    onClick={handleScreenshotClick}
                    className="absolute top-2 right-2 z-10 w-16 h-16 rounded-lg border-2 border-white dark:border-gray-800 shadow-lg hover:scale-105 transition-transform overflow-hidden bg-white dark:bg-gray-800"
                    style={{ top: isModalImageTooSmall ? '3.5rem' : '0.5rem' }}
                    title="View original screenshot"
                  >
                    <img
                      src={screenshot.base64}
                      alt="Original screenshot"
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
                <img
                  src={item.croppedImage}
                  alt={item.found && item.description ? item.description : item.productName}
                  className="w-full h-auto max-h-96 object-contain mx-auto block"
                />
              </div>
            ) : item.screenshotId ? (
              <div className="w-full bg-gray-100 dark:bg-gray-200 border border-gray-200 dark:border-gray-300 rounded-lg overflow-hidden mb-4 py-3 px-4 relative">
                {/* Missing Cropped Image Indicator Badge */}
                <div className="absolute top-2 left-2 z-10">
                  <div className="px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    No cropped image
                  </div>
                </div>
                {/* Original Screenshot Thumbnail - Top right */}
                {screenshot && (
                  <button
                    onClick={handleScreenshotClick}
                    className="absolute top-2 right-2 z-10 w-16 h-16 rounded-lg border-2 border-white dark:border-gray-800 shadow-lg hover:scale-105 transition-transform overflow-hidden bg-white dark:bg-gray-800"
                    title="View original screenshot"
                  >
                    <img
                      src={screenshot.base64}
                      alt="Original screenshot"
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-800">
                    No cropped image available
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-700 mt-1">
                    Cropping was not successful
                  </p>
                </div>
              </div>
            ) : null}

            {/* Info Card Layout - Similar to List View */}
            <div className="bg-white dark:bg-gray-100 rounded-lg border border-gray-200 dark:border-gray-300 p-4 relative overflow-visible">
              {/* Customer Badge - Positioned to the top left */}
              <div className="absolute top-2 left-2 z-20" style={{ pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto' }}>
                  <CustomerBadge customer={item.customer} app={item.app} />
                </div>
              </div>
              <div className="flex gap-4">
                {/* Product Image - Positioned to the left */}
                <div className="relative flex-shrink-0">
                  {imageUrl ? (
                    <div className="relative w-24 h-24 bg-white rounded-lg overflow-visible shadow-sm border border-gray-100 dark:border-gray-600">
                      <Image
                        src={imageUrl}
                        alt={item.found && item.description ? item.description : item.productName}
                        fill
                        className="object-contain p-2"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600 overflow-visible">
                      <ShoppingCart className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="flex-1 min-w-0">
                  {/* Quantity + Product Name */}
                  <p className="text-gray-900 dark:text-gray-900 leading-snug break-words mb-2">
                    {item.found && item.description ? (
                      <>
                        <span className="font-bold text-lg">{item.quantity || "?? ct"} </span>
                        <span className="text-base">{item.description}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-lg">{item.quantity || "?? ct"}</span>{" "}
                        <span className="text-base">{item.productName}</span>
                      </>
                    )}
                  </p>

                  {/* Size • Price • Stock Level */}
                  {item.found && (
                    <p className="text-sm text-gray-600 dark:text-gray-700 mb-1 flex items-center gap-1 flex-wrap">
                      <span>
                        {item.size}
                        {item.size && (item.price || item.promoPrice) && " • "}
                        {item.promoPrice ? (
                          <span className="text-gray-600 dark:text-gray-700">
                            {formatPrice(item.promoPrice)}
                          </span>
                        ) : item.price ? (
                          <span>{formatPrice(item.price)}</span>
                        ) : null}
                      </span>
                      {/* Stock Level Indicator */}
                      {item.stockLevel && (
                        <>
                          {(item.size || item.price || item.promoPrice) && (
                            <span className="text-gray-600 dark:text-gray-700">•</span>
                          )}
                          <span className={item.stockLevel === "HIGH" ? "text-green-600 dark:text-green-400" : item.stockLevel === "LOW" ? "text-yellow-600 dark:text-yellow-400" : item.stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "text-red-600 dark:text-red-400" : ""}>
                            {item.stockLevel === "HIGH" ? "✓ In Stock" : item.stockLevel === "LOW" ? "⚠ Low Stock" : item.stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "✗ Out of Stock" : ""}
                          </span>
                        </>
                      )}
                    </p>
                  )}

                  {/* Compact Aisle Locations */}
                  {item.found && item.krogerAisles && item.krogerAisles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-700 mb-1">
                        📍 Store Locations
                      </p>
                      {item.krogerAisles.map((aisle, idx) => {
                        const locationParts: string[] = [];
                        
                        if (aisle.aisleNumber && parseInt(aisle.aisleNumber) < 100) {
                          locationParts.push(`Aisle ${aisle.aisleNumber}`);
                        } else if (aisle.description) {
                          locationParts.push(aisle.description);
                        }
                        
                        if (aisle.shelfNumber) {
                          locationParts.push(`Shelf ${aisle.shelfNumber}`);
                        }
                        
                        if (aisle.side) {
                          locationParts.push(`Side ${aisle.side}`);
                        }
                        
                        if (aisle.bayNumber) {
                          locationParts.push(`Bay ${aisle.bayNumber}`);
                        }
                        
                        const locationText = locationParts.join(" - ");
                        
                        return locationText ? (
                          <p key={idx} className="text-xs text-gray-600 dark:text-gray-700">
                            {locationText}
                          </p>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons Section */}
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              {/* Primary Actions Row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Scan Barcode Button */}
                {onScan && item.upc && (
                  <button
                    onClick={() => {
                      onScan();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Scan className="w-5 h-5" />
                    Scan Barcode
                  </button>
                )}

                {/* View JSON Data Button */}
                <button
                  onClick={() => setShowJson(true)}
                  disabled={!productDetails}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Code className="w-5 h-5" />
                  View JSON
                </button>
              </div>

              {/* UPC Display - Always visible if available */}
              {upc && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Barcode className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">UPC</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {normalizedUpc?.code || upc}
                  </p>
                  {normalizedUpc && normalizedUpc.code !== upc.replace(/\D/g, "") && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Original: {upc} (check digit corrected)
                    </p>
                  )}
                  {normalizedUpc && (
                    <button
                      onClick={() => setShowBarcode(!showBarcode)}
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showBarcode ? "Hide" : "Show"} Barcode Image
                    </button>
                  )}
                </div>
              )}

              {/* Barcode Image Display */}
              {showBarcode && upc && normalizedUpc && getBarcodeUrl(upc) && (
                <div className="text-center bg-white dark:bg-gray-100 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <img
                    src={getBarcodeUrl(upc)!}
                    alt={`Barcode for ${normalizedUpc.code}`}
                    className="mx-auto max-w-full"
                  />
                </div>
              )}

              {/* JSON Viewer Modal */}
              {productDetails && (
                <JsonViewerModal
                  data={productDetails}
                  title={`Product JSON: ${productDetails.description || item.productName}`}
                  isOpen={showJson}
                  onClose={() => setShowJson(false)}
                />
              )}

              {/* Secondary Actions Row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Edit Button */}
                {onEdit && (
                  <button
                    onClick={() => {
                      onEdit();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Edit className="w-5 h-5" />
                    Edit
                  </button>
                )}

                {/* Status Change Buttons */}
                {onMoveToTodo && (item.done || item.problem) && (
                  <button
                    onClick={() => {
                      onMoveToTodo();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Check className="w-5 h-5" />
                    Todo
                  </button>
                )}
                {onMoveToProblem && !item.problem && (
                  <button
                    onClick={() => {
                      onMoveToProblem();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    Problem
                  </button>
                )}
                {onMoveToDone && !item.done && (
                  <button
                    onClick={() => {
                      onMoveToDone();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Check className="w-5 h-5" />
                    Done
                  </button>
                )}
              </div>
              
              {/* Delete Button - Full width, separated */}
              {onDelete && (
                <button
                  onClick={() => {
                    if (confirm("Delete this item?")) {
                      onDelete();
                      onClose();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  Delete
                </button>
              )}
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
  shoppingList,
}: {
  isOpen: boolean;
  onClose: () => void;
  shoppingListId: string;
  locationId: string;
  onItemUpdated: () => void;
  shoppingList?: ShoppingList | null;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [matchingItems, setMatchingItems] = useState<ShoppingListItem[]>([]);
  const [allItems, setAllItems] = useState<ShoppingListItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);

  // Load all items when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadAllItems = async () => {
        try {
          const response = await fetch(`/api/shopping-lists/${shoppingListId}`);
          if (response.ok) {
            const data = await response.json();
            // Show all items initially, not just done items
            setAllItems(data.items || []);
            setMatchingItems(data.items || []);
          }
        } catch (err) {
          console.error("Failed to load items:", err);
        }
      };
      loadAllItems();
    } else {
      setSearchTerm("");
      setScanning(false);
      setScannedBarcode("");
      setMatchingItems([]);
      setAllItems([]);
      // Cleanup video stream
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [isOpen, shoppingListId]);

  // Start barcode scanner when scanning state becomes true
  useEffect(() => {
    if (!scanning || !isOpen) {
      // Cleanup when stopping
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      frameCountRef.current = 0;
      return;
    }

    const codeReader = new BrowserMultiFormatReader(createBarcodeHints());
    codeReaderRef.current = codeReader;

    const videoElement = videoRef.current;
    if (!videoElement) {
      console.error("Video element not found");
      setScanning(false);
      return;
    }

    let isScanning = true;

    // Get media stream with optimized constraints
    navigator.mediaDevices
      .getUserMedia(createCameraConstraints())
      .then((stream) => {
        videoElement.srcObject = stream;
        return videoElement.play();
      })
      .then(() => {
        // Custom scanning loop with downsampling and throttling
        const scanFrame = () => {
          if (!isScanning || !videoElement.srcObject) {
            return;
          }

          frameCountRef.current++;
          
          // Throttle: only process every Nth frame
          if (frameCountRef.current % SCAN_THROTTLE_FRAMES === 0) {
            // Create downsampled canvas from video frame
            const canvas = createDownsampledCanvas(
              videoElement,
              DOWNSAMPLE_WIDTH,
              DOWNSAMPLE_HEIGHT
            );

            if (canvas) {
              try {
                // Decode from downsampled canvas
                const result = codeReader.decodeFromCanvas(canvas);
                
                if (result && isScanning) {
                  isScanning = false;
                  const scannedCode = result.getText();
                  setScannedBarcode(scannedCode);
                  setSearchTerm(""); // Clear search term when barcode is scanned

                  // Stop video stream
                  if (videoElement.srcObject) {
                    const stream = videoElement.srcObject as MediaStream;
                    stream.getTracks().forEach(track => track.stop());
                    videoElement.srcObject = null;
                  }
                  if (animationFrameRef.current !== null) {
                    cancelAnimationFrame(animationFrameRef.current);
                    animationFrameRef.current = null;
                  }
                  setScanning(false);
                }
              } catch (error: any) {
                // NotFoundException is expected when no barcode is found
                if (error && error.name !== "NotFoundException") {
                  console.error("Scan error:", error);
                }
              }
            }
          }

          // Continue scanning loop
          if (isScanning && videoElement.srcObject) {
            animationFrameRef.current = requestAnimationFrame(scanFrame);
          }
        };

        // Start scanning loop
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      })
      .catch((err) => {
        console.error("Failed to start camera:", err);
        setScanning(false);
      });

    // Cleanup function
    return () => {
      isScanning = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      frameCountRef.current = 0;
      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
    };
  }, [scanning, isOpen, shoppingListId]);

  // Filter items when search term or scanned barcode changes
  useEffect(() => {
    // If barcode was scanned, use that for filtering
    if (scannedBarcode) {
      const scannedDigits = scannedBarcode.replace(/\D/g, ""); // Extract digits from scanned code
      const matches = allItems.filter((item: ShoppingListItem) => {
        if (!item.upc) return false;
        const itemUpcDigits = item.upc.replace(/\D/g, ""); // Extract digits from item UPC
        // Allow partial matching - check if scanned digits are contained in item UPC or vice versa
        return itemUpcDigits.includes(scannedDigits) || scannedDigits.includes(itemUpcDigits) || barcodesMatch(scannedBarcode, item.upc);
      });
      setMatchingItems(matches);
      return;
    }
    
    const trimmedSearch = searchTerm.trim();
    
    // If search is empty, show all items
    if (!trimmedSearch) {
      setMatchingItems(allItems);
      return;
    }
    
    // Allow any number of digits for UPC search, otherwise require at least 3 characters
    const isNumericOnly = /^\d+$/.test(trimmedSearch);
    if (!isNumericOnly && trimmedSearch.length < 3) {
      setMatchingItems([]);
      return;
    }

    setSearching(true);
    
    // Search through all items by product name, description, or UPC
    // Use partial matching - any digit or substring match
    const searchLower = trimmedSearch.toLowerCase();
    const matches = allItems.filter((item: ShoppingListItem) => {
      const productName = (item.productName || "").toLowerCase();
      const description = (item.description || "").toLowerCase();
      const upc = (item.upc || "").replace(/\D/g, ""); // Remove non-digits from UPC for comparison
      const searchTerm = (item.searchTerm || "").toLowerCase();
      const searchDigits = trimmedSearch.replace(/\D/g, ""); // Extract digits from search term
      
      // For numeric searches, check if UPC contains the digits
      if (isNumericOnly && searchDigits.length > 0) {
        if (upc.includes(searchDigits)) {
          return true;
        }
      }
      
      // Also check text fields for partial matches
      return productName.includes(searchLower) ||
             description.includes(searchLower) ||
             searchTerm.includes(searchLower) ||
             (upc && upc.includes(searchDigits)); // Also check UPC for digit matches
    });
    
    setMatchingItems(matches);
    setSearching(false);
  }, [searchTerm, scannedBarcode, allItems]);

  const handleSearch = () => {
    // Search is now handled by useEffect when searchTerm changes
    // This function is kept for the button click handler
  };

  const handleBarcodeScan = () => {
    setScannedBarcode("");
    setSearchTerm(""); // Clear search term when scanning
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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setScannedBarcode(""); // Clear scanned barcode when typing
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Type to filter items (any digits for UPC, or product name)..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setScannedBarcode("");
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                title="Clear search"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
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
                  style={{ aspectRatio: "16/9" }}
                  muted
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-green-500 rounded-lg w-4/5 h-1/4" />
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
              {searchTerm || scannedBarcode ? `Matching Items (${matchingItems.length})` : `All Items (${matchingItems.length})`}
            </label>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {matchingItems.map((item, idx) => {
                const customer = item.customer || "A";
                const customerBgColor = customerColors[customer] || customerColors.A;
                const appColor = getAppTagColorForBadge(item.app);
                
                // Get product image - prefer imageUrl (Kroger product image), then screenshot, then cropped image
                const screenshot = item.screenshotId && shoppingList?.screenshots 
                  ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
                  : null;
                const productImage = item.imageUrl || screenshot?.base64 || item.croppedImage;
                
                return (
                  <div
                    key={idx}
                    className="w-full p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex gap-4"
                  >
                    {/* Product Image */}
                    {productImage && (
                      <div className="flex-shrink-0 w-24 h-24 bg-white dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                        <img
                          src={productImage}
                          alt={item.description || item.productName}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    
                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {matchingItems.length === 0 && (searchTerm || scannedBarcode) && !searching && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            <p>No matching items found</p>
          </div>
        )}
        
        {matchingItems.length === 0 && !searchTerm && !scannedBarcode && allItems.length > 0 && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            <p>Type to search or scan a barcode to filter items</p>
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
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
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
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      frameCountRef.current = 0;
      setScannedCode("");
      setManualUPC("");
      return;
    }

    const codeReader = new BrowserMultiFormatReader(createBarcodeHints());
    codeReaderRef.current = codeReader;

    const videoElement = videoRef.current;
    if (!videoElement) {
      setError("No video element found.");
      return;
    }

    let scanning = true;

    // Get media stream with optimized constraints
    navigator.mediaDevices
      .getUserMedia(createCameraConstraints())
      .then((stream) => {
        videoElement.srcObject = stream;
        return videoElement.play();
      })
      .then(() => {
        // Custom scanning loop with downsampling and throttling
        const scanFrame = () => {
          if (!scanning || !videoElement.srcObject) {
            return;
          }

          frameCountRef.current++;
          
          // Throttle: only process every Nth frame
          if (frameCountRef.current % SCAN_THROTTLE_FRAMES === 0) {
            // Create downsampled canvas from video frame
            const canvas = createDownsampledCanvas(
              videoElement,
              DOWNSAMPLE_WIDTH,
              DOWNSAMPLE_HEIGHT
            );

            if (canvas) {
              try {
                // Decode from downsampled canvas
                const result = codeReader.decodeFromCanvas(canvas);
                
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
                      if (animationFrameRef.current !== null) {
                        cancelAnimationFrame(animationFrameRef.current);
                        animationFrameRef.current = null;
                      }
                      onScan(scannedCode);
                    }
                  }, 1000);
                }
              } catch (error: any) {
                // NotFoundException is expected when no barcode is found
                if (error && error.name !== "NotFoundException") {
                  console.error("Scan error:", error);
                }
              }
            }
          }

          // Continue scanning loop
          if (scanning && videoElement.srcObject) {
            animationFrameRef.current = requestAnimationFrame(scanFrame);
          }
        };

        // Start scanning loop
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      })
      .catch((err) => {
        console.error("Failed to start camera:", err);
        setError(String(err));
      });

    // Cleanup on unmount
    return () => {
      scanning = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      frameCountRef.current = 0;
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
            style={{ aspectRatio: "16/9" }}
            muted
            playsInline
          />
          {/* Scanning overlay - wide horizontal area for barcode scanning */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-blue-500 rounded-lg w-4/5 h-1/4" />
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
              Override
            </button>
          )}
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
  shoppingList,
}: {
  isOpen: boolean;
  onClose: () => void;
  success: boolean;
  item: ShoppingListItem;
  scannedBarcode?: string;
  onForceDone?: () => void;
  onConfirmQuantity?: () => void;
  shoppingList?: ShoppingList | null;
}) {
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);
  const [showOriginalScreenshot, setShowOriginalScreenshot] = useState(false);
  const customer = item.customer || "A";
  const app = item.app || "";
  
  // Get customer color
  const customerColorMap: Record<string, { bg: string; text: string; border: string }> = {
    A: { bg: "bg-orange-500", text: "text-white", border: "border-orange-600" },
    B: { bg: "bg-blue-500", text: "text-white", border: "border-blue-600" },
    C: { bg: "bg-green-500", text: "text-white", border: "border-green-600" },
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

  // Get app badge colors (matching list view)
  const appBadgeColors = getAppTagColorForBadge(app);

  // Play audio feedback when modal opens
  useEffect(() => {
    if (isOpen) {
      if (success) {
        playSuccessSound();
      } else {
        playFailureSound();
      }
      // Reset showOriginalScreenshot when modal opens
      setShowOriginalScreenshot(false);
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
              <div className={`inline-block px-6 py-3 rounded-lg ${appBadgeColors.bg} ${appBadgeColors.text}`}>
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
          </div>

          {/* Image Display (only for successful scans) */}
          {success && (item.croppedImage || (item.screenshotId && shoppingList?.screenshots)) && (() => {
            const screenshot = item.screenshotId && shoppingList?.screenshots 
              ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
              : null;
            const hasCroppedImage = !!item.croppedImage;
            // Always show cropped image inline if available, otherwise show full screenshot
            const imageToShow = hasCroppedImage ? item.croppedImage : screenshot?.base64;
            
            return (
              <div className="pt-4 border-t border-white/30">
                <div className="space-y-3">
                  {/* Show Full Screenshot button - only show if cropped image exists */}
                  {hasCroppedImage && screenshot && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowOriginalScreenshot(true);
                        setViewingScreenshot(screenshot.base64);
                      }}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg border-2 border-white/30 hover:bg-white/30 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      Show Full Screenshot
                    </button>
                  )}
                  
                  {/* Image Display - Always show cropped image if available, otherwise full screenshot */}
                  {imageToShow && (
                    <div className="rounded-lg overflow-hidden bg-white/10 backdrop-blur-sm border-2 border-white/20">
                      <img 
                        src={imageToShow} 
                        alt={hasCroppedImage ? "Cropped product image" : "Original screenshot"} 
                        className="w-full h-auto max-h-64 object-contain mx-auto block"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

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
                Confirm QTY from Screenshot
              </button>
            ) : (
              <button
                onClick={onClose}
                className={`px-6 py-4 bg-white/20 backdrop-blur-sm rounded-lg border-2 border-white/30 hover:bg-white/30 transition-colors font-semibold text-lg ${!success && onForceDone ? "flex-1" : "w-full"}`}
              >
                {success ? "Confirm QTY from Screenshot" : "Try Again"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Screenshot Viewer Modal */}
      {viewingScreenshot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setViewingScreenshot(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {item.croppedImage && !showOriginalScreenshot ? "Cropped Product Image" : "Original Screenshot"}
              </h3>
              <div className="flex items-center gap-2">
                {/* Toggle Original Screenshot - Only show if cropped image exists */}
                {item.croppedImage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOriginalScreenshot(!showOriginalScreenshot);
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={showOriginalScreenshot ? "Show cropped image" : "Show original screenshot"}
                  >
                    {showOriginalScreenshot ? (
                      <EyeOff className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <Eye className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => {
                    setViewingScreenshot(null);
                    setShowOriginalScreenshot(false);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4 flex justify-center">
              <div className="relative max-w-full">
                <img 
                  src={item.croppedImage && !showOriginalScreenshot ? item.croppedImage : viewingScreenshot} 
                  alt={item.croppedImage && !showOriginalScreenshot ? "Cropped product image" : "Original screenshot"} 
                  className="max-w-full h-auto rounded-lg block"
                  style={{ maxHeight: 'calc(90vh - 100px)' }}
                />
                {/* Highlight overlay for moondream detection area - only show on original screenshot */}
                {showOriginalScreenshot && item.boundingBox && viewingScreenshot && (() => {
                  const bbox = item.boundingBox;
                  return (
                    <>
                      {/* Dark overlay covering entire image with cutout for highlighted area */}
                      <div
                        className="absolute inset-0 bg-black/50 rounded-lg pointer-events-none"
                        style={{
                          clipPath: `polygon(
                            0% 0%,
                            0% 100%,
                            ${bbox.xMin * 100}% 100%,
                            ${bbox.xMin * 100}% ${bbox.yMin * 100}%,
                            ${bbox.xMax * 100}% ${bbox.yMin * 100}%,
                            ${bbox.xMax * 100}% ${bbox.yMax * 100}%,
                            ${bbox.xMin * 100}% ${bbox.yMax * 100}%,
                            ${bbox.xMin * 100}% 100%,
                            100% 100%,
                            100% 0%
                          )`,
                        }}
                      />
                      {/* Highlight box for detected area - border and glow only, no background */}
                      <div
                        className="absolute border-4 border-yellow-400 rounded-lg pointer-events-none z-10 shadow-[0_0_30px_rgba(250,204,21,1)]"
                        style={{
                          left: `${bbox.xMin * 100}%`,
                          top: `${bbox.yMin * 100}%`,
                          width: `${(bbox.xMax - bbox.xMin) * 100}%`,
                          height: `${(bbox.yMax - bbox.yMin) * 100}%`,
                        }}
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Auto Split Algorithm
interface AisleGroup {
  aisleNumber: string;
  itemIndices: number[];
  description?: string;
}

interface UserSplit {
  userId: string;
  aisleGroups: AisleGroup[];
}

type SplitMode = 'round-robin' | 'per-item-evenly' | 'aisles-sequential';

function calculateAutoSplit(
  items: ShoppingListItem[],
  selectedUserIds: string[],
  currentUserId: string,
  sharedItemIndices: number[],
  mode: SplitMode = 'round-robin'
): UserSplit[] {
  // Helper to get primary aisle info
  const getPrimaryAisle = (item: ShoppingListItem) => {
    const aisles = item.krogerAisles;
    if (!aisles || aisles.length === 0) return undefined;
    
    return aisles.reduce((smallest, current) => {
      const smallestNum = parseInt(smallest?.aisleNumber || "999") || 999;
      const currentNum = parseInt(current?.aisleNumber || "999") || 999;
      return currentNum < smallestNum ? current : smallest;
    });
  };

  // Filter out already shared items
  const nonSharedItems = items
    .map((item, index) => ({ item, originalIndex: index }))
    .filter(({ originalIndex }) => !sharedItemIndices.includes(originalIndex));

  // Group items by aisle
  const aisleMap = new Map<string, { itemIndices: number[]; description?: string }>();
  const unknownLocationIndices: number[] = [];

  nonSharedItems.forEach(({ item, originalIndex }) => {
    const primaryAisle = getPrimaryAisle(item);
    const aisleNumber = primaryAisle?.aisleNumber || "";
    
    if (!aisleNumber) {
      unknownLocationIndices.push(originalIndex);
    } else {
      if (!aisleMap.has(aisleNumber)) {
        aisleMap.set(aisleNumber, {
          itemIndices: [],
          description: primaryAisle?.description,
        });
      }
      aisleMap.get(aisleNumber)!.itemIndices.push(originalIndex);
    }
  });

  // Convert map to array and sort by aisle number
  const aisleGroups: AisleGroup[] = Array.from(aisleMap.entries())
    .map(([aisleNumber, data]) => ({
      aisleNumber,
      itemIndices: data.itemIndices,
      description: data.description,
    }))
    .sort((a, b) => {
      const numA = parseInt(a.aisleNumber) || 999;
      const numB = parseInt(b.aisleNumber) || 999;
      return numA - numB;
    });

  // Add unknown location as a group if there are items
  if (unknownLocationIndices.length > 0) {
    aisleGroups.push({
      aisleNumber: "",
      itemIndices: unknownLocationIndices,
    });
  }

  // Create user list: main user first, then selected users
  const allUserIds = [currentUserId, ...selectedUserIds];
  
  // Initialize user splits
  const userSplits: UserSplit[] = allUserIds.map(userId => ({
    userId,
    aisleGroups: [],
  }));

  if (mode === 'round-robin') {
    // Round Robin: Distribute aisles round-robin
    aisleGroups.forEach((aisleGroup, index) => {
      const userIndex = index % allUserIds.length;
      userSplits[userIndex].aisleGroups.push(aisleGroup);
    });
  } else if (mode === 'per-item-evenly') {
    // Per Item Evenly: Flatten items, distribute evenly, regroup by aisle per user
    const allItemIndices: { index: number; aisleNumber: string; description?: string }[] = [];
    
    aisleGroups.forEach(group => {
      group.itemIndices.forEach(itemIndex => {
        allItemIndices.push({
          index: itemIndex,
          aisleNumber: group.aisleNumber,
          description: group.description,
        });
      });
    });

    // Distribute items evenly across users
    const userItemMap = new Map<string, Map<string, { itemIndices: number[]; description?: string }>>();
    allUserIds.forEach(userId => {
      userItemMap.set(userId, new Map());
    });

    allItemIndices.forEach((item, index) => {
      const userIndex = index % allUserIds.length;
      const userId = allUserIds[userIndex];
      const aisleMap = userItemMap.get(userId)!;
      
      if (!aisleMap.has(item.aisleNumber)) {
        aisleMap.set(item.aisleNumber, {
          itemIndices: [],
          description: item.description,
        });
      }
      aisleMap.get(item.aisleNumber)!.itemIndices.push(item.index);
    });

    // Convert back to UserSplit format
    userSplits.forEach(split => {
      const aisleMap = userItemMap.get(split.userId)!;
      const groups: AisleGroup[] = Array.from(aisleMap.entries())
        .map(([aisleNumber, data]) => ({
          aisleNumber,
          itemIndices: data.itemIndices,
          description: data.description,
        }))
        .sort((a, b) => {
          const numA = parseInt(a.aisleNumber) || 999;
          const numB = parseInt(b.aisleNumber) || 999;
          return numA - numB;
        });
      split.aisleGroups = groups;
    });
  } else if (mode === 'aisles-sequential') {
    // Aisles Sequential: Split aisles into equal parts sequentially
    const sortedAisleGroups = [...aisleGroups].sort((a, b) => {
      // Put unknown aisles at the end
      if (!a.aisleNumber) return 1;
      if (!b.aisleNumber) return -1;
      const numA = parseInt(a.aisleNumber) || 999;
      const numB = parseInt(b.aisleNumber) || 999;
      return numA - numB;
    });

    const numUsers = allUserIds.length;
    const itemsPerUser = Math.ceil(sortedAisleGroups.length / numUsers);

    sortedAisleGroups.forEach((aisleGroup, index) => {
      const userIndex = Math.min(Math.floor(index / itemsPerUser), numUsers - 1);
      userSplits[userIndex].aisleGroups.push(aisleGroup);
    });
  }

  return userSplits;
}

// Auto Split Modal Component
function AutoSplitModal({
  isOpen,
  onClose,
  shoppingList,
  selectedUserIds,
  users,
  currentUserId,
  onApplySplit,
}: {
  isOpen: boolean;
  onClose: () => void;
  shoppingList: ShoppingList | null;
  selectedUserIds: Set<string>;
  users: { userId: string; email?: string; name?: string; image?: string }[];
  currentUserId: string | undefined;
  onApplySplit: (itemIndices: Set<number>, itemUserMap?: Map<number, string>) => void;
}) {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedAisles, setExpandedAisles] = useState<Set<string>>(new Set());
  const [unselectedIndices, setUnselectedIndices] = useState<Set<number>>(new Set());
  const [userSplits, setUserSplits] = useState<UserSplit[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('round-robin');

  // Helper to get primary aisle info
  const getPrimaryAisle = (item: ShoppingListItem) => {
    const aisles = item.krogerAisles;
    if (!aisles || aisles.length === 0) return undefined;
    
    return aisles.reduce((smallest, current) => {
      const smallestNum = parseInt(smallest?.aisleNumber || "999") || 999;
      const currentNum = parseInt(current?.aisleNumber || "999") || 999;
      return currentNum < smallestNum ? current : smallest;
    });
  };

  // Calculate initial split when modal opens or mode changes
  useEffect(() => {
    if (isOpen && shoppingList && currentUserId && selectedUserIds.size > 0) {
      const sharedItemIndices = shoppingList.sharedItemIndices || [];
      const split = calculateAutoSplit(
        shoppingList.items,
        Array.from(selectedUserIds),
        currentUserId,
        sharedItemIndices,
        splitMode
      );
      setUserSplits(split);
      // Expand all users by default
      setExpandedUsers(new Set(split.map(s => s.userId)));
      setUnselectedIndices(new Set());
    } else if (isOpen) {
      // Reset state when modal opens but conditions aren't met
      setUserSplits([]);
      setExpandedUsers(new Set());
      setUnselectedIndices(new Set());
    }
  }, [isOpen, shoppingList, selectedUserIds, currentUserId, splitMode]);

  const toggleUserExpanded = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const toggleAisleExpanded = (userId: string, aisleNumber: string) => {
    const key = `${userId}-${aisleNumber}`;
    const newExpanded = new Set(expandedAisles);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedAisles(newExpanded);
  };

  const toggleItemSelection = (itemIndex: number) => {
    const newUnselected = new Set(unselectedIndices);
    if (newUnselected.has(itemIndex)) {
      newUnselected.delete(itemIndex);
    } else {
      newUnselected.add(itemIndex);
    }
    setUnselectedIndices(newUnselected);
  };

  const moveAisleToUser = (fromUserId: string, toUserId: string, aisleIndex: number) => {
    const newSplits = [...userSplits];
    const fromUserIndex = newSplits.findIndex(s => s.userId === fromUserId);
    const toUserIndex = newSplits.findIndex(s => s.userId === toUserId);
    
    if (fromUserIndex === -1 || toUserIndex === -1) return;
    
    const aisleGroup = newSplits[fromUserIndex].aisleGroups[aisleIndex];
    newSplits[fromUserIndex].aisleGroups.splice(aisleIndex, 1);
    newSplits[toUserIndex].aisleGroups.push(aisleGroup);
    
    setUserSplits(newSplits);
  };

  const getUserName = (userId: string): string => {
    if (userId === currentUserId) return "Me";
    const user = users.find(u => u.userId === userId);
    return user?.name || user?.email || userId;
  };

  const handleApplySplit = () => {
    if (!shoppingList || !currentUserId) return;
    
    // Only collect item indices assigned to selected users (exclude current user)
    // Items assigned to "Me" shouldn't be shared
    const allIndices = new Set<number>();
    const itemUserMap = new Map<number, string>();
    
    userSplits.forEach(split => {
      // Only include items from users that are selected in "Users to Share With"
      // Skip items assigned to the current user (they don't need to be shared)
      if (split.userId !== currentUserId && selectedUserIds.has(split.userId)) {
        split.aisleGroups.forEach(group => {
          group.itemIndices.forEach(index => {
            if (!unselectedIndices.has(index)) {
              allIndices.add(index);
              itemUserMap.set(index, split.userId);
            }
          });
        });
      }
    });
    
    onApplySplit(allIndices, itemUserMap);
    onClose();
  };

  if (!isOpen) return null;

  // Show error message if shopping list is not available
  if (!shoppingList) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Auto Split Preview" zIndex={10000}>
        <div className="p-4 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Shopping list is not available. Please try again.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>
    );
  }

  // Show loading state if currentUserId is not yet available
  if (!currentUserId) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Auto Split Preview" zIndex={10000}>
        <div className="p-4 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-500" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </Modal>
    );
  }

  // Show message if no users are selected
  if (selectedUserIds.size === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Auto Split Preview" zIndex={10000}>
        <div className="p-4 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Please select at least one user to share with before using auto split.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>
    );
  }

  const getTotalItemsForUser = (split: UserSplit): number => {
    return split.aisleGroups.reduce((sum, group) => {
      const selectedCount = group.itemIndices.filter(idx => !unselectedIndices.has(idx)).length;
      return sum + selectedCount;
    }, 0);
  };

  const getAisleDisplayName = (aisleNumber: string, description?: string): string => {
    if (!aisleNumber) return "Unknown Location";
    const aisleNum = parseInt(aisleNumber) || 0;
    if (aisleNum >= 100 && description) {
      return description;
    }
    return `Aisle ${aisleNumber}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Auto Split Preview" zIndex={10000}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Items have been automatically split. Review and adjust as needed.
        </p>

        {/* Mode Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Split Mode:
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="splitMode"
                value="round-robin"
                checked={splitMode === 'round-robin'}
                onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Round Robin - Distribute aisles round-robin across users
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="splitMode"
                value="per-item-evenly"
                checked={splitMode === 'per-item-evenly'}
                onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Per Item Evenly - Distribute individual items evenly (not grouped by aisle)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="splitMode"
                value="aisles-sequential"
                checked={splitMode === 'aisles-sequential'}
                onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Aisles Sequential - Split aisles sequentially into equal parts
              </span>
            </label>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          {userSplits.map((split) => {
            const isExpanded = expandedUsers.has(split.userId);
            const totalItems = getTotalItemsForUser(split);
            const totalAisles = split.aisleGroups.length;

            return (
              <div
                key={split.userId}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleUserExpanded(split.userId)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${getUserColor(split.userId)} flex items-center justify-center`}>
                      <span className="text-xs text-white font-medium">
                        {getUserInitials(
                          split.userId === currentUserId ? undefined : users.find(u => u.userId === split.userId)?.name,
                          split.userId === currentUserId ? undefined : users.find(u => u.userId === split.userId)?.email,
                          split.userId
                        )}
                      </span>
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {getUserName(split.userId)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {totalAisles} {totalAisles === 1 ? "aisle" : "aisles"}, {totalItems} {totalItems === 1 ? "item" : "items"}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
                    {split.aisleGroups.map((group, groupIndex) => {
                      const aisleKey = `${split.userId}-${group.aisleNumber}`;
                      const isAisleExpanded = expandedAisles.has(aisleKey);
                      const selectedItems = group.itemIndices.filter(idx => !unselectedIndices.has(idx));
                      const aisleDisplayName = getAisleDisplayName(group.aisleNumber, group.description);

                      return (
                        <div
                          key={groupIndex}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                            <button
                              onClick={() => toggleAisleExpanded(split.userId, group.aisleNumber)}
                              className="flex items-center gap-2 flex-1 text-left"
                            >
                              {isAisleExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                              <span className="font-medium text-sm text-gray-900 dark:text-white">
                                {aisleDisplayName}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({selectedItems.length} {selectedItems.length === 1 ? "item" : "items"})
                              </span>
                            </button>
                            <div className="flex items-center gap-2">
                              {userSplits.map((otherSplit) => {
                                if (otherSplit.userId === split.userId) return null;
                                return (
                                  <button
                                    key={otherSplit.userId}
                                    onClick={() => moveAisleToUser(split.userId, otherSplit.userId, groupIndex)}
                                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                    title={`Move to ${getUserName(otherSplit.userId)}`}
                                  >
                                    → {getUserName(otherSplit.userId)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {isAisleExpanded && (
                            <div className="p-3 space-y-2 bg-white dark:bg-gray-900">
                              {group.itemIndices.map((itemIndex) => {
                                const item = shoppingList.items[itemIndex];
                                const isUnselected = unselectedIndices.has(itemIndex);
                                
                                return (
                                  <label
                                    key={itemIndex}
                                    className={`flex items-start gap-3 p-2 rounded-lg border-2 cursor-pointer transition-colors ${
                                      isUnselected
                                        ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60"
                                        : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!isUnselected}
                                      onChange={() => toggleItemSelection(itemIndex)}
                                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-2">
                                        <div className="absolute flex-shrink-0 top-2 right-2">
                                          <CustomerBadge customer={item.customer} app={item.app} />
                                          {item.imageUrl ? (
                                            <div className="relative w-12 h-12 bg-white rounded-lg overflow-visible shadow-sm border border-gray-100 dark:border-gray-600">
                                              <Image
                                                src={item.imageUrl}
                                                alt={item.found && item.description ? item.description : item.productName}
                                                fill
                                                className="object-contain p-1"
                                                unoptimized
                                              />
                                            </div>
                                          ) : (
                                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600 overflow-visible">
                                              <ShoppingCart className="w-4 h-4 text-gray-400" />
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                                            {item.found && item.description ? item.description : item.productName}
                                          </p>
                                          {item.brand && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{item.brand}</p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApplySplit}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Apply Split
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Share Shopping List Modal Component
function ShareShoppingListModal({
  isOpen,
  onClose,
  shoppingList,
  onShared,
}: {
  isOpen: boolean;
  onClose: () => void;
  shoppingList: ShoppingList | null;
  onShared: () => void;
}) {
  const { data: session } = useSession();
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<{ userId: string; email?: string; name?: string; image?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [unsharing, setUnsharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSplitModalOpen, setAutoSplitModalOpen] = useState(false);
  const [itemUserAssignments, setItemUserAssignments] = useState<Map<number, string>>(new Map());

  // Fetch users when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      // Don't pre-select already shared items - start with empty selection
      setSelectedIndices(new Set());
      setSelectedUserIds(new Set());
      setItemUserAssignments(new Map());
    }
  }, [isOpen, shoppingList]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/users");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSelectAllUsers = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u.userId)));
    }
  };

  // Helper to get primary aisle info
  const getPrimaryAisle = (item: ShoppingListItem) => {
    const aisles = item.krogerAisles;
    if (!aisles || aisles.length === 0) return undefined;
    
    return aisles.reduce((smallest, current) => {
      const smallestNum = parseInt(smallest?.aisleNumber || "999") || 999;
      const currentNum = parseInt(current?.aisleNumber || "999") || 999;
      return currentNum < smallestNum ? current : smallest;
    });
  };

  // Group items the same way as the main list
  const getGroupedItems = () => {
    if (!shoppingList) return [];

    const itemsWithIndices = shoppingList.items.map((item, index) => ({ item, originalIndex: index }));
    
    const sortedItemsWithIndices = itemsWithIndices.sort((a, b) => {
      const aisleA = getPrimaryAisle(a.item);
      const aisleB = getPrimaryAisle(b.item);
      
      const isUnknownA = !aisleA || !aisleA.aisleNumber;
      const isUnknownB = !aisleB || !aisleB.aisleNumber;
      
      if (isUnknownA && !isUnknownB) return -1;
      if (!isUnknownA && isUnknownB) return 1;
      if (isUnknownA && isUnknownB) return 0;
      
      if (!aisleA || !aisleB) return 0;
      
      const aisleNumA = parseInt(aisleA.aisleNumber || "999") || 999;
      const aisleNumB = parseInt(aisleB.aisleNumber || "999") || 999;
      if (aisleNumA !== aisleNumB) return aisleNumA - aisleNumB;
      
      const bayA = parseInt(aisleA?.bayNumber || "999") || 999;
      const bayB = parseInt(aisleB?.bayNumber || "999") || 999;
      if (bayA !== bayB) return bayA - bayB;
      
      const shelfA = parseInt(aisleA?.shelfNumber || "999") || 999;
      const shelfB = parseInt(aisleB?.shelfNumber || "999") || 999;
      return shelfA - shelfB;
    });

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

    if (groupedItems.length === 0 || (groupedItems.length === 1 && !groupedItems[0].aisle)) {
      groupedItems.length = 0;
      groupedItems.push({ 
        aisle: "", 
        bay: "", 
        shelf: "", 
        side: "",
        description: "",
        items: sortedItemsWithIndices.map(({ item }) => item),
        originalIndices: sortedItemsWithIndices.map(({ originalIndex }) => originalIndex)
      });
    }

    return groupedItems;
  };

  const handleToggleItem = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const handleSelectAll = () => {
    if (!shoppingList) return;
    const sharedItemIndices = shoppingList.sharedItemIndices || [];
    const nonSharedIndices = shoppingList.items
      .map((_, i) => i)
      .filter(i => !sharedItemIndices.includes(i));
    
    // If all non-shared items are selected, deselect all
    const allNonSharedSelected = nonSharedIndices.every(i => selectedIndices.has(i));
    if (allNonSharedSelected) {
      setSelectedIndices(new Set());
    } else {
      // Select all non-shared items (don't auto-select already-shared items)
      setSelectedIndices(new Set(nonSharedIndices));
    }
  };

  const handleShare = async () => {
    if (!shoppingList) return;
    
    const userIdsArray = Array.from(selectedUserIds);

    if (userIdsArray.length === 0) {
      setError("Please select at least one user");
      return;
    }

    if (selectedIndices.size === 0) {
      setError("Please select at least one item to share");
      return;
    }

    setSharing(true);
    setError(null);

    try {
      // If we have item-user assignments from auto-split, share items with their assigned users
      // Otherwise, share all items with all selected users (legacy behavior)
      if (itemUserAssignments.size > 0) {
        // Group items by assigned user
        const itemsByUser = new Map<string, number[]>();
        
        selectedIndices.forEach(itemIndex => {
          const assignedUserId = itemUserAssignments.get(itemIndex);
          if (assignedUserId && selectedUserIds.has(assignedUserId)) {
            if (!itemsByUser.has(assignedUserId)) {
              itemsByUser.set(assignedUserId, []);
            }
            itemsByUser.get(assignedUserId)!.push(itemIndex);
          }
        });

        // Share items with each user separately (sequential to avoid version conflicts)
        for (const [userId, itemIndices] of itemsByUser.entries()) {
          const response = await fetch(`/api/shopping-lists/${shoppingList._id}/share`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userIds: [userId],
              itemIndices: itemIndices,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to share list" }));
            throw new Error(errorData.error || "Failed to share list");
          }
        }

        // Also handle any items that don't have assignments (shouldn't happen, but just in case)
        const unassignedItems = Array.from(selectedIndices).filter(
          idx => !itemUserAssignments.has(idx)
        );
        if (unassignedItems.length > 0) {
          // Share unassigned items with all selected users
          const response = await fetch(`/api/shopping-lists/${shoppingList._id}/share`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userIds: userIdsArray,
              itemIndices: unassignedItems,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to share list" }));
            throw new Error(errorData.error || "Failed to share list");
          }
        }
      } else {
        // Legacy behavior: share all items with all selected users
        const itemIndicesArray = Array.from(selectedIndices);
        const response = await fetch(`/api/shopping-lists/${shoppingList._id}/share`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userIds: userIdsArray,
            itemIndices: itemIndicesArray,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to share list" }));
          throw new Error(errorData.error || "Failed to share list");
        }
      }

      onShared();
      onClose();
      setSelectedUserIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share list");
    } finally {
      setSharing(false);
    }
  };

  const handleUnshareAll = async () => {
    if (!shoppingList) return;

    setUnsharing(true);
    setError(null);

    try {
      const response = await fetch(`/api/shopping-lists/${shoppingList._id}/share`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndices: [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to unshare items" }));
        throw new Error(errorData.error || "Failed to unshare items");
      }

      onShared();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unshare items");
    } finally {
      setUnsharing(false);
    }
  };

  if (!isOpen || !shoppingList) return null;

  const allGroupedItems = getGroupedItems();
  const sharedItemIndices = shoppingList.sharedItemIndices || [];
  
  // Separate items into non-shared and already-shared groups
  const nonSharedGroups: typeof allGroupedItems = [];
  const alreadySharedGroups: typeof allGroupedItems = [];
  
  allGroupedItems.forEach((group) => {
    const nonSharedItems: ShoppingListItem[] = [];
    const nonSharedIndices: number[] = [];
    const sharedItems: ShoppingListItem[] = [];
    const sharedIndices: number[] = [];
    
    group.items.forEach((item, idx) => {
      const originalIndex = group.originalIndices[idx];
      if (sharedItemIndices.includes(originalIndex)) {
        sharedItems.push(item);
        sharedIndices.push(originalIndex);
      } else {
        nonSharedItems.push(item);
        nonSharedIndices.push(originalIndex);
      }
    });
    
    if (nonSharedItems.length > 0) {
      nonSharedGroups.push({
        ...group,
        items: nonSharedItems,
        originalIndices: nonSharedIndices,
      });
    }
    
    if (sharedItems.length > 0) {
      alreadySharedGroups.push({
        ...group,
        items: sharedItems,
        originalIndices: sharedIndices,
      });
    }
  });
  
  // Check if all non-shared items are selected (for Select All button)
  const sharedItemIndicesForCheck = shoppingList.sharedItemIndices || [];
  const nonSharedIndicesForCheck = shoppingList.items
    .map((_, i) => i)
    .filter(i => !sharedItemIndicesForCheck.includes(i));
  const allNonSharedSelected = nonSharedIndicesForCheck.length > 0 && 
    nonSharedIndicesForCheck.every(i => selectedIndices.has(i));
  
  // Helper function to get which users an item is shared with
  const getUsersItemIsSharedWith = (itemIndex: number): typeof users => {
    const sharedUsers: typeof users = [];
    
    // Use new sharedItems structure if available
    if (shoppingList.sharedItems) {
      const sharedItemsMap = shoppingList.sharedItems instanceof Map 
        ? Object.fromEntries(shoppingList.sharedItems) 
        : shoppingList.sharedItems;
      
      Object.entries(sharedItemsMap).forEach(([userId, indices]) => {
        if (Array.isArray(indices) && indices.includes(itemIndex)) {
          const user = users.find(u => u.userId === userId);
          if (user) {
            sharedUsers.push(user);
          }
        }
      });
    } else {
      // Fallback to old structure for backward compatibility
      if (shoppingList.sharedItemIndices?.includes(itemIndex) && shoppingList.sharedWith) {
        shoppingList.sharedWith.forEach(userId => {
          const user = users.find(u => u.userId === userId);
          if (user) {
            sharedUsers.push(user);
          }
        });
      }
    }
    
    return sharedUsers;
  };

  // Get users who the list is shared with
  const sharedWithUsers = (shoppingList.sharedWith || [])
    .map(userId => users.find(u => u.userId === userId))
    .filter(Boolean) as typeof users;

  const handleApplyAutoSplit = (itemIndices: Set<number>, itemUserMap?: Map<number, string>) => {
    setSelectedIndices(itemIndices);
    setItemUserAssignments(itemUserMap || new Map());
    setAutoSplitModalOpen(false);
  };

  return (
    <>
      <AutoSplitModal
        isOpen={autoSplitModalOpen}
        onClose={() => setAutoSplitModalOpen(false)}
        shoppingList={shoppingList}
        selectedUserIds={selectedUserIds}
        users={users}
        currentUserId={session?.user?.id}
        onApplySplit={handleApplyAutoSplit}
      />
      <Modal isOpen={isOpen} onClose={onClose} title="Share Shopping List">
        <div className="space-y-4">
        {/* Users Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Users to Share With <span className="text-red-500">*</span>
            </label>
            {users.length > 0 && (
              <button
                onClick={handleSelectAllUsers}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {selectedUserIds.size === users.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
          {loadingUsers ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg">
              <p className="text-sm">No other users found</p>
            </div>
          ) : (
            <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1">
              {users.map((user) => {
                const isSelected = selectedUserIds.has(user.userId);
                const isAlreadyShared = shoppingList.sharedWith?.includes(user.userId);
                return (
                  <label
                    key={user.userId}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleUser(user.userId)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className={`w-6 h-6 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                      <span className="text-xs text-white font-medium">
                        {getUserInitials(user.name, user.email, user.userId)}
                      </span>
                    </div>
                    <span className="flex-1 text-sm text-gray-900 dark:text-white">
                      {user.name || user.email || user.userId}
                    </span>
                    {isAlreadyShared && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded">
                        Already Shared
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Auto Split Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setAutoSplitModalOpen(true)}
            disabled={selectedUserIds.size === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
          >
            <ArrowRight className="w-4 h-4" />
            Auto Split
          </button>
        </div>

        {/* Select All Button */}
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Select Items to Share
          </label>
          <button
            onClick={handleSelectAll}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {allNonSharedSelected ? "Deselect All" : "Select All"}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Grouped Items List */}
        <div className="max-h-96 overflow-y-auto space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          {/* Non-Shared Items */}
          {nonSharedGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Aisle/Bay/Shelf Header */}
              {group.aisle && (
                <div className="pt-2 pb-1 border-b border-gray-200 dark:border-gray-700 mb-2">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                    {(() => {
                      const aisleNum = parseInt(group.aisle) || 0;
                      if (aisleNum >= 100 && group.description) {
                        return `${group.description} | ${group.side || "?"} - Bay ${group.bay || "?"} | Shelf ${group.shelf || "?"}`;
                      }
                      return `Aisle ${group.aisle} | ${group.side || "?"} - Bay ${group.bay || "?"} | Shelf ${group.shelf || "?"}`;
                    })()}
                  </h3>
                </div>
              )}
              {!group.aisle && groupIndex === 0 && (
                <div className="pt-2 pb-1 border-b border-gray-200 dark:border-gray-700 mb-2">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                    Unknown Location
                  </h3>
                </div>
              )}

              {/* Items in this group */}
              <div className="space-y-2">
                {group.items.map((item, itemIndex) => {
                  const originalIndex = group.originalIndices[itemIndex];
                  const isSelected = selectedIndices.has(originalIndex);
                  const isAlreadyShared = shoppingList.sharedItemIndices?.includes(originalIndex);

                  return (
                    <label
                      key={`item-${originalIndex}`}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleItem(originalIndex)}
                        className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          {/* Product Image */}
                          <div className="absolute flex-shrink-0 top-2 right-2">
                            <CustomerBadge customer={item.customer} app={item.app} />
                            {item.imageUrl ? (
                              <div className="relative w-16 h-16 bg-white rounded-lg overflow-visible shadow-sm border border-gray-100 dark:border-gray-600">
                                <Image
                                  src={item.imageUrl}
                                  alt={item.found && item.description ? item.description : item.productName}
                                  fill
                                  className="object-contain p-1"
                                  unoptimized
                                />
                              </div>
                            ) : (
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600 overflow-visible">
                                <ShoppingCart className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                          </div>

                          {/* Product Details */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              {item.found && item.description ? item.description : item.productName}
                            </p>
                            {item.brand && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{item.brand}</p>
                            )}
                            {/* Show which user this item is assigned to (from auto-split) or will be shared with */}
                            {isSelected && (
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {itemUserAssignments.has(originalIndex) ? (
                                  <>
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Assigned to:</span>
                                    {(() => {
                                      const assignedUserId = itemUserAssignments.get(originalIndex);
                                      const assignedUser = users.find(u => u.userId === assignedUserId);
                                      if (!assignedUser) return null;
                                      return (
                                        <div className="flex items-center gap-1">
                                          <div className={`w-4 h-4 rounded-full ${getUserColor(assignedUser.userId)} flex items-center justify-center`}>
                                            <span className="text-[10px] text-white font-medium">
                                              {getUserInitials(assignedUser.name, assignedUser.email, assignedUser.userId)}
                                            </span>
                                          </div>
                                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            {assignedUser.name || assignedUser.email || assignedUser.userId}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </>
                                ) : selectedUserIds.size > 0 ? (
                                  <>
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Will share with:</span>
                                    {Array.from(selectedUserIds).map((userId) => {
                                      const user = users.find(u => u.userId === userId);
                                      if (!user) return null;
                                      return (
                                        <div key={userId} className="flex items-center gap-1">
                                          <div className={`w-4 h-4 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                                            <span className="text-[10px] text-white font-medium">
                                              {getUserInitials(user.name, user.email, user.userId)}
                                            </span>
                                          </div>
                                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            {user.name || user.email || user.userId}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </>
                                ) : null}
                              </div>
                            )}
                            {/* Show who it's shared with if already shared */}
                            {isAlreadyShared && (() => {
                              const itemSharedUsers = getUsersItemIsSharedWith(originalIndex);
                              return itemSharedUsers.length > 0 ? (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">Shared with:</span>
                                  {itemSharedUsers.map((user) => (
                                    <div
                                      key={user.userId}
                                      className="flex items-center gap-1"
                                    >
                                      <div className={`w-4 h-4 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                                        <span className="text-[10px] text-white font-medium">
                                          {getUserInitials(user.name, user.email, user.userId)}
                                        </span>
                                      </div>
                                      <span className="text-xs text-gray-600 dark:text-gray-400">
                                        {user.name || user.email || user.userId}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Already Shared Items Section */}
          {alreadySharedGroups.length > 0 && (
            <div className="mt-6 pt-4 border-t-2 border-green-500 dark:border-green-600">
              <div className="mb-3 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <h3 className="text-sm font-bold text-green-600 dark:text-green-400">
                  Already Shared Items
                </h3>
              </div>
              {alreadySharedGroups.map((group, groupIndex) => (
                <div key={`shared-${groupIndex}`}>
                  {/* Aisle/Bay/Shelf Header */}
                  {group.aisle && (
                    <div className="pt-2 pb-1 border-b border-gray-200 dark:border-gray-700 mb-2">
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                        {(() => {
                          const aisleNum = parseInt(group.aisle) || 0;
                          if (aisleNum >= 100 && group.description) {
                            return `${group.description} | ${group.side || "?"} - Bay ${group.bay || "?"} | Shelf ${group.shelf || "?"}`;
                          }
                          return `Aisle ${group.aisle} | ${group.side || "?"} - Bay ${group.bay || "?"} | Shelf ${group.shelf || "?"}`;
                        })()}
                      </h3>
                    </div>
                  )}
                  {!group.aisle && groupIndex === 0 && (
                    <div className="pt-2 pb-1 border-b border-gray-200 dark:border-gray-700 mb-2">
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                        Unknown Location
                      </h3>
                    </div>
                  )}

                  {/* Items in this group */}
                  <div className="space-y-2">
                    {group.items.map((item, itemIndex) => {
                      const originalIndex = group.originalIndices[itemIndex];
                      const isSelected = selectedIndices.has(originalIndex);

                      return (
                        <label
                          key={`shared-item-${originalIndex}`}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-green-200 dark:border-green-800/30 bg-green-50/50 dark:bg-green-900/10 hover:border-green-300 dark:hover:border-green-700/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleItem(originalIndex)}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              {/* Product Image */}
                              <div className="absolute flex-shrink-0 top-2 right-2">
                                <CustomerBadge customer={item.customer} app={item.app} />
                                {item.imageUrl ? (
                                  <div className="relative w-16 h-16 bg-white rounded-lg overflow-visible shadow-sm border border-gray-100 dark:border-gray-600">
                                    <Image
                                      src={item.imageUrl}
                                      alt={item.found && item.description ? item.description : item.productName}
                                      fill
                                      className="object-contain p-1"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600 overflow-visible">
                                    <ShoppingCart className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                              </div>

                              {/* Product Details */}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                  {item.found && item.description ? item.description : item.productName}
                                </p>
                                {item.brand && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.brand}</p>
                                )}
                                {/* Show which user this item is assigned to (from auto-split) or will be shared with */}
                                {isSelected && (
                                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    {itemUserAssignments.has(originalIndex) ? (
                                      <>
                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Assigned to:</span>
                                        {(() => {
                                          const assignedUserId = itemUserAssignments.get(originalIndex);
                                          const assignedUser = users.find(u => u.userId === assignedUserId);
                                          if (!assignedUser) return null;
                                          return (
                                            <div className="flex items-center gap-1">
                                              <div className={`w-4 h-4 rounded-full ${getUserColor(assignedUser.userId)} flex items-center justify-center`}>
                                                <span className="text-[10px] text-white font-medium">
                                                  {getUserInitials(assignedUser.name, assignedUser.email, assignedUser.userId)}
                                                </span>
                                              </div>
                                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                {assignedUser.name || assignedUser.email || assignedUser.userId}
                                              </span>
                                            </div>
                                          );
                                        })()}
                                      </>
                                    ) : selectedUserIds.size > 0 ? (
                                      <>
                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Will share with:</span>
                                        {Array.from(selectedUserIds).map((userId) => {
                                          const user = users.find(u => u.userId === userId);
                                          if (!user) return null;
                                          return (
                                            <div key={userId} className="flex items-center gap-1">
                                              <div className={`w-4 h-4 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                                                <span className="text-[10px] text-white font-medium">
                                                  {getUserInitials(user.name, user.email, user.userId)}
                                                </span>
                                              </div>
                                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                {user.name || user.email || user.userId}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </>
                                    ) : null}
                                  </div>
                                )}
                                {/* Show who it's shared with */}
                                {(() => {
                                  const itemSharedUsers = getUsersItemIsSharedWith(originalIndex);
                                  return itemSharedUsers.length > 0 ? (
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                      <span className="text-xs text-gray-500 dark:text-gray-400">Shared with:</span>
                                      {itemSharedUsers.map((user) => (
                                        <div
                                          key={user.userId}
                                          className="flex items-center gap-1"
                                        >
                                          <div className={`w-4 h-4 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                                            <span className="text-[10px] text-white font-medium">
                                              {getUserInitials(user.name, user.email, user.userId)}
                                            </span>
                                          </div>
                                          <span className="text-xs text-gray-600 dark:text-gray-400">
                                            {user.name || user.email || user.userId}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            disabled={sharing || unsharing}
          >
            Cancel
          </button>
          {sharedItemIndices.length > 0 && (
            <button
              onClick={handleUnshareAll}
              disabled={sharing || unsharing}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {unsharing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Unsharing...
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  Unshare All
                </>
              )}
            </button>
          )}
          <button
            onClick={handleShare}
            disabled={sharing || unsharing || selectedIndices.size === 0 || selectedUserIds.size === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {sharing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                Share ({selectedIndices.size} {selectedIndices.size === 1 ? "item" : "items"} with {selectedUserIds.size} {selectedUserIds.size === 1 ? "user" : "users"})
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
    </>
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
  const [screenshotUploadOpen, setScreenshotUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"todo" | "problem" | "done">("todo");
  const [scanningItem, setScanningItem] = useState<ShoppingListItem | null>(null);
  const [croppingItemIndex, setCroppingItemIndex] = useState<number | null>(null);
  const [scanResult, setScanResult] = useState<{ success: boolean; item: ShoppingListItem; scannedBarcode?: string } | null>(null);
  const [customerIdentificationOpen, setCustomerIdentificationOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [users, setUsers] = useState<{ userId: string; email?: string; name?: string; image?: string }[]>([]);
  const [viewingScreenshot, setViewingScreenshot] = useState<{ base64: string; item: ShoppingListItem; itemIndex: number } | null>(null); // screenshot and item to view
  const [showOriginalScreenshot, setShowOriginalScreenshot] = useState(false);
  const hasAutoRefreshedRef = useRef(false);
  const previousItemsRef = useRef<string>('');

  // Debug: Log bounding box when viewing screenshot
  useEffect(() => {
    if (viewingScreenshot && showOriginalScreenshot) {
      console.log('Viewing screenshot with item:', viewingScreenshot.item);
      console.log('Bounding box:', viewingScreenshot.item.boundingBox);
    }
  }, [viewingScreenshot, showOriginalScreenshot]);

  const fetchShoppingList = async () => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to load shopping list" }));
        throw new Error(errorData.error || "Failed to load shopping list");
      }

      const data = await response.json();
      
      // Log prettified response in browser console
      console.log("Shopping List Response:", data);
      
      // Check if items have croppedImage
      if (data.items && Array.isArray(data.items)) {
        const itemsWithCropped = data.items.filter((item: any) => item.croppedImage);
        console.log(`Items with cropped images: ${itemsWithCropped.length} of ${data.items.length}`);
        if (itemsWithCropped.length > 0) {
          console.log("Sample item with cropped image:", {
            productName: itemsWithCropped[0].productName,
            hasCroppedImage: !!itemsWithCropped[0].croppedImage,
            croppedImageLength: itemsWithCropped[0].croppedImage?.length || 0,
            boundingBox: itemsWithCropped[0].boundingBox,
          });
        }
      }
      
      setShoppingList(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shopping list");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  // Helper function to get which users an item is shared with
  const getUsersItemIsSharedWith = (itemIndex: number): typeof users => {
    if (!shoppingList) return [];
    const sharedUsers: typeof users = [];
    
    // Use new sharedItems structure if available
    if (shoppingList.sharedItems) {
      const sharedItemsMap = shoppingList.sharedItems instanceof Map 
        ? Object.fromEntries(shoppingList.sharedItems) 
        : shoppingList.sharedItems;
      
      Object.entries(sharedItemsMap).forEach(([userId, indices]) => {
        if (Array.isArray(indices) && indices.includes(itemIndex)) {
          const user = users.find(u => u.userId === userId);
          if (user) {
            sharedUsers.push(user);
          }
        }
      });
    } else {
      // Fallback to old structure for backward compatibility
      if (shoppingList.sharedItemIndices?.includes(itemIndex) && shoppingList.sharedWith) {
        shoppingList.sharedWith.forEach(userId => {
          const user = users.find(u => u.userId === userId);
          if (user) {
            sharedUsers.push(user);
          }
        });
      }
    }
    
    return sharedUsers;
  };

  // Fetch user info for specific user IDs (e.g., users in sharedWith)
  const fetchUsersByIds = async (userIds: string[]) => {
    if (!userIds || userIds.length === 0) return;
    
    try {
      const response = await fetch("/api/users/by-ids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users by IDs");
      }
      const data = await response.json();
      const fetchedUsers = data.users || [];
      
      // Merge with existing users, avoiding duplicates
      setUsers((prevUsers) => {
        const existingUserIds = new Set(prevUsers.map((u) => u.userId));
        const newUsers = fetchedUsers.filter(
          (u: { userId: string }) => !existingUserIds.has(u.userId)
        );
        return [...prevUsers, ...newUsers];
      });
    } catch (err) {
      console.error("Failed to fetch users by IDs:", err);
    }
  };

  // Fetch users when component mounts and when shopping list changes
  useEffect(() => {
    fetchUsers();
  }, []);

  // Fetch user info for all users in sharedWith and sharedItems when shopping list is loaded
  useEffect(() => {
    const userIdsToFetch = new Set<string>();
    
    // Add users from sharedWith (backward compatibility)
    if (shoppingList?.sharedWith && shoppingList.sharedWith.length > 0) {
      shoppingList.sharedWith.forEach(userId => userIdsToFetch.add(userId));
    }
    
    // Add users from sharedItems (new structure)
    if (shoppingList?.sharedItems) {
      const sharedItemsMap = shoppingList.sharedItems instanceof Map 
        ? Object.fromEntries(shoppingList.sharedItems) 
        : shoppingList.sharedItems;
      Object.keys(sharedItemsMap).forEach(userId => userIdsToFetch.add(userId));
    }
    
    if (userIdsToFetch.size > 0) {
      fetchUsersByIds(Array.from(userIdsToFetch));
    }
  }, [shoppingList?.sharedWith, shoppingList?.sharedItems]);

  // Helper to get original index from filtered index (for shared users)
  const getOriginalIndex = (filteredIndex: number): number => {
    if (!shoppingList?.isShared || !shoppingList?.originalIndicesMap) {
      return filteredIndex; // Owner sees full list, no mapping needed
    }
    return shoppingList.originalIndicesMap[filteredIndex] ?? filteredIndex;
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

  const handleManualEntryAdded = async () => {
    await fetchShoppingList();
  };

  const handleScreenshotItemsAdded = async () => {
    console.log("🔄 Refreshing shopping list after items added...");
    await fetchShoppingList();
    console.log("✅ Shopping list refreshed");
  };

  const handleCropItem = async (item: ShoppingListItem, itemIndex: number) => {
    if (!shoppingList || !item.screenshotId) {
      console.error("Cannot crop: missing shopping list or screenshotId");
      return;
    }

    // Find the screenshot
    const screenshot = shoppingList.screenshots?.find(s => s.id === item.screenshotId);
    if (!screenshot) {
      console.error("Cannot crop: screenshot not found");
      return;
    }

    setCroppingItemIndex(itemIndex);
    try {
      console.log(`Cropping item ${itemIndex}:`, {
        productName: item.productName,
        screenshotId: item.screenshotId,
      });

      const cropResponse = await fetch("/api/shopping-lists/crop-item", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shoppingListId: shoppingList._id,
          itemIndex,
          screenshotBase64: screenshot.base64,
          productName: item.searchTerm || item.productName, // Use searchTerm (original Gemini response) instead of matched productName
        }),
      });

      if (!cropResponse.ok) {
        const errorText = await cropResponse.text();
        throw new Error(errorText || "Failed to crop item");
      }

      const cropData = await cropResponse.json();
      console.log(`✅ Crop response:`, cropData);

      // Refresh the shopping list to show the cropped image
      await fetchShoppingList();
    } catch (err) {
      console.error(`❌ Error cropping item:`, err);
      setError(err instanceof Error ? err.message : "Failed to crop item");
    } finally {
      setCroppingItemIndex(null);
    }
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
          itemIndex: getOriginalIndex(shoppingList?.items.findIndex(i => i === item) ?? -1),
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

  // Helper to detect duplicates based on productId, app, and customer
  const getDuplicateInfo = (item: ShoppingListItem, allItems: ShoppingListItem[]): { isDuplicate: boolean; duplicateCount: number } => {
    if (!item.productId || !item.app || !item.customer) {
      return { isDuplicate: false, duplicateCount: 0 };
    }

    const duplicates = allItems.filter(otherItem => 
      otherItem.productId === item.productId &&
      otherItem.app === item.app &&
      otherItem.customer === item.customer
    );

    return {
      isDuplicate: duplicates.length > 1,
      duplicateCount: duplicates.length
    };
  };

  // State to track cropped image heights
  const [croppedImageHeights, setCroppedImageHeights] = useState<Map<string, number>>(new Map<string, number>());

  // Recalculate image heights when shopping list changes
  useEffect(() => {
    if (!shoppingList || !shoppingList.items) return;

    // Create a signature of items to detect changes
    const itemsSignature = shoppingList.items.map((item, idx) => 
      `${idx}-${item.croppedImage ? item.croppedImage.substring(0, 100) : 'no-image'}`
    ).join('|');

    // Only recalculate if items have actually changed
    if (previousItemsRef.current === itemsSignature) return;
    previousItemsRef.current = itemsSignature;

    // Clear existing heights to force recalculation
    setCroppedImageHeights(new Map<string, number>());

    // Check all items with cropped images
    shoppingList.items.forEach((item, index) => {
      if (item.croppedImage) {
        const itemId = `item-${index}`;
        const img = document.createElement('img') as HTMLImageElement;
        img.onload = () => {
          const height = img.naturalHeight;
          setCroppedImageHeights(prev => {
            const newMap = new Map<string, number>(prev);
            newMap.set(itemId, height);
            return newMap;
          });
        };
        img.onerror = () => {
          // If image fails to load, mark as invalid
          setCroppedImageHeights(prev => {
            const newMap = new Map<string, number>(prev);
            newMap.set(itemId, 0);
            return newMap;
          });
        };
        img.src = item.croppedImage;
      }
    });
  }, [shoppingList]);

  // Helper to check if cropped image height is too small
  const checkCroppedImageHeight = (croppedImage: string, itemId: string) => {
    if (!croppedImage || croppedImageHeights.has(itemId)) return;

    const img = document.createElement('img') as HTMLImageElement;
    img.onload = () => {
      const height = img.naturalHeight;
      setCroppedImageHeights(prev => {
        const newMap = new Map<string, number>(prev);
        newMap.set(itemId, height);
        return newMap;
      });
    };
    img.src = croppedImage;
  };

  // Helper to check if image height is suspiciously small
  const isCroppedImageTooSmall = (item: ShoppingListItem, itemId: string): boolean => {
    if (!item.croppedImage) return false;
    const height = croppedImageHeights.get(itemId);
    return height !== undefined && height < 300;
  };

  const handleMoveToProblem = async (item: ShoppingListItem) => {
    try {
      const response = await fetch(`/api/shopping-lists/${id}/items`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemIndex: getOriginalIndex(shoppingList?.items.findIndex(i => i === item) ?? -1),
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
          itemIndex: getOriginalIndex(shoppingList?.items.findIndex(i => i === item) ?? -1),
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
          itemIndex: getOriginalIndex(shoppingList?.items.findIndex(i => i === item) ?? -1),
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
          itemIndex: getOriginalIndex(shoppingList?.items.findIndex(i => i === item) ?? -1),
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
  // Get all items for duplicate detection (across all tabs) - define before return
  const allItemsForDuplicateCheck = shoppingList.items;

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
  

  // Helper function to group items by aisle/bay/shelf
  const groupItemsByAisle = (itemsWithIndices: { item: ShoppingListItem; originalIndex: number }[]) => {
    const grouped: { aisle: string; bay: string; shelf: string; side: string; description: string; items: ShoppingListItem[]; originalIndices: number[] }[] = [];
    
    itemsWithIndices.forEach(({ item, originalIndex }) => {
      const primaryAisle = getPrimaryAisle(item);
      const aisleNum = primaryAisle?.aisleNumber || "";
      const bay = primaryAisle?.bayNumber || "";
      const shelf = primaryAisle?.shelfNumber || "";
      const side = primaryAisle?.side || "";
      const description = primaryAisle?.description || "";
      
      const lastGroup = grouped[grouped.length - 1];
      if (lastGroup && lastGroup.aisle === aisleNum && lastGroup.bay === bay && lastGroup.shelf === shelf) {
        lastGroup.items.push(item);
        lastGroup.originalIndices.push(originalIndex);
      } else {
        grouped.push({ aisle: aisleNum, bay, shelf, side, description, items: [item], originalIndices: [originalIndex] });
      }
    });

    if (grouped.length === 0 || (grouped.length === 1 && !grouped[0].aisle)) {
      grouped.length = 0;
      grouped.push({ 
        aisle: "", 
        bay: "", 
        shelf: "", 
        side: "",
        description: "",
        items: itemsWithIndices.map(({ item }) => item),
        originalIndices: itemsWithIndices.map(({ originalIndex }) => originalIndex)
      });
    }

    return grouped;
  };

  // Filter items by status based on active tab
  const filteredItemsWithIndices = sortedItemsWithIndices.filter(({ item }) => {
    if (activeTab === "todo") return !item.done && !item.problem;
    if (activeTab === "problem") return item.problem;
    if (activeTab === "done") return item.done;
    return false;
  });

  // Separate shared and non-shared items
  const sharedItemIndices = shoppingList.sharedItemIndices || [];
  const nonSharedItems = filteredItemsWithIndices.filter(({ originalIndex }) => 
    !sharedItemIndices.includes(originalIndex)
  );
  const sharedItems = filteredItemsWithIndices.filter(({ originalIndex }) => 
    sharedItemIndices.includes(originalIndex)
  );

  // Group each set separately
  const nonSharedGroupedItems = groupItemsByAisle(nonSharedItems).filter(group => group.items.length > 0);
  const sharedGroupedItems = groupItemsByAisle(sharedItems).filter(group => group.items.length > 0);

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
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShareModalOpen(true)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
              >
                <Share2 className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Share</span>
              </button>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setScreenshotUploadOpen(true)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Add Screenshot</span>
                </button>
                <button
                  onClick={() => setManualEntryOpen(true)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Add Manually</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Identification Button - Show on all tabs (todo, problem, done) */}
        {(() => {
          // Check if there are items in the current tab
          const hasItemsInTab = activeTab === "todo" 
            ? shoppingList.items.filter(item => !item.done && !item.problem).length > 0
            : activeTab === "problem"
            ? shoppingList.items.filter(item => item.problem).length > 0
            : shoppingList.items.filter(item => item.done).length > 0;
          
          return hasItemsInTab && (
            <div className="mb-4">
              <button
                onClick={() => setCustomerIdentificationOpen(true)}
                className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Search className="w-4 h-4" />
                Identify Customer for Item
              </button>
            </div>
          );
        })()}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Items */}
        <div>
          {nonSharedGroupedItems.length === 0 && sharedGroupedItems.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>No {activeTab === "todo" ? "todo" : activeTab === "problem" ? "problem" : "completed"} items</p>
            </div>
          ) : (
            <>
              {/* Non-Shared Items */}
              {nonSharedGroupedItems.map((group, groupIndex) => (
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

                // Check for duplicates
                const duplicateInfo = getDuplicateInfo(item, allItemsForDuplicateCheck);
                // Check if missing cropped image (has screenshotId but no croppedImage)
                const missingCroppedImage = item.screenshotId && !item.croppedImage;
                // Check cropped image height
                const itemId = `item-${originalIndex}`;
                if (item.croppedImage) {
                  checkCroppedImageHeight(item.croppedImage, itemId);
                }
                const isImageTooSmall = isCroppedImageTooSmall(item, itemId);
                
                // Find screenshot if item has screenshotId
                const screenshot = item.screenshotId && shoppingList?.screenshots 
                  ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
                  : null;

                const handleScreenshotClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (screenshot) {
                    setViewingScreenshot({ base64: screenshot.base64, item, itemIndex: originalIndex });
                    setShowOriginalScreenshot(true);
                  }
                };

                return (
                  <div
                    key={`${groupIndex}-${index}`}
                    className="mb-2 rounded-lg"
                  >
                    {/* Single Card with Cropped Image at Top and Product Info Below */}
                    <div 
                      className={`bg-white dark:bg-gray-100 hover:bg-gray-50 dark:hover:bg-gray-200 rounded-lg transition-colors cursor-pointer relative border-2 overflow-hidden ${
                        isImageTooSmall ? "border-red-400 dark:border-red-500" : missingCroppedImage ? "border-yellow-400 dark:border-yellow-500" : duplicateInfo.isDuplicate ? "border-orange-400 dark:border-orange-500" : "border-gray-200 dark:border-gray-300"
                      }`}
                      onClick={handleItemClick}
                    >
                      {/* Cropped Image at Top - Inside the card */}
                      {item.croppedImage ? (
                        <div className="w-full bg-white dark:bg-gray-50 border-b border-gray-200 dark:border-gray-300 rounded-t-lg overflow-hidden relative">
                          {/* Duplicate Indicator Badge - Top left of cropped image */}
                          {duplicateInfo.isDuplicate && (
                            <div className="absolute top-2 left-2 z-10">
                              <div className="px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Duplicate ({duplicateInfo.duplicateCount})
                              </div>
                            </div>
                          )}
                          {/* Image Too Small Indicator Badge */}
                          {isImageTooSmall && (
                            <div className="absolute top-2 left-2 z-10" style={{ top: duplicateInfo.isDuplicate ? '2.5rem' : '0.5rem' }}>
                              <div className="px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Image may be cut off
                              </div>
                            </div>
                          )}
                          {/* AI Detected Cropped Image Badge */}
                          {item.aiDetectedCroppedImage && (
                            <div className="absolute top-2 left-2 z-10" style={{ top: (duplicateInfo.isDuplicate ? '2.5rem' : '0.5rem') + (isImageTooSmall ? '2.5rem' : '0') }}>
                              <div className="px-2 py-1 bg-purple-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                AI: Image cropped off
                              </div>
                            </div>
                          )}
                          {/* Original Screenshot Thumbnail - Top right */}
                          {screenshot && (
                            <button
                              onClick={handleScreenshotClick}
                              className="absolute top-2 right-2 z-10 w-16 h-16 rounded-lg border-2 border-white dark:border-gray-800 shadow-lg hover:scale-105 transition-transform overflow-hidden bg-white dark:bg-gray-800"
                              title="View original screenshot"
                            >
                              <img
                                src={screenshot.base64}
                                alt="Original screenshot"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                          <img
                            src={item.croppedImage}
                            alt={item.found && item.description ? item.description : item.productName}
                            className="w-full h-auto max-h-64 object-contain mx-auto block"
                          />
                        </div>
                      ) : item.screenshotId ? (
                        <div className="w-full bg-gray-100 dark:bg-gray-200 border-b border-gray-200 dark:border-gray-300 rounded-t-lg overflow-hidden relative py-3 px-4">
                          {/* Duplicate Indicator Badge - Top left of no cropped image section */}
                          {duplicateInfo.isDuplicate && (
                            <div className="absolute top-2 left-2 z-10">
                              <div className="px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Duplicate ({duplicateInfo.duplicateCount})
                              </div>
                            </div>
                          )}
                          {/* Missing Cropped Image Indicator Badge */}
                          <div className="absolute top-2 left-2 z-10" style={{ top: duplicateInfo.isDuplicate ? '2.5rem' : '0.5rem' }}>
                            <div className="px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              No cropped image
                            </div>
                          </div>
                          {/* Original Screenshot Thumbnail - Top right */}
                          {screenshot && (
                            <button
                              onClick={handleScreenshotClick}
                              className="absolute top-2 right-2 z-10 w-16 h-16 rounded-lg border-2 border-white dark:border-gray-800 shadow-lg hover:scale-105 transition-transform overflow-hidden bg-white dark:bg-gray-800"
                              title="View original screenshot"
                            >
                              <img
                                src={screenshot.base64}
                                alt="Original screenshot"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-800">
                              No cropped image available
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-700 mt-1">
                              Cropping was not successful
                            </p>
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Product Info Section Below Cropped Image */}
                      <div className="flex gap-4 py-3 px-3 relative overflow-visible">
                        {/* Action Buttons - Positioned in top right of card */}
                        <div className="absolute top-2 right-2 flex items-start gap-2 z-10">
                          {/* Scan Button - Only show for todo items with UPC */}
                          {activeTab === "todo" && item.upc && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleScanBarcode(item);
                              }}
                              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap shadow-md"
                            >
                              <Scan className="w-4 h-4 flex-shrink-0" />
                              <span className="hidden sm:inline">Scan</span>
                            </button>
                          )}
                        </div>
                        {/* Customer Badge - Positioned to the top left */}
                        <div className="absolute top-2 left-2 z-20" style={{ pointerEvents: 'none' }}>
                          <div style={{ pointerEvents: 'auto' }}>
                            <CustomerBadge customer={item.customer} app={item.app} />
                          </div>
                        </div>
                        {/* Product Image - Positioned to the left */}
                        <div className="relative flex-shrink-0">
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
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                          {/* Quantity + Kroger Product Name */}
                          <p className="text-gray-900 dark:text-gray-900 leading-snug break-words">
                            {item.found && item.description ? (
                              <>
                                <span className="font-bold text-lg">{item.quantity || "?? ct"} </span>
                                <span className="text-base">{item.description}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-bold text-lg">{item.quantity || "?? ct"}</span>{" "}
                                <span className="text-base">{item.productName}</span>
                              </>
                            )}
                          </p>

                          {/* Shared With Info */}
                          {(() => {
                            const itemSharedUsers = getUsersItemIsSharedWith(originalIndex);
                            return itemSharedUsers.length > 0 ? (
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Shared with:</span>
                                {itemSharedUsers.map((user) => (
                                  <div
                                    key={user.userId}
                                    className="flex items-center gap-1"
                                  >
                                    <div className={`w-4 h-4 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                                      <span className="text-[10px] text-white font-medium">
                                        {getUserInitials(user.name, user.email, user.userId)}
                                      </span>
                                    </div>
                                    <span className="text-xs text-gray-600 dark:text-gray-700">
                                      {user.name || user.email || user.userId}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          })()}
                          
                          {/* Kroger Size • Price • Stock Level */}
                          {item.found && (
                            <p className="text-sm text-gray-600 dark:text-gray-700 mt-1 whitespace-nowrap flex items-center gap-1 flex-wrap">
                              <span>
                                {item.size}
                                {item.size && (item.price || item.promoPrice) && " • "}
                                {item.promoPrice ? (
                                  <span className="text-gray-600 dark:text-gray-700">
                                    {formatPrice(item.promoPrice)}
                                  </span>
                                ) : item.price ? (
                                  <span>{formatPrice(item.price)}</span>
                                ) : null}
                              </span>
                              {/* Stock Level Indicator - on same line */}
                              {item.stockLevel && (
                                <>
                                  {(item.size || item.price || item.promoPrice) && (
                                    <span className="text-gray-600 dark:text-gray-700">•</span>
                                  )}
                                  <span className={item.stockLevel === "HIGH" ? "text-green-600 dark:text-green-400" : item.stockLevel === "LOW" ? "text-yellow-600 dark:text-yellow-400" : item.stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "text-red-600 dark:text-red-400" : ""}>
                                    {item.stockLevel === "HIGH" ? "✓ In Stock" : item.stockLevel === "LOW" ? "⚠ Low Stock" : item.stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "✗ Out of Stock" : ""}
                                  </span>
                                </>
                              )}
                            </p>
                          )}

                          {/* Kroger Aisle Location */}
                          {item.found && item.krogerAisles?.[0] && (() => {
                            const aisle = item.krogerAisles[0];
                            const locationParts: string[] = [];
                            
                            if (aisle.aisleNumber && parseInt(aisle.aisleNumber) < 100) {
                              locationParts.push(`Aisle ${aisle.aisleNumber}`);
                            } else if (aisle.description) {
                              locationParts.push(aisle.description);
                            }
                            
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
                              <p className="text-sm text-gray-600 dark:text-gray-700 mt-0.5 whitespace-nowrap">
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
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

              {/* Shared Items Section */}
              {sharedGroupedItems.length > 0 && (
                <div className="mt-8 pt-6 border-t-2 border-green-500 dark:border-green-600">
                  <div className="mb-4 flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <h2 className="text-lg font-bold text-green-600 dark:text-green-400">
                      Shared Items
                    </h2>
                  </div>
                  {sharedGroupedItems.map((group, groupIndex) => (
                    <div key={`shared-${groupIndex}`}>
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

                        // Check for duplicates
                        const duplicateInfo = getDuplicateInfo(item, allItemsForDuplicateCheck);
                        // Check if missing cropped image (has screenshotId but no croppedImage)
                        const missingCroppedImage = item.screenshotId && !item.croppedImage;
                        // Check cropped image height
                        const itemId = `shared-item-${originalIndex}`;
                        if (item.croppedImage) {
                          checkCroppedImageHeight(item.croppedImage, itemId);
                        }
                        const isImageTooSmall = isCroppedImageTooSmall(item, itemId);
                        
                        // Find screenshot if item has screenshotId
                        const screenshot = item.screenshotId && shoppingList?.screenshots 
                          ? shoppingList.screenshots.find(s => s.id === item.screenshotId)
                          : null;

                        const handleScreenshotClick = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (screenshot) {
                            setViewingScreenshot({ base64: screenshot.base64, item, itemIndex: originalIndex });
                            setShowOriginalScreenshot(true);
                          }
                        };

                        return (
                          <div
                            key={`shared-${groupIndex}-${index}`}
                            className="mb-2 rounded-lg"
                          >
                            {/* Single Card with Cropped Image at Top and Product Info Below */}
                            <div 
                              className={`bg-white dark:bg-gray-100 hover:bg-gray-50 dark:hover:bg-gray-200 rounded-lg transition-colors cursor-pointer relative border-2 overflow-hidden ${
                                isImageTooSmall ? "border-red-400 dark:border-red-500" : missingCroppedImage ? "border-yellow-400 dark:border-yellow-500" : duplicateInfo.isDuplicate ? "border-orange-400 dark:border-orange-500" : "border-gray-200 dark:border-gray-300"
                              }`}
                              onClick={handleItemClick}
                            >
                              {/* Cropped Image at Top - Inside the card */}
                              {item.croppedImage ? (
                                <div className="w-full bg-white dark:bg-gray-50 border-b border-gray-200 dark:border-gray-300 rounded-t-lg overflow-hidden relative">
                                  {/* Duplicate Indicator Badge - Top left of cropped image */}
                                  {duplicateInfo.isDuplicate && (
                                    <div className="absolute top-2 left-2 z-10">
                                      <div className="px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Duplicate ({duplicateInfo.duplicateCount})
                                      </div>
                                    </div>
                                  )}
                                  {/* Image Too Small Indicator Badge */}
                                  {isImageTooSmall && (
                                    <div className="absolute top-2 left-2 z-10" style={{ top: duplicateInfo.isDuplicate ? '2.5rem' : '0.5rem' }}>
                                      <div className="px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Image may be cut off
                                      </div>
                                    </div>
                                  )}
                                  {/* AI Detected Cropped Image Badge */}
                                  {item.aiDetectedCroppedImage && (
                                    <div className="absolute top-2 left-2 z-10" style={{ top: (duplicateInfo.isDuplicate ? '2.5rem' : '0.5rem') + (isImageTooSmall ? '2.5rem' : '0') }}>
                                      <div className="px-2 py-1 bg-purple-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        AI: Image cropped off
                                      </div>
                                    </div>
                                  )}
                                  {/* Original Screenshot Thumbnail - Top right */}
                                  {screenshot && (
                                    <button
                                      onClick={handleScreenshotClick}
                                      className="absolute top-2 right-2 z-10 w-16 h-16 rounded-lg border-2 border-white dark:border-gray-800 shadow-lg hover:scale-105 transition-transform overflow-hidden bg-white dark:bg-gray-800"
                                      title="View original screenshot"
                                    >
                                      <img
                                        src={screenshot.base64}
                                        alt="Original screenshot"
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                  )}
                                  <img
                                    src={item.croppedImage}
                                    alt={item.found && item.description ? item.description : item.productName}
                                    className="w-full h-auto max-h-64 object-contain mx-auto block"
                                  />
                                </div>
                              ) : item.screenshotId ? (
                                <div className="w-full bg-gray-100 dark:bg-gray-200 border-b border-gray-200 dark:border-gray-300 rounded-t-lg overflow-hidden relative py-3 px-4">
                                  {/* Duplicate Indicator Badge - Top left of no cropped image section */}
                                  {duplicateInfo.isDuplicate && (
                                    <div className="absolute top-2 left-2 z-10">
                                      <div className="px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Duplicate ({duplicateInfo.duplicateCount})
                                      </div>
                                    </div>
                                  )}
                                  {/* Missing Cropped Image Indicator Badge */}
                                  <div className="absolute top-2 left-2 z-10" style={{ top: duplicateInfo.isDuplicate ? '2.5rem' : '0.5rem' }}>
                                    <div className="px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-md shadow-md flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      No cropped image
                                    </div>
                                  </div>
                                  {/* Original Screenshot Thumbnail - Top right */}
                                  {screenshot && (
                                    <button
                                      onClick={handleScreenshotClick}
                                      className="absolute top-2 right-2 z-10 w-16 h-16 rounded-lg border-2 border-white dark:border-gray-800 shadow-lg hover:scale-105 transition-transform overflow-hidden bg-white dark:bg-gray-800"
                                      title="View original screenshot"
                                    >
                                      <img
                                        src={screenshot.base64}
                                        alt="Original screenshot"
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                  )}
                                  <div className="text-center">
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-800">
                                      No cropped image available
                                    </p>
                                    <p className="text-xs text-gray-600 dark:text-gray-700 mt-1">
                                      Cropping was not successful
                                    </p>
                                  </div>
                                </div>
                              ) : null}
                              
                              {/* Product Info Section Below Cropped Image */}
                              <div className="flex gap-4 py-3 px-3 relative overflow-visible">
                                {/* Action Buttons - Positioned in top right of card */}
                                <div className="absolute top-2 right-2 flex items-start gap-2 z-10">
                                  {/* Scan Button - Only show for todo items with UPC */}
                                  {activeTab === "todo" && item.upc && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleScanBarcode(item);
                                      }}
                                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap shadow-md"
                                    >
                                      <Scan className="w-4 h-4 flex-shrink-0" />
                                      <span className="hidden sm:inline">Scan</span>
                                    </button>
                                  )}
                                </div>
                                {/* Customer Badge - Positioned to the top left */}
                                <div className="absolute top-2 left-2 z-20" style={{ pointerEvents: 'none' }}>
                                  <div style={{ pointerEvents: 'auto' }}>
                                    <CustomerBadge customer={item.customer} app={item.app} />
                                  </div>
                                </div>
                                {/* Product Image - Positioned to the left */}
                                <div className="relative flex-shrink-0">
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
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                  {/* Quantity + Kroger Product Name */}
                                  <p className="text-gray-900 dark:text-gray-900 leading-snug break-words">
                                    {item.found && item.description ? (
                                      <>
                                        <span className="font-bold text-lg">{item.quantity || "?? ct"} </span>
                                        <span className="text-base">{item.description}</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-bold text-lg">{item.quantity || "?? ct"}</span>{" "}
                                        <span className="text-base">{item.productName}</span>
                                      </>
                                    )}
                                  </p>

                                  {/* Shared With Info */}
                                  {(() => {
                                    const itemSharedUsers = getUsersItemIsSharedWith(originalIndex);
                                    return itemSharedUsers.length > 0 ? (
                                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-600 dark:text-gray-700">Shared with:</span>
                                        {itemSharedUsers.map((user) => (
                                          <div
                                            key={user.userId}
                                            className="flex items-center gap-1"
                                          >
                                            <div className={`w-4 h-4 rounded-full ${getUserColor(user.userId)} flex items-center justify-center`}>
                                              <span className="text-[10px] text-white font-medium">
                                                {getUserInitials(user.name, user.email, user.userId)}
                                              </span>
                                            </div>
                                            <span className="text-xs text-gray-600 dark:text-gray-700">
                                              {user.name || user.email || user.userId}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null;
                                  })()}
                                  
                                  {/* Kroger Size • Price • Stock Level */}
                                  {item.found && (
                                    <p className="text-sm text-gray-600 dark:text-gray-700 mt-1 whitespace-nowrap flex items-center gap-1 flex-wrap">
                                      <span>
                                        {item.size}
                                        {item.size && (item.price || item.promoPrice) && " • "}
                                        {item.promoPrice ? (
                                          <span className="text-gray-600 dark:text-gray-700">
                                            {formatPrice(item.promoPrice)}
                                          </span>
                                        ) : item.price ? (
                                          <span>{formatPrice(item.price)}</span>
                                        ) : null}
                                      </span>
                                      {/* Stock Level Indicator - on same line */}
                                      {item.stockLevel && (
                                        <>
                                          {(item.size || item.price || item.promoPrice) && (
                                            <span className="text-gray-600 dark:text-gray-700">•</span>
                                          )}
                                          <span className={item.stockLevel === "HIGH" ? "text-green-600 dark:text-green-400" : item.stockLevel === "LOW" ? "text-yellow-600 dark:text-yellow-400" : item.stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "text-red-600 dark:text-red-400" : ""}>
                                            {item.stockLevel === "HIGH" ? "✓ In Stock" : item.stockLevel === "LOW" ? "⚠ Low Stock" : item.stockLevel === "TEMPORARILY_OUT_OF_STOCK" ? "✗ Out of Stock" : ""}
                                          </span>
                                        </>
                                      )}
                                    </p>
                                  )}

                                  {/* Kroger Aisle Location */}
                                  {item.found && item.krogerAisles?.[0] && (() => {
                                    const aisle = item.krogerAisles[0];
                                    const locationParts: string[] = [];
                                    
                                    if (aisle.aisleNumber && parseInt(aisle.aisleNumber) < 100) {
                                      locationParts.push(`Aisle ${aisle.aisleNumber}`);
                                    } else if (aisle.description) {
                                      locationParts.push(aisle.description);
                                    }
                                    
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
                                      <p className="text-sm text-gray-600 dark:text-gray-700 mt-0.5 whitespace-nowrap">
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
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedItem && (() => {
        const filteredIndex = shoppingList?.items.findIndex(i => i === selectedItem) ?? -1;
        const itemIndex = getOriginalIndex(filteredIndex);
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
            onScan={() => {
              if (selectedItem) {
                handleScanBarcode(selectedItem);
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
            shoppingList={shoppingList}
            onViewScreenshot={(screenshot) => {
              setViewingScreenshot(screenshot);
              setShowOriginalScreenshot(true);
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
          shoppingList={shoppingList}
        />
      )}

      {/* Screenshot Upload Modal */}
      <ScreenshotUploadModal
        locationId={shoppingList.locationId}
        shoppingListId={shoppingList._id}
        isOpen={screenshotUploadOpen}
        onClose={() => setScreenshotUploadOpen(false)}
        onItemsAdded={handleScreenshotItemsAdded}
      />

      {/* Manual Entry Modal */}
      <ManualEntryModal
        locationId={shoppingList.locationId}
        shoppingListId={shoppingList._id}
        isOpen={manualEntryOpen}
        onClose={() => setManualEntryOpen(false)}
        onItemAdded={handleManualEntryAdded}
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
          shoppingList={shoppingList}
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

      {/* Screenshot Viewer Modal */}
      {viewingScreenshot && (
        <Modal 
          isOpen={!!viewingScreenshot} 
          onClose={() => {
            setViewingScreenshot(null);
            setShowOriginalScreenshot(false);
          }} 
          title={viewingScreenshot.item.croppedImage && !showOriginalScreenshot ? "Cropped Product Image" : "Original Screenshot"}
          headerActions={
            <>
              {/* Toggle Original Screenshot - Only show if cropped image exists */}
              {viewingScreenshot.item.croppedImage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOriginalScreenshot(!showOriginalScreenshot);
                  }}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm"
                  title={showOriginalScreenshot ? "Show cropped image" : "Show original screenshot"}
                >
                  {showOriginalScreenshot ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      <span className="hidden sm:inline">Show Cropped</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">Show Original</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => {
                  if (viewingScreenshot) {
                    setEditItem({ item: viewingScreenshot.item, index: viewingScreenshot.itemIndex });
                    setViewingScreenshot(null);
                    setShowOriginalScreenshot(false);
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
            </>
          }
        >
          <div className="p-4 flex justify-center">
            <div className="relative max-w-full">
              <img 
                src={viewingScreenshot.item.croppedImage && !showOriginalScreenshot ? viewingScreenshot.item.croppedImage : viewingScreenshot.base64} 
                alt={viewingScreenshot.item.croppedImage && !showOriginalScreenshot ? "Cropped product image" : "Original screenshot"} 
                className="max-w-full h-auto rounded-lg block"
                style={{ maxHeight: '80vh' }}
                id="screenshot-image"
              />
              {/* Highlight overlay for moondream detection area - only show on original screenshot */}
              {showOriginalScreenshot && viewingScreenshot.item.boundingBox && (() => {
                const bbox = viewingScreenshot.item.boundingBox;
                console.log('Rendering highlight with bounding box:', bbox);
                return (
                  <>
                    {/* Dark overlay covering entire image with cutout for highlighted area */}
                    <div
                      className="absolute inset-0 bg-black/50 rounded-lg pointer-events-none"
                      style={{
                        clipPath: `polygon(
                          0% 0%,
                          0% 100%,
                          ${bbox.xMin * 100}% 100%,
                          ${bbox.xMin * 100}% ${bbox.yMin * 100}%,
                          ${bbox.xMax * 100}% ${bbox.yMin * 100}%,
                          ${bbox.xMax * 100}% ${bbox.yMax * 100}%,
                          ${bbox.xMin * 100}% ${bbox.yMax * 100}%,
                          ${bbox.xMin * 100}% 100%,
                          100% 100%,
                          100% 0%
                        )`,
                      }}
                    />
                    {/* Highlight box for detected area - border and glow only, no background */}
                    <div
                      className="absolute border-4 border-yellow-400 rounded-lg pointer-events-none z-10 shadow-[0_0_30px_rgba(250,204,21,1)]"
                      style={{
                        left: `${bbox.xMin * 100}%`,
                        top: `${bbox.yMin * 100}%`,
                        width: `${(bbox.xMax - bbox.xMin) * 100}%`,
                        height: `${(bbox.yMax - bbox.yMin) * 100}%`,
                      }}
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </Modal>
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
          shoppingList={shoppingList}
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
          shoppingList={shoppingList}
        />
      )}

      {/* Share Shopping List Modal */}
      <ShareShoppingListModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shoppingList={shoppingList}
        onShared={fetchShoppingList}
      />
    </Layout>
  );
}
