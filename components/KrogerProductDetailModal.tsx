"use client";

import { useState, useEffect } from "react";
import { KrogerProduct } from "@/lib/types/kroger";
import Modal from "./ui/Modal";
import JsonViewerModal from "./JsonViewer";
import Image from "next/image";
import { Code, ExternalLink, Barcode, Loader2 } from "lucide-react";

interface KrogerProductDetailModalProps {
  product: KrogerProduct;
  locationId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function KrogerProductDetailModal({
  product,
  locationId,
  isOpen,
  onClose,
}: KrogerProductDetailModalProps) {
  const [showJson, setShowJson] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [productDetails, setProductDetails] = useState<KrogerProduct | null>(product);
  const [loading, setLoading] = useState(false);

  // Fetch full product details if we have a productId and locationId
  useEffect(() => {
    if (isOpen && product.productId && locationId && !productDetails) {
      setLoading(true);
      fetch(`/api/kroger/products/${product.productId}?locationId=${locationId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            setProductDetails(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (isOpen) {
      // Use the provided product if we don't need to fetch
      setProductDetails(product);
    }
  }, [isOpen, product.productId, locationId, product]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setProductDetails(product);
      setShowJson(false);
      setShowBarcode(false);
    }
  }, [isOpen, product]);

  const formatPrice = (amount: number | undefined) => {
    if (amount === undefined) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const item = productDetails?.items?.[0];
  const price = item?.price || item?.nationalPrice;
  const upc = productDetails?.upc || item?.itemId;
  const stockLevel = item?.inventory?.stockLevel;

  const stockLevelColor =
    stockLevel === "HIGH"
      ? "text-green-600 dark:text-green-400"
      : stockLevel === "LOW"
      ? "text-yellow-600 dark:text-yellow-400"
      : stockLevel === "TEMPORARILY_OUT_OF_STOCK"
      ? "text-red-600 dark:text-red-400"
      : "text-gray-600 dark:text-gray-400";

  // Get best image URL
  const getImageUrl = () => {
    if (productDetails?.images && productDetails.images.length > 0) {
      const frontImg = productDetails.images.find((img) => img.perspective === "front");
      const defaultImg = productDetails.images.find((img) => img.default);
      const imgToUse = frontImg || defaultImg || productDetails.images[0];

      if (imgToUse?.sizes && imgToUse.sizes.length > 0) {
        const sizeOrder = ["xlarge", "large", "medium", "small", "thumbnail"];
        for (const size of sizeOrder) {
          const found = imgToUse.sizes.find((s) => s.size === size);
          if (found?.url) return found.url;
        }
        return imgToUse.sizes[0]?.url;
      }
    }
    return null;
  };

  const imageUrl = getImageUrl();

  // Calculate UPC check digit (UPC-A algorithm)
  const calculateCheckDigit = (digits: string): string => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits[i]);
      if ((i + 1) % 2 === 1) {
        sum += digit * 3;
      } else {
        sum += digit;
      }
    }
    const remainder = sum % 10;
    return remainder === 0 ? "0" : String(10 - remainder);
  };

  // Normalize and validate UPC
  const normalizeUPC = (upcCode: string): { code: string; type: string } | null => {
    const digits = upcCode.replace(/\D/g, "");
    if (digits.length === 0) return null;

    if (digits.length === 11) {
      const checkDigit = calculateCheckDigit(digits);
      return { code: digits + checkDigit, type: "UPCA" };
    }

    if (digits.length === 12) {
      const codeWithoutCheck = digits.slice(0, 11);
      const providedCheck = digits[11];
      const calculatedCheck = calculateCheckDigit(codeWithoutCheck);
      if (providedCheck !== calculatedCheck) {
        return { code: codeWithoutCheck + calculatedCheck, type: "UPCA" };
      }
      return { code: digits, type: "UPCA" };
    }

    if (digits.length === 13) {
      const codeWithoutCheck = digits.slice(0, 12);
      const providedCheck = digits[12];
      const digitsForCheck = codeWithoutCheck.slice(1);
      const calculatedCheck = calculateCheckDigit(digitsForCheck);
      if (providedCheck !== calculatedCheck) {
        return { code: codeWithoutCheck + calculatedCheck, type: "EAN13" };
      }
      return { code: digits, type: "EAN13" };
    }

    if (digits.length < 11) {
      const padded = digits.padStart(11, "0");
      const checkDigit = calculateCheckDigit(padded);
      return { code: padded + checkDigit, type: "UPCA" };
    }

    if (digits.length > 13) {
      const truncated = digits.slice(0, 11);
      const checkDigit = calculateCheckDigit(truncated);
      return { code: truncated + checkDigit, type: "UPCA" };
    }

    return null;
  };

  // Generate barcode URL for UPC
  const getBarcodeUrl = (upcCode: string) => {
    const normalized = normalizeUPC(upcCode);
    if (!normalized) {
      return null;
    }
    return `https://barcode.tec-it.com/barcode.ashx?data=${normalized.code}&code=${normalized.type}&dpi=96&dataseparator=`;
  };

  if (!productDetails) {
    return null;
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={productDetails.description || "Product Details"}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600 dark:text-green-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Product Image */}
            {imageUrl && (
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center aspect-square">
                <Image
                  src={imageUrl}
                  alt={productDetails.description || ""}
                  width={400}
                  height={400}
                  className="w-full h-full object-contain"
                  unoptimized
                />
              </div>
            )}

            {/* Product Info */}
            <div className="space-y-3">
              {/* Brand */}
              {productDetails.brand && (
                <p className="text-sm text-gray-600 dark:text-gray-400 uppercase">
                  {productDetails.brand}
                </p>
              )}

              {/* Description with Link */}
              {productDetails.productPageURI ? (
                <a
                  href={`https://www.kroger.com${productDetails.productPageURI}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors flex items-center gap-2">
                    {productDetails.description}
                    <ExternalLink className="w-4 h-4" />
                  </h2>
                </a>
              ) : (
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {productDetails.description}
                </h2>
              )}

              {/* Price */}
              {price && (
                <div className="flex items-baseline gap-2">
                  {price.promo && price.promo !== price.regular ? (
                    <>
                      <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {formatPrice(price.promo)}
                      </span>
                      <span className="text-lg text-gray-500 dark:text-gray-400 line-through">
                        {formatPrice(price.regular)}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatPrice(price.regular)}
                    </span>
                  )}
                  {item?.size && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      / {item.size}
                    </span>
                  )}
                </div>
              )}

              {/* Stock Level */}
              {stockLevel && (
                <div className={`text-sm font-medium ${stockLevelColor}`}>
                  {stockLevel === "HIGH"
                    ? "✓ In Stock"
                    : stockLevel === "LOW"
                    ? "⚠ Low Stock"
                    : "✗ Out of Stock"}
                </div>
              )}

              {/* Aisle Locations */}
              {productDetails.aisleLocations && productDetails.aisleLocations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Store Location
                  </h3>
                  {(() => {
                    const groupedByAisle = productDetails.aisleLocations.reduce((acc, aisle) => {
                      const aisleNum = aisle.number || "Unknown";
                      if (!acc[aisleNum]) {
                        acc[aisleNum] = [];
                      }
                      acc[aisleNum].push(aisle);
                      return acc;
                    }, {} as Record<string, typeof productDetails.aisleLocations>);

                    return Object.entries(groupedByAisle).map(([aisleNum, locations]) => (
                      <div key={aisleNum} className="space-y-1">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                          <span>📍</span>
                          <span>
                            {parseInt(aisleNum) >= 100 && locations[0]?.description
                              ? locations[0].description
                              : `Aisle ${aisleNum}`}
                          </span>
                        </div>
                        <div className="ml-6 space-y-1">
                          {locations.map((aisle, idx) => {
                            const locationParts: string[] = [];
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
                            return (
                              <div
                                key={idx}
                                className="text-sm text-gray-600 dark:text-gray-400"
                              >
                                {locationText || "Location details"}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Categories */}
              {productDetails.categories && productDetails.categories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Categories
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {productDetails.categories.map((category, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* UPC */}
              {upc && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowBarcode(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
                  >
                    <Barcode className="w-5 h-5" />
                    UPC: {upc}
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => setShowJson(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
                >
                  <Code className="w-5 h-5" />
                  View JSON Data
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* JSON Viewer Modal */}
      <JsonViewerModal
        data={productDetails}
        title={`Product JSON: ${productDetails.description}`}
        isOpen={showJson}
        onClose={() => setShowJson(false)}
      />

      {/* Barcode Modal */}
      {upc && (() => {
        const normalized = normalizeUPC(upc);
        const barcodeUrl = normalized ? getBarcodeUrl(upc) : null;
        const displayCode = normalized?.code || upc;

        return (
          <Modal
            isOpen={showBarcode}
            onClose={() => setShowBarcode(false)}
            title={`Barcode: ${displayCode}`}
          >
            <div className="space-y-4">
              {barcodeUrl ? (
                <div className="text-center">
                  <div className="bg-white p-4 rounded-lg inline-block">
                    <img
                      src={barcodeUrl}
                      alt={`Barcode for ${displayCode}`}
                      className="max-w-full h-auto"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = `<div class="text-gray-600 dark:text-gray-400">Barcode unavailable for UPC: ${displayCode}</div>`;
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-600 dark:text-gray-400">
                  Unable to generate barcode for UPC: {upc}
                </div>
              )}
              <div className="text-center">
                <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {displayCode}
                </p>
                {normalized && normalized.code !== upc && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Original: {upc} (check digit corrected)
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(displayCode);
                }}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
              >
                Copy UPC
              </button>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
