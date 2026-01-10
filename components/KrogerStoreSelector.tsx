"use client";

import { useState } from "react";
import { MapPin, Edit2, ArrowRight } from "lucide-react";
import Input from "./ui/Input";
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

  // Helper function to search locations by zip code
  const searchLocations = async (zip: string) => {
    if (!zip.trim() || !/^\d{5}$/.test(zip.trim())) {
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/kroger/locations/search?zipCode=${encodeURIComponent(zip.trim())}&limit=10`
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

  // When entering change mode, prefill zip code and fetch stores
  const handleChangeClick = () => {
    if (selectedLocation) {
      const zip = selectedLocation.address.zipCode;
      setZipCode(zip);
      setIsChanging(true);
      setError(null);
      // Automatically search for stores near the current location's zip
      searchLocations(zip);
    } else {
      setIsChanging(true);
    }
  };

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

    await searchLocations(zipCode);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleLocationSelect = (location: KrogerLocation) => {
    onLocationSelected(location);
    setIsChanging(false);
    // Update zipCode to the newly selected location's zip so it's prefilled next time
    setZipCode(location.address.zipCode);
  };

  return (
    <div className="space-y-4">
      {/* Show selected store when not changing */}
      {selectedLocation && !isChanging && (
        <div>
          <label className="block text-xs font-medium text-gray-400 dark:text-gray-400 mb-2 uppercase tracking-wide">
            STORE
          </label>
          <div className="p-3 bg-[#1a1d2e] dark:bg-[#1a1d2e] border border-gray-700 dark:border-gray-700 rounded-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-gray-400 dark:text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white dark:text-white">
                  {selectedLocation.name || "Kroger Store"}
                </div>
                <div className="text-sm text-gray-400 dark:text-gray-400 mt-1">
                  {selectedLocation.address.addressLine1}
                  <br />
                  {selectedLocation.address.city}, {selectedLocation.address.state}{" "}
                  {selectedLocation.address.zipCode}
                </div>
              </div>
              <button
                onClick={handleChangeClick}
                className="px-3 py-2 bg-[#2a2d3e] dark:bg-[#2a2d3e] text-gray-300 dark:text-gray-300 rounded-lg hover:bg-[#3a3d4e] dark:hover:bg-[#3a3d4e] transition-colors flex items-center gap-2 text-sm flex-shrink-0"
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
          <label className="block text-xs font-medium text-gray-400 dark:text-gray-400 mb-2 uppercase tracking-wide">
            STORE
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400">
              <MapPin className="w-5 h-5" />
            </div>
            <Input
              type="text"
              placeholder="Enter zip code"
              value={zipCode}
              onChange={(e) => {
                setZipCode(e.target.value);
                setError(null);
              }}
              onKeyPress={handleKeyPress}
              maxLength={5}
              className="pl-11 pr-11 bg-[#1a1d2e] dark:bg-[#1a1d2e] border-gray-700 dark:border-gray-700 text-white placeholder:text-gray-400 rounded-lg"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !zipCode.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 hover:text-white dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-400 dark:text-red-400">{error}</p>
          )}
        </div>
      )}

      {/* Show store list only when searching/changing and results are available */}
      {(!selectedLocation || isChanging) && locations.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-400 dark:text-gray-400">
            Select a store:
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {locations.map((location) => (
              <button
                key={location.locationId}
                onClick={() => handleLocationSelect(location)}
                className={`w-full text-left p-3 rounded-lg border transition-colors min-h-[44px] ${
                  selectedLocation?.locationId === location.locationId
                    ? "bg-green-900/20 border-green-500 dark:border-green-500"
                    : "bg-[#1a1d2e] dark:bg-[#1a1d2e] border-gray-700 dark:border-gray-700 hover:bg-[#2a2d3e] dark:hover:bg-[#2a2d3e]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white dark:text-white">
                      {location.name || "Kroger Store"}
                    </div>
                    <div className="text-sm text-gray-400 dark:text-gray-400 mt-1">
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
  );
}

