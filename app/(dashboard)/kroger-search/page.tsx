"use client";

/**
 * @deprecated This page has been deprecated. 
 * Use the search functionality from the Shopping Lists page (FAB button) or individual shopping list pages instead.
 * This page will be removed in a future version.
 */
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import KrogerStoreSelector from "@/components/KrogerStoreSelector";
import KrogerSearchBar from "@/components/KrogerSearchBar";
import KrogerProductGrid from "@/components/KrogerProductGrid";
import { KrogerProduct, KrogerLocation } from "@/lib/types/kroger";

const STORAGE_KEY = "kroger_selected_location";

export default function KrogerSearchPage() {
  const [selectedLocation, setSelectedLocation] = useState<KrogerLocation | null>(null);
  const [products, setProducts] = useState<KrogerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Load selected location from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const location = JSON.parse(saved) as KrogerLocation;
          setSelectedLocation(location);
        }
      } catch (err) {
        console.error("Failed to load saved location:", err);
      }
    }
  }, []);

  // Save selected location to localStorage whenever it changes
  const handleLocationSelected = (location: KrogerLocation) => {
    setSelectedLocation(location);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      } catch (err) {
        console.error("Failed to save location:", err);
      }
    }
  };

  const handleSearch = async (
    searchTerm: string,
    searchType: "term" | "brand" | "productId"
  ) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      
      if (searchType === "term") {
        params.append("term", searchTerm);
      } else if (searchType === "brand") {
        params.append("brand", searchTerm);
      } else if (searchType === "productId") {
        params.append("productId", searchTerm);
      }

      if (selectedLocation) {
        params.append("locationId", selectedLocation.locationId);
      }

      params.append("limit", "20");

      const response = await fetch(`/api/kroger/products/search?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to search products" }));
        throw new Error(errorData.error || "Failed to search products");
      }

      const data = await response.json();
      setProducts(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Kroger Product Search
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Search for products at Kroger stores. Select a store location to see location-specific pricing and availability.
          </p>
        </div>

        <KrogerStoreSelector
          selectedLocation={selectedLocation}
          onLocationSelected={handleLocationSelected}
        />

        <KrogerSearchBar onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {hasSearched && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Search Results {products.length > 0 && `(${products.length})`}
              </h2>
              {selectedLocation && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Showing results for: {selectedLocation.address.city}, {selectedLocation.address.state}
                </p>
              )}
            </div>
            <KrogerProductGrid
              products={products}
              locationId={selectedLocation?.locationId}
              loading={loading}
            />
          </div>
        )}

        {!hasSearched && (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">
              Enter a search term above to find products
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
