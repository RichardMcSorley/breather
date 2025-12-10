"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import KrogerStoreSelector from "@/components/KrogerStoreSelector";
import Modal from "@/components/ui/Modal";
import { List, ShoppingCart, ChevronRight, Trash2, Upload, Loader2 } from "lucide-react";
import { KrogerLocation } from "@/lib/types/kroger";
import { useScreenshotProcessing } from "@/hooks/useScreenshotProcessing";

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
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<KrogerLocation | null>(null);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [modalSelectedApp, setModalSelectedApp] = useState<string>("");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);

  // Use shared screenshot processing hook
  const {
    uploading,
    setUploading,
    processingComplete,
    setProcessingComplete,
    processScreenshots,
    cropItems,
  } = useScreenshotProcessing({
    locationId: selectedLocation?.locationId || "",
    selectedApp: modalSelectedApp,
    selectedCustomers,
    onProgress: setUploadProgress,
    onError: setError,
  });

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

    // Validate app selection is mandatory
    if (!modalSelectedApp || modalSelectedApp.trim() === "") {
      setError("Please select an app (Instacart or DoorDash) before uploading screenshots.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate customer selection is mandatory
    if (selectedCustomers.length === 0) {
      setError("Please select at least one customer (A, B, C, or D) before uploading screenshots.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
    setProcessingComplete(false);
    setUploadProgress(`Processing 1 of ${files.length} screenshots...`);

    try {
      // Process screenshots using shared hook
      const screenshotData = await processScreenshots(files);

      if (screenshotData.length === 0) {
        setError("No products found in any of the screenshots");
        setUploading(false);
        return;
      }

      // Collect all items (items already have screenshotId from processScreenshots)
      const allItems: any[] = [];
      for (const screenshotInfo of screenshotData) {
        allItems.push(...screenshotInfo.items);
      }

      setUploadProgress("Creating shopping list...");

      // Create shopping list with items only (no screenshots to avoid payload size issues)
      // Screenshots will be added separately below
      const createResponse = await fetch("/api/shopping-lists/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Shopping List - ${new Date().toLocaleDateString()}`,
          locationId: selectedLocation.locationId,
          items: allItems,
          // Don't send screenshots here - we'll add them separately to avoid 413 errors
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({ error: "Failed to create shopping list" }));
        throw new Error(errorData.error || "Failed to create shopping list");
      }

      const createData = await createResponse.json();
      const shoppingListId = createData.shoppingListId || createData._id;

      if (!shoppingListId) {
        throw new Error("Failed to get shopping list ID after creation");
      }

      // Add screenshots separately to avoid payload size issues
      // The items endpoint will add the screenshot data but skip duplicate items
      setUploadProgress(`Adding ${screenshotData.length} screenshot(s)...`);
      for (let i = 0; i < screenshotData.length; i++) {
        const screenshotInfo = screenshotData[i];
        setUploadProgress(`Adding screenshot ${i + 1} of ${screenshotData.length}...`);
        
        // Group items by screenshotId
        const itemsForScreenshot = allItems.filter(
          item => item.screenshotId === screenshotInfo.screenshotId
        );

        // Add screenshot using the existing endpoint
        // Duplicate items will be skipped, but screenshot will be added
        const addResponse = await fetch(`/api/shopping-lists/${shoppingListId}/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: itemsForScreenshot,
            screenshotId: screenshotInfo.screenshotId,
            screenshot: screenshotInfo.screenshot,
            app: modalSelectedApp,
            customers: selectedCustomers,
          }),
        });

        if (!addResponse.ok) {
          const errorData = await addResponse.json().catch(() => ({ error: "Failed to add screenshot" }));
          throw new Error(errorData.error || `Failed to add screenshot ${i + 1}`);
        }
      }

      console.log("🚀 Starting moondream cropping process...", {
        screenshotDataCount: screenshotData.length,
        totalScreenshotItems: screenshotData.reduce((sum, s) => sum + s.items.length, 0),
        shoppingListId,
      });

      // Crop items using shared hook
      await cropItems(shoppingListId, screenshotData);

      // Refresh the lists to show the new one
      setUploadProgress("Refreshing lists...");
      const fetchLists = async () => {
        try {
          const response = await fetch("/api/shopping-lists");
          if (response.ok) {
            const data = await response.json();
            setLists(data);
          }
        } catch (err) {
          console.error("Failed to refresh lists:", err);
        }
      };
      await fetchLists();

      // Close modal and reset
      setProcessingComplete(true);
      setUploadProgress("✅ All items processed and cropped!");
      setScreenshotModalOpen(false);
      setModalSelectedApp("");
      setSelectedCustomers([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process screenshots");
      setUploading(false);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadClick = () => {
    if (!selectedLocation) {
      setError("Please select a store location first");
      return;
    }
    setScreenshotModalOpen(true);
  };

  const handleModalFileSelect = () => {
    // Validate app selection before allowing file selection
    if (!modalSelectedApp || modalSelectedApp.trim() === "") {
      setError("Please select an app (Instacart or DoorDash) before selecting photos.");
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

        {/* Upload Button */}
        <div className="flex gap-3">
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

        {/* Screenshot Upload Modal */}
        <Modal
          isOpen={screenshotModalOpen}
          onClose={() => {
            setScreenshotModalOpen(false);
            setModalSelectedApp("");
            setSelectedCustomers([]);
            setError(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }}
          title="Add Screenshot"
        >
          <div className="space-y-4">
            {/* App Selector - Mandatory */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                App <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="radio"
                  name="app-selector-modal"
                  id="app-instacart-modal"
                  value="Instacart"
                  checked={modalSelectedApp === "Instacart"}
                  onChange={(e) => {
                    setModalSelectedApp(e.target.value);
                    setError(null); // Clear error when app is selected
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="app-instacart-modal"
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors text-center ${
                    modalSelectedApp === "Instacart"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Instacart
                </label>
                
                <input
                  type="radio"
                  name="app-selector-modal"
                  id="app-doordash-modal"
                  value="DoorDash"
                  checked={modalSelectedApp === "DoorDash"}
                  onChange={(e) => {
                    setModalSelectedApp(e.target.value);
                    setError(null); // Clear error when app is selected
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="app-doordash-modal"
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors text-center ${
                    modalSelectedApp === "DoorDash"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  DoorDash
                </label>
              </div>
            </div>

            {/* Customer Selection - Mandatory */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customers <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {["A", "B", "C", "D"].map((customer) => {
                  const customerIndex = customer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
                  const isSelected = selectedCustomers.includes(customer);
                  const shouldBeSelected = selectedCustomers.some(c => {
                    const cIndex = c.charCodeAt(0) - 65;
                    return cIndex >= customerIndex;
                  });
                  
                  return (
                    <button
                      key={customer}
                      type="button"
                      onClick={() => {
                        const customers = ["A", "B", "C", "D"];
                        // Cascading selection: selecting D selects A,B,C,D, selecting B selects A,B, etc.
                        const newSelection = customers.slice(0, customerIndex + 1);
                        setSelectedCustomers(newSelection);
                        setError(null); // Clear error when customer is selected
                      }}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {customer}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {selectedCustomers.length === 0
                  ? "Select which customers you have (selecting D selects A, B, C, and D)"
                  : `Selected: ${selectedCustomers.join(", ")}`}
              </p>
            </div>

            {/* File Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Screenshots
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                disabled={uploading || !modalSelectedApp || selectedCustomers.length === 0}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {!modalSelectedApp 
                  ? "Please select an app first" 
                  : selectedCustomers.length === 0
                  ? "Please select customers first"
                  : "You can select multiple images at once"}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {uploadProgress && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                  <p className="text-sm text-blue-600 dark:text-blue-400">{uploadProgress}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setScreenshotModalOpen(false);
                  setModalSelectedApp("");
                  setError(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                disabled={uploading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
}
