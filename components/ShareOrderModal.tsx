"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "./ui/Modal";

interface ShareOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  orderId?: string;
  orderDetails?: {
    miles?: number;
    money?: number;
    milesToMoneyRatio?: number;
    appName?: string;
  };
  userLatitude?: number;
  userLongitude?: number;
  userAddress?: string;
  onAddressSaved?: () => void;
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
  orderId,
  orderDetails,
  userLatitude,
  userLongitude,
  userAddress,
  onAddressSaved,
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

  const searchAddresses = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    setAddresses([]);

    try {
      let nominatimUrl: string;
      // Extract city, state, and zip code from userAddress
      // Format: "2017 Belmont St\nAshland KY 41101\nUnited States"
      let location = "Ashland Kentucky 41101"; // Fallback city, state, and zip code for filtering
      
      if (userAddress) {
        // Split address by newlines and find the line with city, state, and zip code
        const addressLines = userAddress.split('\n').map(line => line.trim()).filter(line => line);
        // Look for line matching pattern: "City State ZipCode" (e.g., "Ashland KY 41101")
        const cityStateZipLine = addressLines.find(line => {
          // Match pattern: word(s) + state abbreviation (2 letters) + 5-digit zip code
          return /\w+.*\s+[A-Z]{2}\s+\d{5}/.test(line);
        });
        
        if (cityStateZipLine) {
          location = cityStateZipLine;
        } else {
          // Fallback: use the full address if pattern not found
          location = userAddress.replace(/\n/g, " ").trim();
        }
      }
      
      // Use location-based search if we have coordinates
      if (userLatitude !== undefined && userLongitude !== undefined) {
        // Search for restaurants near the user's location with location filter
        // Nominatim nearby search: search for restaurants within ~5km radius
        // Using lat/lon parameters centers the search on these coordinates
        // Include address with zipcode in search query to limit results to local area
        const searchQuery = restaurantName.trim() 
          ? encodeURIComponent(`${restaurantName.trim()} ${location}`)
          : encodeURIComponent(`restaurant ${location}`);
        nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&lat=${userLatitude}&lon=${userLongitude}&radius=5000&limit=20&addressdetails=1`;
      } else if (userAddress) {
        // Use userAddress (with zipcode) for address-based search
        const searchQuery = restaurantName.trim() 
          ? encodeURIComponent(`${restaurantName.trim()} ${location}`)
          : encodeURIComponent(`restaurant ${location}`);
        nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=20&addressdetails=1`;
      } else if (restaurantName.trim()) {
        // Last resort: just search by restaurant name with location
        const searchQuery = encodeURIComponent(`${restaurantName.trim()} ${location}`);
        nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=20&addressdetails=1`;
      } else {
        setSearchError("No location or restaurant name available");
        setSearching(false);
        return;
      }
      
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
        setSearchError("No restaurants found near this location");
        return;
      }

      // Filter for restaurant/amenity types (API should already filter by location)
      const restaurantTypes = ['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub'];
      const filteredResults = data
        .filter((result: any) => {
          const type = result.type || '';
          const category = result.category || '';
          const classType = result.class || '';
          return restaurantTypes.some(rt => 
            type.toLowerCase().includes(rt) || 
            category.toLowerCase().includes(rt) ||
            classType.toLowerCase().includes(rt) ||
            result.display_name.toLowerCase().includes(restaurantName.toLowerCase())
          );
        })
        .slice(0, 10); // Limit to 10 results

      if (filteredResults.length === 0) {
        // If no restaurant-specific results, show all results (should already be filtered by location from API)
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
  }, [restaurantName, userLatitude, userLongitude, userAddress]);

  // Auto-search when modal opens
  useEffect(() => {
    if (isOpen) {
      searchAddresses();
    } else {
      // Reset state when modal closes
      setAddresses([]);
      setSearchError(null);
      setSearching(false);
    }
  }, [isOpen, searchAddresses]);

  const handleShareAddress = async (address: string) => {
    // Save address to order if orderId is provided
    if (orderId) {
      try {
        const response = await fetch("/api/delivery-orders", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: orderId,
            restaurantAddress: address,
          }),
        });

        if (!response.ok) {
          console.error("Failed to save restaurant address");
        } else {
          // Notify parent that address was saved
          if (onAddressSaved) {
            onAddressSaved();
          }
        }
      } catch (err) {
        console.error("Error saving restaurant address:", err);
      }
    }

    // Share the address
    handleShare(address);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Restaurant Address">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Restaurant: {restaurantName}
          </h3>
        </div>

        {/* Address Search Results */}
        <div>
          {searchError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-2">
              <div className="text-sm text-red-600 dark:text-red-400">{searchError}</div>
            </div>
          )}

          {searching && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div>
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Searching nearby restaurants...</span>
            </div>
          )}

          {!searching && addresses.length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Found Restaurants:
              </h3>
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

          {!searching && addresses.length === 0 && !searchError && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              No restaurants found. Try again later.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
