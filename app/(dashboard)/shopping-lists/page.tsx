"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import KrogerStoreSelector from "@/components/KrogerStoreSelector";
import { List, ShoppingCart, ChevronRight, Trash2, Upload, Loader2 } from "lucide-react";
import { KrogerLocation } from "@/lib/types/kroger";

const STORAGE_KEY = "kroger_selected_location";

interface ShoppingList {
  _id: string;
  name: string;
  locationId: string;
  items: Array<{ found: boolean }>;
  createdAt: string;
}

export default function ShoppingListsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<KrogerLocation | null>(null);
  const [selectedApp, setSelectedApp] = useState<string>("Instacart");

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

  useEffect(() => {
    const fetchLists = async () => {
      try {
        const response = await fetch("/api/shopping-lists");
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to load shopping lists" }));
          throw new Error(errorData.error || "Failed to load shopping lists");
        }

        const data = await response.json();
        setLists(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shopping lists");
      } finally {
        setLoading(false);
      }
    };

    fetchLists();
  }, []);

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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this shopping list?")) return;

    try {
      const response = await fetch(`/api/shopping-lists/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete shopping list");
      }

      setLists(lists.filter(list => list._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete shopping list");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!selectedLocation) {
      setError("Please select a store location first");
      return;
    }

    // Validate all files are images
    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith("image/")) {
        setError("Please select only image files");
        return;
      }
    }

    setUploading(true);
    setError(null);

    try {
      // Process screenshots one at a time to avoid payload size limits
      const allItems: any[] = [];
      
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Processing screenshot ${i + 1} of ${files.length}...`);
        
        // Convert file to base64
        const base64 = await readFileAsBase64(files[i]);
        
        // Process single screenshot
        const response = await fetch("/api/shopping-lists/process-screenshot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            screenshot: base64,
            locationId: selectedLocation.locationId,
            app: selectedApp || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to process screenshot" }));
          throw new Error(errorData.error || `Failed to process screenshot ${i + 1}`);
        }

        const data = await response.json();
        if (data.items && data.items.length > 0) {
          allItems.push(...data.items);
        }
      }

      if (allItems.length === 0) {
        setError("No products found in any of the screenshots");
        return;
      }

      setUploadProgress("Creating shopping list...");

      // Create shopping list with all accumulated items
      const createResponse = await fetch("/api/shopping-lists/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Shopping List - ${new Date().toLocaleDateString()}`,
          locationId: selectedLocation.locationId,
          items: allItems,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({ error: "Failed to create shopping list" }));
        throw new Error(errorData.error || "Failed to create shopping list");
      }

      const createData = await createResponse.json();
      
      if (createData.shoppingListId || createData._id) {
        router.push(`/shopping-lists/${createData.shoppingListId || createData._id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process screenshots");
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleUploadClick = () => {
    if (!selectedLocation) {
      setError("Please select a store location first");
      return;
    }
    fileInputRef.current?.click();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <List className="w-6 h-6" />
              Shopping Lists
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Your saved shopping lists from screenshot uploads
            </p>
          </div>
        </div>

        {/* Store Selector */}
        <KrogerStoreSelector
          selectedLocation={selectedLocation}
          onLocationSelected={handleLocationSelected}
        />

        {/* App Selector and Upload Button */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              App
            </label>
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 w-fit max-w-full overflow-hidden" role="group">
              <input
                type="radio"
                name="app-selector"
                id="app-instacart"
                value="Instacart"
                checked={selectedApp === "Instacart"}
                onChange={(e) => setSelectedApp(e.target.value)}
                className="hidden"
              />
              <label
                htmlFor="app-instacart"
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                  selectedApp === "Instacart"
                    ? "bg-green-600 text-white"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                Instacart
              </label>
              
              <input
                type="radio"
                name="app-selector"
                id="app-doordash"
                value="DoorDash"
                checked={selectedApp === "DoorDash"}
                onChange={(e) => setSelectedApp(e.target.value)}
                className="hidden"
              />
              <label
                htmlFor="app-doordash"
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                  selectedApp === "DoorDash"
                    ? "bg-red-600 text-white"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                DoorDash
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={handleUploadClick}
              disabled={uploading || !selectedLocation}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                  <span className="truncate">{uploadProgress || "Processing..."}</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">Upload Screenshots (select multiple)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {lists.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <ShoppingCart className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No shopping lists yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Upload a screenshot of your Instacart shopping list to get started
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Your Lists
            </h2>
            {lists.map((list) => {
              const foundCount = list.items.filter(i => i.found).length;
              return (
                <div
                  key={list._id}
                  className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                >
                  <Link href={`/shopping-lists/${list._id}`} className="flex-1 flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <List className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {list.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {list.items.length} items • {foundCount} found • {formatDate(list.createdAt)}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </Link>
                  <button
                    onClick={() => handleDelete(list._id)}
                    className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Delete list"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
