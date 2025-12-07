"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import KrogerStoreSelector from "@/components/KrogerStoreSelector";
import KrogerSearchBar from "@/components/KrogerSearchBar";
import KrogerProductGrid from "@/components/KrogerProductGrid";
import { KrogerProduct, KrogerLocation } from "@/lib/types/kroger";
import { Upload } from "lucide-react";

const STORAGE_KEY = "kroger_selected_location";

export default function KrogerSearchPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLocation, setSelectedLocation] = useState<KrogerLocation | null>(null);
  const [products, setProducts] = useState<KrogerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      if (!base64String) return;

      await handleScreenshotUpload(base64String);
    };
    reader.onerror = () => {
      setError("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const handleScreenshotUpload = async (screenshot: string) => {
    if (!session?.user?.id) {
      setError("You must be logged in to upload screenshots");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const response = await fetch("/api/shopping-lists/from-screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          screenshot,
          locationId: selectedLocation?.locationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to process screenshot" }));
        throw new Error(errorData.error || "Failed to process screenshot");
      }

      const data = await response.json();
      
      // Redirect to shopping list view
      if (data.shoppingListId) {
        router.push(`/shopping-lists/${data.shoppingListId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process screenshot");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
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

        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <KrogerSearchBar onSearch={handleSearch} loading={loading} />
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={handleUploadClick}
              disabled={uploading || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-2 whitespace-nowrap"
              title="Upload shopping list screenshot"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Processing..." : "Upload Screenshot"}
            </button>
          </div>
        </div>

        {(error || uploading) && (
          <div className={`p-4 border rounded-lg ${
            error 
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
          }`}>
            {error ? (
              <p className="text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="text-blue-600 dark:text-blue-400">
                Processing screenshot and searching for products...
              </p>
            )}
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
