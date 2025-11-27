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
  }>;
}

export default function CustomerLocationMap({ entries }: CustomerLocationMapProps) {
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const geocodeAddresses = async () => {
      if (entries.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const geocodedLocations: CustomerLocation[] = [];

        // Geocode each address with a delay to respect rate limits (1 req/sec)
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry.customerAddress || entry.customerAddress.trim() === "") {
            continue;
          }

          try {
            // Add delay between requests (except first one)
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 1100)); // 1.1 seconds between requests
            }

            const response = await fetch(
              `/api/geocode?address=${encodeURIComponent(entry.customerAddress)}`
            );

            if (!response.ok) {
              console.warn(`Failed to geocode address: ${entry.customerAddress}`);
              continue;
            }

            const data = await response.json();

            if (data.lat && data.lon) {
              geocodedLocations.push({
                id: entry._id,
                name: entry.customerName || "Unknown",
                address: entry.customerAddress,
                lat: data.lat,
                lon: data.lon,
              });
            }
          } catch (err) {
            console.warn(`Error geocoding address ${entry.customerAddress}:`, err);
            continue;
          }
        }

        setLocations(geocodedLocations);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load map data");
      } finally {
        setLoading(false);
      }
    };

    geocodeAddresses();
  }, [entries]);

  if (loading) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading map...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="text-red-600 dark:text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <p className="text-gray-600 dark:text-gray-400">No locations found to display on map</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <MapContent locations={locations} />
    </div>
  );
}

