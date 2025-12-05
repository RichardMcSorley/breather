"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin } from "lucide-react";
import Modal from "./ui/Modal";
import { formatAddress } from "@/lib/address-formatter";

interface SearchAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialQuery?: string;
  userLatitude?: number;
  userLongitude?: number;
  userAddress?: string;
  onAddressSelected: (address: string, placeId?: string, lat?: number, lon?: number) => void;
}

interface AddressResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  place_id?: string;
  name?: string;
}

export default function SearchAddressModal({
  isOpen,
  onClose,
  title,
  initialQuery = "",
  userLatitude,
  userLongitude,
  userAddress,
  onAddressSelected,
}: SearchAddressModalProps) {
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
      // Use the search query from the input, or default to location
      const query = searchQuery.trim() || extractLocation();
      
      // Try Google Places API first
      let googleResults: AddressResult[] = [];
      try {
        const placesParams = new URLSearchParams({
          query,
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
        // Search for addresses near the user's location with location filter
        // Nominatim nearby search: search for addresses within ~5km radius
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
        setSearchError("No addresses found near this location");
        return;
      }

      // Show all results (limit to 10)
      setAddresses(data.slice(0, 10));
    } catch (err) {
      console.error("Address search error:", err);
      setSearchError(err instanceof Error ? err.message : "Failed to search addresses");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, userLatitude, userLongitude, userAddress, extractLocation]);

  // Initialize search query and auto-search when modal opens
  useEffect(() => {
    if (isOpen) {
      const extractedLocation = extractLocation();
      const initialQueryValue = initialQuery || extractedLocation;
      setSearchQuery(initialQueryValue);
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
              query: initialQueryValue,
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
          const encodedQuery = encodeURIComponent(initialQueryValue);
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
            setSearchError("No addresses found near this location");
            return;
          }

          // Show all results (limit to 10)
          setAddresses(data.slice(0, 10));
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
  }, [isOpen, initialQuery, extractLocation, userLatitude, userLongitude]);

  const handleSelectAddress = (addressResult: AddressResult) => {
    // Format the address before returning
    const formattedAddress = formatAddress(addressResult.display_name);
    // Parse lat/lon from strings to numbers
    const lat = addressResult.lat ? parseFloat(addressResult.lat) : undefined;
    const lon = addressResult.lon ? parseFloat(addressResult.lon) : undefined;
    onAddressSelected(formattedAddress, addressResult.place_id, lat, lon);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
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
                placeholder="Search address"
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
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Searching addresses...</span>
            </div>
          )}

          {!searching && addresses.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                SEARCH RESULTS
              </h3>
              {addresses.map((address, index) => {
                const formattedAddress = formatAddress(address.display_name);
                
                return (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    {/* Address - left aligned */}
                    <div className="flex items-start gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-700 dark:text-gray-300 text-left flex-1">
                        {formattedAddress}
                      </div>
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
              No addresses found. Try again later.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

