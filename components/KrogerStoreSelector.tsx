"use client";

import { useState, useEffect } from "react";
import { MapPin, Search, Edit2 } from "lucide-react";
import Input from "./ui/Input";
import Card from "./ui/Card";
import { KrogerLocation } from "@/lib/types/kroger";

interface KrogerStoreSelectorProps {
  selectedLocation: KrogerLocation | null;
  onLocationSelected: (location: KrogerLocation) => void;
}

export default function KrogerStoreSelector({
  selectedLocation,
  onLocationSelected,
}: KrogerStoreSelectorProps) {
  const [zipCode, setZipCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [locations, setLocations] = useState<KrogerLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // Reset change mode when a location is selected
  useEffect(() => {
    if (selectedLocation) {
      setIsChanging(false);
      setLocations([]);
      setZipCode("");
      setError(null);
    }
  }, [selectedLocation]);

  const handleSearch = async () => {
    if (!zipCode.trim()) {
      setError("Please enter a zip code");
      return;
    }

    // Basic zip code validation (5 digits)
    if (!/^\d{5}$/.test(zipCode.trim())) {
      setError("Please enter a valid 5-digit zip code");
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/kroger/locations/search?zipCode=${encodeURIComponent(zipCode.trim())}&limit=10`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to search locations" }));
        throw new Error(errorData.error || "Failed to search locations");
      }

      const data = await response.json();
      setLocations(data.data || []);
      
      if (data.data && data.data.length === 0) {
        setError("No Kroger stores found near this zip code");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search locations");
      setLocations([]);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleLocationSelect = (location: KrogerLocation) => {
    onLocationSelected(location);
    setIsChanging(false);
  };

  return (
    <Card className="p-4 mb-4">
      <div className="space-y-4">
        {/* Show selected store when not changing */}
        {selectedLocation && !isChanging && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Selected Store
            </label>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-start gap-2">
                <MapPin className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {selectedLocation.name || "Kroger Store"}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {selectedLocation.address.addressLine1}
                    <br />
                    {selectedLocation.address.city}, {selectedLocation.address.state}{" "}
                    {selectedLocation.address.zipCode}
                  </div>
                </div>
                <button
                  onClick={() => setIsChanging(true)}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm flex-shrink-0"
                >
                  <Edit2 className="w-4 h-4" />
                  Change
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show search when no store selected or when changing */}
        {(!selectedLocation || isChanging) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {isChanging ? "Change Store Location" : "Select Store Location"}
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter zip code (e.g., 41101)"
                value={zipCode}
                onChange={(e) => {
                  setZipCode(e.target.value);
                  setError(null);
                }}
                onKeyPress={handleKeyPress}
                maxLength={5}
                className="flex-1"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                {searching ? "Searching..." : "Search"}
              </button>
              {isChanging && (
                <button
                  onClick={() => {
                    setIsChanging(false);
                    setLocations([]);
                    setZipCode("");
                    setError(null);
                  }}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}

        {/* Show store list only when searching/changing and results are available */}
        {(!selectedLocation || isChanging) && locations.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Select a store:
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {locations.map((location) => (
                <button
                  key={location.locationId}
                  onClick={() => handleLocationSelect(location)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors min-h-[44px] ${
                    selectedLocation?.locationId === location.locationId
                      ? "bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-500"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {location.name || "Kroger Store"}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {location.address.addressLine1}
                        <br />
                        {location.address.city}, {location.address.state}{" "}
                        {location.address.zipCode}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

