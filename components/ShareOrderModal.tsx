"use client";

import { useState } from "react";
import Modal from "./ui/Modal";

interface ShareOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  orderDetails?: {
    miles?: number;
    money?: number;
    milesToMoneyRatio?: number;
    appName?: string;
  };
}

interface AddressResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

export default function ShareOrderModal({
  isOpen,
  onClose,
  restaurantName,
  orderDetails,
}: ShareOrderModalProps) {
  const [searching, setSearching] = useState(false);
  const [addresses, setAddresses] = useState<AddressResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleShare = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          text,
        });
        onClose();
      } catch (err) {
        // User cancelled or error occurred - silently fail
        console.log("Share cancelled or failed:", err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard");
        onClose();
      } catch (err) {
        console.error("Failed to copy:", err);
        alert("Failed to copy to clipboard");
      }
    }
  };

  const handleShareRestaurantName = () => {
    handleShare(restaurantName);
  };

  const handleShareOrderDetails = () => {
    if (!orderDetails) {
      handleShareRestaurantName();
      return;
    }
    const details = [
      restaurantName,
      orderDetails.miles !== undefined && `Miles: ${orderDetails.miles.toFixed(1)}`,
      orderDetails.money !== undefined && `Money: $${orderDetails.money.toFixed(2)}`,
      orderDetails.milesToMoneyRatio !== undefined && `Ratio: $${orderDetails.milesToMoneyRatio.toFixed(2)}/mi`,
      orderDetails.appName && `App: ${orderDetails.appName}`,
    ]
      .filter(Boolean)
      .join("\n");
    handleShare(details);
  };

  const searchAddresses = async () => {
    if (!restaurantName.trim()) {
      setSearchError("Restaurant name is required");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setAddresses([]);

    try {
      // Use Nominatim API to search for places matching restaurant name
      // Nominatim requires: max 1 request per second, User-Agent header
      const searchQuery = encodeURIComponent(restaurantName.trim());
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=10&addressdetails=1`;
      
      // Add small delay to respect rate limit (1 request per second)
      await new Promise((resolve) => setTimeout(resolve, 1100));
      
      const response = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "Breather App", // Required by Nominatim
        },
      });

      if (!response.ok) {
        throw new Error("Failed to search addresses");
      }

      const data = await response.json();
      
      if (!data || data.length === 0) {
        setSearchError("No addresses found for this restaurant name");
        return;
      }

      // Filter for restaurant/amenity types and format results
      const restaurantTypes = ['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub'];
      const filteredResults = data
        .filter((result: any) => {
          const type = result.type || '';
          const category = result.category || '';
          return restaurantTypes.some(rt => 
            type.toLowerCase().includes(rt) || 
            category.toLowerCase().includes(rt) ||
            result.display_name.toLowerCase().includes(restaurantName.toLowerCase())
          );
        })
        .slice(0, 10); // Limit to 10 results

      if (filteredResults.length === 0) {
        // If no restaurant-specific results, show all results
        setAddresses(data.slice(0, 10));
      } else {
        setAddresses(filteredResults);
      }
    } catch (err) {
      console.error("Address search error:", err);
      setSearchError(err instanceof Error ? err.message : "Failed to search addresses");
    } finally {
      setSearching(false);
    }
  };

  const handleShareAddress = (address: string) => {
    handleShare(address);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Order">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Restaurant: {restaurantName}
          </h3>
        </div>

        {/* Share Options */}
        <div className="space-y-2">
          <button
            onClick={handleShareRestaurantName}
            className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-left min-h-[44px] flex items-center justify-between"
          >
            <span>Share Restaurant Name</span>
            <span>📤</span>
          </button>

          {orderDetails && (
            <button
              onClick={handleShareOrderDetails}
              className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-left min-h-[44px] flex items-center justify-between"
            >
              <span>Share Order Details</span>
              <span>📤</span>
            </button>
          )}
        </div>

        {/* Address Search Section */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Find Addresses
            </h3>
            <button
              onClick={searchAddresses}
              disabled={searching}
              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>

          {searchError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-2">
              <div className="text-sm text-red-600 dark:text-red-400">{searchError}</div>
            </div>
          )}

          {addresses.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {addresses.map((address, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="text-sm text-gray-900 dark:text-white mb-2">
                    {address.display_name}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {address.type}
                    </span>
                    <button
                      onClick={() => handleShareAddress(address.display_name)}
                      className="ml-auto px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 min-h-[32px]"
                    >
                      Share
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searching && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
