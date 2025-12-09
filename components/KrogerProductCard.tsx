"use client";

import { useState } from "react";
import { KrogerProduct } from "@/lib/types/kroger";
import Card from "./ui/Card";
import JsonViewerModal from "./JsonViewer";
import Modal from "./ui/Modal";
import { Code, ExternalLink, Barcode } from "lucide-react";

interface KrogerProductCardProps {
  product: KrogerProduct;
  locationId?: string;
}

export default function KrogerProductCard({
  product,
  locationId,
}: KrogerProductCardProps) {
  const [showJson, setShowJson] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  
  // Get the first item (usually the main product variant)
  const item = product.items?.[0];
  const price = item?.price || item?.nationalPrice;
  const image = product.images?.[0]?.sizes?.find((s) => s.size === "medium") || 
                product.images?.[0]?.sizes?.[0];
  
  // Get UPC - can be from product.upc or item.itemId
  const upc = product.upc || item?.itemId;

  const formatPrice = (amount: number | undefined) => {
    if (amount === undefined) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const stockLevel = item?.inventory?.stockLevel;
  const stockLevelColor =
    stockLevel === "HIGH"
      ? "text-green-600 dark:text-green-400"
      : stockLevel === "LOW"
      ? "text-yellow-600 dark:text-yellow-400"
      : stockLevel === "TEMPORARILY_OUT_OF_STOCK"
      ? "text-red-600 dark:text-red-400"
      : "text-gray-600 dark:text-gray-400";

  const aisleLocations = product.aisleLocations;
  
  // Calculate UPC check digit (UPC-A algorithm)
  // Algorithm: Sum of (odd positions × 3) + (even positions × 1), then 10 - (sum % 10)
  // Positions are 1-indexed: 1st, 3rd, 5th... are odd; 2nd, 4th, 6th... are even
  const calculateCheckDigit = (digits: string): string => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits[i]);
      // Position i+1: if odd (1-indexed), multiply by 3; if even, multiply by 1
      // i=0 is position 1 (odd), i=1 is position 2 (even), etc.
      if ((i + 1) % 2 === 1) {
        // Odd position (1-indexed): multiply by 3
        sum += digit * 3;
      } else {
        // Even position (1-indexed): multiply by 1
        sum += digit;
      }
    }
    const remainder = sum % 10;
    return remainder === 0 ? "0" : String(10 - remainder);
  };
  
  // Normalize and validate UPC
  const normalizeUPC = (upcCode: string): { code: string; type: string } | null => {
    // Remove any non-digit characters
    const digits = upcCode.replace(/\D/g, "");
    
    if (digits.length === 0) return null;
    
    // For 11-digit codes, calculate check digit to make it 12 (UPC-A)
    if (digits.length === 11) {
      const checkDigit = calculateCheckDigit(digits);
      return { code: digits + checkDigit, type: "UPCA" };
    }
    
    // For 12-digit codes, validate check digit
    if (digits.length === 12) {
      const codeWithoutCheck = digits.slice(0, 11);
      const providedCheck = digits[11];
      const calculatedCheck = calculateCheckDigit(codeWithoutCheck);
      
      // If check digit is wrong, recalculate it
      if (providedCheck !== calculatedCheck) {
        return { code: codeWithoutCheck + calculatedCheck, type: "UPCA" };
      }
      return { code: digits, type: "UPCA" };
    }
    
    // For 13-digit codes, validate check digit (EAN-13)
    // EAN-13 uses same algorithm but starts from position 2 (skip first digit)
    if (digits.length === 13) {
      const codeWithoutCheck = digits.slice(0, 12);
      const providedCheck = digits[12];
      // For EAN-13, calculate from positions 2-12 (skip first digit)
      const digitsForCheck = codeWithoutCheck.slice(1);
      const calculatedCheck = calculateCheckDigit(digitsForCheck);
      
      // If check digit is wrong, recalculate it
      if (providedCheck !== calculatedCheck) {
        return { code: codeWithoutCheck + calculatedCheck, type: "EAN13" };
      }
      return { code: digits, type: "EAN13" };
    }
    
    // For other lengths, try to pad or truncate to valid format
    if (digits.length < 11) {
      // Pad with zeros to make it 11 digits, then calculate check digit
      const padded = digits.padStart(11, "0");
      const checkDigit = calculateCheckDigit(padded);
      return { code: padded + checkDigit, type: "UPCA" };
    }
    
    // If longer than 13, truncate to 12 and calculate check digit
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

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Product Image */}
        {image && (
          <div className="aspect-square w-full bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
            <img
              src={image.url}
              alt={product.description}
              className="w-full h-full object-contain"
              onError={(e) => {
                // Hide image on error
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}

        {/* Product Info */}
        <div className="space-y-2">
          <div>
            {product.productPageURI ? (
              <a
                href={`https://www.kroger.com${product.productPageURI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                  {product.description}
                  <ExternalLink className="inline-block w-3 h-3 ml-1 mb-0.5" />
                </h3>
              </a>
            ) : (
              <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2">
                {product.description}
              </h3>
            )}
            {product.brand && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {product.brand}
              </p>
            )}
          </div>

          {/* Price */}
          {price && (
            <div className="flex items-baseline gap-2">
              {price.promo && price.promo !== price.regular ? (
                <>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatPrice(price.promo)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 line-through">
                    {formatPrice(price.regular)}
                  </span>
                </>
              ) : (
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatPrice(price.regular)}
                </span>
              )}
              {item?.size && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  / {item.size}
                </span>
              )}
            </div>
          )}

          {/* Stock Level */}
          {stockLevel && (
            <div className={`text-xs font-medium ${stockLevelColor}`}>
              {stockLevel === "HIGH"
                ? "In Stock"
                : stockLevel === "LOW"
                ? "Low Stock"
                : "Out of Stock"}
            </div>
          )}

          {/* Aisle Locations - Grouped by Aisle */}
          {aisleLocations && aisleLocations.length > 0 && (
            <div className="space-y-2">
              {(() => {
                // Group locations by aisle number
                const groupedByAisle = aisleLocations.reduce((acc, aisle) => {
                  const aisleNum = aisle.number || "Unknown";
                  if (!acc[aisleNum]) {
                    acc[aisleNum] = [];
                  }
                  acc[aisleNum].push(aisle);
                  return acc;
                }, {} as Record<string, typeof aisleLocations>);

                return Object.entries(groupedByAisle).map(([aisleNum, locations]) => (
                  <div key={aisleNum} className="space-y-1">
                    {/* Aisle Header */}
                    <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span className="text-gray-500 dark:text-gray-400">📍</span>
                      <span>Aisle {aisleNum}</span>
                      {locations[0]?.description && (
                        <span className="text-gray-500 dark:text-gray-400 font-normal">
                          ({locations[0].description})
                        </span>
                      )}
                    </div>
                    
                    {/* Location Details */}
                    <div className="ml-5 space-y-0.5">
                      {locations.map((aisle, idx) => {
                        const locationParts: string[] = [];
                        
                        if (aisle.shelfNumber) {
                          const shelfText = `Shelf ${aisle.shelfNumber}`;
                          // Add "from the bottom" if we have position info
                          if (aisle.shelfPositionInBay) {
                            locationParts.push(`${shelfText} (from the bottom)`);
                          } else {
                            locationParts.push(shelfText);
                          }
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
                        
                        return (
                          <div
                            key={idx}
                            className="text-xs text-gray-600 dark:text-gray-400"
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
          {product.categories && product.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {product.categories.slice(0, 2).map((category, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                >
                  {category}
                </span>
              ))}
            </div>
          )}

          {/* UPC */}
          {upc && (
            <button
              onClick={() => setShowBarcode(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              <Barcode className="w-4 h-4" />
              UPC: {upc}
            </button>
          )}

          {/* Action Buttons */}
          <div className="mt-2 space-y-2">
            <button
              onClick={() => setShowJson(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              <Code className="w-4 h-4" />
              View JSON Data
            </button>
          </div>
        </div>
      </div>

      {/* JSON Viewer Modal */}
      <JsonViewerModal
        data={product}
        title={`Product JSON: ${product.description}`}
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
                        // Fallback if barcode service fails
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
    </Card>
  );
}

