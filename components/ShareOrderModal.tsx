"use client";

import { useState, useEffect, useCallback } from "react";
import { Coffee, Utensils, Pizza, Beer, ShoppingBag, Store } from "lucide-react";
import Modal from "./ui/Modal";
import { formatAddress } from "@/lib/address-formatter";

interface ShareOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  orderId?: string;
  transactionId?: string;
  orderDetails?: {
    miles?: number;
    money?: number;
    milesToMoneyRatio?: number;
    appName?: string;
  };
  userLatitude?: number;
  userLongitude?: number;
  userAddress?: string;
  onAddressSaved?: (address?: string, placeId?: string, lat?: number, lon?: number, restaurantName?: string) => void;
  shouldUpdateStep?: boolean; // Only update step when true (e.g., from "Link Restaurant" button)
  skipSave?: boolean; // Skip saving to main order when true (useful for editing additional restaurants)
}

interface AddressResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  place_id?: string;
  name?: string;
}

export default function ShareOrderModal({
  isOpen,
  onClose,
  restaurantName,
  orderId,
  transactionId,
  orderDetails,
  userLatitude,
  userLongitude,
  userAddress,
  onAddressSaved,
  shouldUpdateStep = false,
  skipSave = false,
}: ShareOrderModalProps) {
  const [searching, setSearching] = useState(false);
  const [addresses, setAddresses] = useState<AddressResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Helper function to extract location from userAddress
  const extractLocation = useCallback((): string => {
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
    
    return location;
  }, [userAddress]);

  const searchAddresses = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    setAddresses([]);

    try {
      // Use the search query from the input, or default to restaurant name + location
      const query = searchQuery.trim() || `${restaurantName.trim()} ${extractLocation()}`;
      
      // Try Google Places API first
      let googleResults: AddressResult[] = [];
          try {
            const placesParams = new URLSearchParams({
              query,
              type: "restaurant", // Filter for restaurants
              ...(userLatitude !== undefined && userLongitude !== undefined && {
                lat: userLatitude.toString(),
                lon: userLongitude.toString(),
                radius: "5000",
              }),
            });

            const placesResponse = await fetch(`/api/places/search?${placesParams.toString()}`);
        
        if (placesResponse.ok) {
          const placesData = await placesResponse.json();
          if (placesData.results && placesData.results.length > 0) {
            googleResults = placesData.results.slice(0, 10);
          }
        }
      } catch (googleErr) {
        console.log("Google Places API failed, falling back to Nominatim:", googleErr);
      }

      // If Google Places returned results, use them
      if (googleResults.length > 0) {
        setAddresses(googleResults);
        return;
      }

      // Fallback to Nominatim
      const encodedQuery = encodeURIComponent(query);
      let nominatimUrl: string;
      
      // Use location-based search if we have coordinates
      if (userLatitude !== undefined && userLongitude !== undefined) {
        // Search for restaurants near the user's location with location filter
        // Nominatim nearby search: search for restaurants within ~5km radius
        nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&lat=${userLatitude}&lon=${userLongitude}&radius=5000&limit=20&addressdetails=1`;
      } else {
        // Use address-based search
        nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=20&addressdetails=1`;
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
  }, [searchQuery, restaurantName, userLatitude, userLongitude, userAddress, extractLocation]);

  // Initialize search query and auto-search when modal opens
  useEffect(() => {
    if (isOpen) {
      const extractedLocation = extractLocation();
      const initialQuery = `${restaurantName} ${extractedLocation}`;
      setSearchQuery(initialQuery);
      // Auto-search with the initial query
      const performSearch = async () => {
        setSearching(true);
        setSearchError(null);
        setAddresses([]);

        try {
          // Try Google Places API first
          let googleResults: AddressResult[] = [];
          try {
            const placesParams = new URLSearchParams({
              query: initialQuery,
              type: "restaurant", // Filter for restaurants
              ...(userLatitude !== undefined && userLongitude !== undefined && {
                lat: userLatitude.toString(),
                lon: userLongitude.toString(),
                radius: "5000",
              }),
            });

            const placesResponse = await fetch(`/api/places/search?${placesParams.toString()}`);
            
            if (placesResponse.ok) {
              const placesData = await placesResponse.json();
              if (placesData.results && placesData.results.length > 0) {
                googleResults = placesData.results.slice(0, 10);
              }
            }
          } catch (googleErr) {
            console.log("Google Places API failed, falling back to Nominatim:", googleErr);
          }

          // If Google Places returned results, use them
          if (googleResults.length > 0) {
            setAddresses(googleResults);
            setSearching(false);
            return;
          }

          // Fallback to Nominatim
          const encodedQuery = encodeURIComponent(initialQuery);
          let nominatimUrl: string;
          
          // Use location-based search if we have coordinates
          if (userLatitude !== undefined && userLongitude !== undefined) {
            nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&lat=${userLatitude}&lon=${userLongitude}&radius=5000&limit=20&addressdetails=1`;
          } else {
            nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=20&addressdetails=1`;
          }
          
          // Add small delay to respect rate limit (1 request per second)
          await new Promise((resolve) => setTimeout(resolve, 1100));
          
          const response = await fetch(nominatimUrl, {
            headers: {
              "User-Agent": "Breather App",
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

          // Filter for restaurant/amenity types
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
            .slice(0, 10);

          if (filteredResults.length === 0) {
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
      
      performSearch();
    } else {
      // Reset state when modal closes
      setAddresses([]);
      setSearchError(null);
      setSearching(false);
      setSearchQuery("");
    }
  }, [isOpen, restaurantName, extractLocation, userLatitude, userLongitude]);


  const handleSelectAddress = async (addressResult: AddressResult) => {
    // Extract restaurant name from the address (first part before comma)
    const displayParts = addressResult.display_name.split(',').map(p => p.trim());
    const extractedRestaurantName = displayParts[0] || restaurantName;
    
    // Remove restaurant name from the beginning of the address if present
    let cleanedAddress = addressResult.display_name;
    if (extractedRestaurantName && addressResult.display_name.startsWith(extractedRestaurantName)) {
      // Remove restaurant name and any following comma/space
      cleanedAddress = addressResult.display_name.substring(extractedRestaurantName.length).replace(/^[,\s]+/, "").trim();
    }
    
    // Format the address before saving
    const formattedAddress = formatAddress(cleanedAddress);
    
    // Parse lat/lon from strings to numbers
    const lat = addressResult.lat ? parseFloat(addressResult.lat) : undefined;
    const lon = addressResult.lon ? parseFloat(addressResult.lon) : undefined;
    
    // Save address, place_id, lat, lon and restaurant name to order if orderId is provided and skipSave is false
    if (orderId && !skipSave) {
      try {
        const response = await fetch("/api/delivery-orders", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: orderId,
            restaurantName: extractedRestaurantName,
            restaurantAddress: formattedAddress,
            restaurantPlaceId: addressResult.place_id,
            restaurantLat: lat,
            restaurantLon: lon,
          }),
        });

        if (!response.ok) {
          console.error("Failed to save restaurant address");
          return;
        }

        // Only update transaction step if shouldUpdateStep is true (from "Link Restaurant" button)
        if (shouldUpdateStep && transactionId) {
          try {
            await fetch(`/api/transactions/${transactionId}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                step: "NAV_TO_RESTERAUNT",
              }),
            });
          } catch (err) {
            console.error("Error updating transaction step:", err);
          }
        }
        
        // Notify parent that address was saved
        if (onAddressSaved) {
          onAddressSaved(formattedAddress, addressResult.place_id, lat, lon, extractedRestaurantName);
        } else {
          // Close the modal only if no custom handler
          onClose();
        }
      } catch (err) {
        console.error("Error saving restaurant address:", err);
      }
    } else {
      // If no orderId or skipSave is true, just call the callback with the address info
      if (onAddressSaved) {
        onAddressSaved(formattedAddress, addressResult.place_id, lat, lon, extractedRestaurantName);
      }
    }
  };

  const getTypeIcon = (type: string) => {
    const typeLower = type.toLowerCase();
    if (typeLower.includes('cafe') || typeLower.includes('coffee')) {
      return <Coffee className="w-4 h-4" />;
    } else if (typeLower.includes('fast_food') || typeLower.includes('fast food')) {
      return <Pizza className="w-4 h-4" />;
    } else if (typeLower.includes('restaurant')) {
      return <Utensils className="w-4 h-4" />;
    } else if (typeLower.includes('bar') || typeLower.includes('pub')) {
      return <Beer className="w-4 h-4" />;
    } else if (typeLower.includes('shop') || typeLower.includes('store')) {
      return <ShoppingBag className="w-4 h-4" />;
    } else {
      return <Store className="w-4 h-4" />;
    }
  };

  const formatTypeText = (type: string): string => {
    // Replace underscores with spaces and capitalize each word
    return type
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const handleSkip = async () => {
    if (!transactionId || !shouldUpdateStep) return;

    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          step: "NAV_TO_RESTERAUNT",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to skip step" }));
        throw new Error(errorData.error || "Failed to skip step");
      }

      if (onAddressSaved) {
        onAddressSaved();
      }
      onClose();
    } catch (err) {
      console.error("Error skipping step:", err);
      alert(err instanceof Error ? err.message : "Failed to skip step");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Restaurant: ${restaurantName}`}>
      <div className="space-y-4">
        {/* Search Input */}
        <div>
          <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search:
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !searching) {
                    searchAddresses();
                  }
                }}
                placeholder="Search address or restaurant name"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
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
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                NEARBY RESULTS
              </h3>
              {addresses.map((address, index) => {
                // Extract restaurant name from display_name (usually first part before comma)
                const displayParts = address.display_name.split(',').map(p => p.trim());
                const restaurantNameFromResult = displayParts[0] || '';
                
                // Format the full address from the search result (skip restaurant name if it's the first part)
                let addressParts = displayParts;
                if (restaurantNameFromResult && restaurantNameFromResult.toLowerCase() === restaurantName.toLowerCase()) {
                  addressParts = displayParts.slice(1);
                }
                const formattedAddress = formatAddress(addressParts.join(', '));
                
                return (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    {/* Restaurant Name at top - left aligned */}
                    <div className="font-bold text-base text-gray-900 dark:text-white mb-2 text-left">
                      {restaurantNameFromResult || restaurantName}
                    </div>
                    
                    {/* Address below restaurant name - left aligned */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 text-left">
                      {formattedAddress}
                    </div>
                    
                    {/* Icon and type - left aligned */}
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3 text-left">
                      {getTypeIcon(address.type)}
                      <span>{formatTypeText(address.type)}</span>
                    </div>
                    
                    {/* Select button right-aligned */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSelectAddress(address)}
                        className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[40px] transition-colors"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!searching && addresses.length === 0 && !searchError && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              No restaurants found. Try again later.
            </div>
          )}
        </div>

        {/* Skip Step button at bottom */}
        {transactionId && shouldUpdateStep && (
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSkip}
              className="px-6 py-2 text-base font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-md min-h-[44px]"
            >
              Skip Step
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
