"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// Dynamically import MapContent to avoid SSR issues with Leaflet
const MapContent = dynamic(
  () => import("./MapContent"),
  { ssr: false }
);

interface CustomerLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface CustomerLocationMapProps {
  entries: Array<{
    _id: string;
    customerName: string;
    customerAddress: string;
    lat?: number;
    lon?: number;
    geocodeDisplayName?: string;
  }>;
}

export default function CustomerLocationMap({ entries }: CustomerLocationMapProps) {
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [missingLocations, setMissingLocations] = useState(0);

  useEffect(() => {
    if (entries.length === 0) {
      setLocations([]);
      setMissingLocations(0);
      return;
    }

    // Use stored geocoding data instead of making API calls
    const validLocations: CustomerLocation[] = [];
    let missingCount = 0;

    entries.forEach((entry) => {
      if (!entry.customerAddress || entry.customerAddress.trim() === "") {
        return;
      }

      if (entry.lat && entry.lon) {
        validLocations.push({
          id: entry._id,
          name: entry.customerName || "Unknown",
          address: entry.customerAddress,
          lat: entry.lat,
          lon: entry.lon,
        });
      } else {
        missingCount++;
      }
    });

    setLocations(validLocations);
    setMissingLocations(missingCount);
  }, [entries]);

  if (locations.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            {missingLocations > 0
              ? `No locations available to display on map`
              : "No locations found to display on map"}
          </p>
          {missingLocations > 0 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              {missingLocations} {missingLocations === 1 ? "address" : "addresses"} could not be geocoded
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {missingLocations > 0 && (
        <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-400">
            ⚠️ {missingLocations} {missingLocations === 1 ? "address" : "addresses"} {missingLocations === 1 ? "could" : "could"} not be geocoded and {missingLocations === 1 ? "is" : "are"} not shown on the map
          </p>
        </div>
      )}
      <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <MapContent locations={locations} />
      </div>
    </div>
  );
}

