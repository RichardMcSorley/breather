"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Upload, Loader2, CheckCircle2, XCircle, Image as ImageIcon } from "lucide-react";

interface OCRResult {
  success: boolean;
  miles: number;
  money: number;
  restaurantName: string;
  rawOcrText: string;
  metadata?: Record<string, any>;
  error?: string;
  details?: string;
  processingTimeMs?: number;
  processingTimeSeconds?: string;
  // Additional extracted fields
  extractedData?: {
    earnings?: number;
    tip?: number;
    baseEarnings?: number;
    distance?: number;
    estimatedTime?: number;
    deliveryType?: string;
    pickupAddress?: string;
    deliveryAddress?: string;
    deliveryDeadline?: string;
    isGuaranteed?: boolean;
    isExclusive?: boolean;
    hasBoost?: boolean;
    requiresCustomerVerification?: boolean;
    numberOfItems?: number;
    numberOfUnits?: number;
    numberOfDeliveries?: number;
    paymentMethod?: string;
  };
}

type ScreenshotType = "order" | "restaurant" | "customer" | "customer-pickup";

export default function TestOrderPage() {
  const { data: session } = useSession();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [screenshotType, setScreenshotType] = useState<ScreenshotType>("order");
  const [appName, setAppName] = useState<string>("TEST");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user?.id;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be less than 10MB");
      return;
    }

    setError(null);
    setResult(null);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSelectedImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleProcess = async () => {
    if (!selectedImage) {
      setError("Please select an image first");
      return;
    }

    // Validate required fields for database operations
    if ((screenshotType === "order" || screenshotType === "customer") && !userId) {
      setError("Please sign in to process screenshots");
      return;
    }

    if ((screenshotType === "order" || screenshotType === "customer") && !appName.trim()) {
      setError("Please enter an app name");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      // Route to appropriate API based on screenshot type
      let apiUrl = "";
      let requestBody: any = {
        screenshot: selectedImage,
      };

      if (screenshotType === "order") {
        apiUrl = "/api/delivery-orders/order-screenshot-gemini-order";
        requestBody.userId = userId;
        requestBody.appName = appName.trim();
      } else if (screenshotType === "customer") {
        apiUrl = "/api/delivery-orders/customer-screenshot-gemini";
        requestBody.userId = userId;
        requestBody.appName = appName.trim();
      } else {
        // Restaurant and customer-pickup not yet supported with database operations
        setError(`${screenshotType} screenshots are not yet supported. Please use "order" or "customer" types.`);
        setIsProcessing(false);
        return;
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to process image");
      }

      // Map response to OCRResult format
      setResult({
        success: data.success,
        miles: data.miles || 0,
        money: data.money || 0,
        restaurantName: data.restaurantName || "unknown",
        rawOcrText: data.rawOcrText || data.rawResponse || "",
        metadata: data.metadata || {},
        processingTimeMs: data.processingTimeMs,
        processingTimeSeconds: data.processingTimeSeconds,
        extractedData: data.metadata?.extractedData || data.customer,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setSelectedImage(null);
    setResult(null);
    setError(null);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
          Test Order OCR (Gemini 2.5 Flash)
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Upload screenshots to test Google Gemini 2.5 Flash API extraction. Order and customer screenshots will be saved to the database.
          <br />
          <span className="text-sm text-gray-500 dark:text-gray-500 mt-2 block">
            Note: Uses Gemini 2.5 Flash with structured JSON outputs. Requires GEMINI_API_KEY environment variable. Sign in required for database operations.
          </span>
        </p>

        <Card className="mb-6">
          <div className="space-y-4">
            {/* Screenshot Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Screenshot Type
              </label>
              <select
                value={screenshotType}
                onChange={(e) => setScreenshotType(e.target.value as ScreenshotType)}
                disabled={isProcessing}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400"
              >
                <option value="order">Order Screenshot</option>
                <option value="customer">Customer Screenshot</option>
                <option value="restaurant" disabled>Restaurant Screenshot (Not Available)</option>
                <option value="customer-pickup" disabled>Customer Pickup Screenshot (Not Available)</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {screenshotType === "order" && "Extract order details: earnings, distance, restaurants, etc. Saves to database."}
                {screenshotType === "customer" && "Extract customer name, delivery address, and instructions. Saves to database."}
                {(screenshotType === "restaurant" || screenshotType === "customer-pickup") && "This screenshot type is not yet supported."}
              </p>
            </div>

            {/* App Name Input (required for order and customer) */}
            {(screenshotType === "order" || screenshotType === "customer") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  App Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  disabled={isProcessing}
                  placeholder="e.g., Uber Driver, Dasher, GH Drivers"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Required for database operations
                </p>
              </div>
            )}

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Screenshot
              </label>
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={isProcessing}
                  />
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-green-500 dark:hover:border-green-400 transition-colors">
                    {selectedImage ? (
                      <div className="space-y-2">
                        <img
                          src={selectedImage}
                          alt="Selected"
                          className="max-h-64 mx-auto rounded-lg"
                        />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Image selected. Click to change.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-12 h-12 mx-auto text-gray-400" />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          PNG, JPG, GIF up to 10MB
                        </p>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleProcess}
                disabled={!selectedImage || isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Process Image
                  </>
                )}
              </Button>
              {selectedImage && (
                <Button
                  onClick={handleClear}
                  disabled={isProcessing}
                  variant="secondary"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">Error</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              </div>
            )}

            {/* Results Display */}
            {result && (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">
                          OCR Results
                        </p>
                        {result.metadata?.screenshotType && (
                          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                            Type: {result.metadata.screenshotType}
                          </p>
                        )}
                      </div>
                      {result.processingTimeMs && (
                        <p className="text-xs text-green-700 dark:text-green-300">
                          ⏱️ {result.processingTimeSeconds || (result.processingTimeMs / 1000).toFixed(2)}s
                        </p>
                      )}
                    </div>
                    <div className="space-y-3">
                      {/* Extracted Data */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {result.metadata?.screenshotType === "order" && (
                          <>
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Miles</p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                {result.miles > 0 ? result.miles.toFixed(2) : "N/A"}
                              </p>
                            </div>
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Money</p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                {result.money > 0 ? `$${result.money.toFixed(2)}` : "N/A"}
                              </p>
                            </div>
                          </>
                        )}
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {result.metadata?.screenshotType === "restaurant" ? "Restaurant" : 
                             result.metadata?.screenshotType === "customer" ? "Customer" :
                             result.metadata?.screenshotType === "customer-pickup" ? "Customer" : "Restaurant"}
                          </p>
                          <p className="text-lg font-semibold text-gray-900 dark:text-white break-words">
                            {result.restaurantName && result.restaurantName !== "unknown"
                              ? result.restaurantName
                              : "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Additional Extracted Fields */}
                      {result.metadata?.extractedData && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
                            Additional Extracted Fields
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {/* Order-specific fields */}
                            {result.metadata.extractedData.estimatedTime && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Estimated Time: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.estimatedTime} min
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.pickupAddress && (
                              <div className="break-words">
                                <span className="text-gray-500 dark:text-gray-400">Pickup Address: </span>
                                <span className="font-medium text-gray-900 dark:text-white break-words">
                                  {result.metadata.extractedData.pickupAddress}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.deliveryAddress && (
                              <div className="break-words">
                                <span className="text-gray-500 dark:text-gray-400">Delivery Address: </span>
                                <span className="font-medium text-gray-900 dark:text-white break-words">
                                  {result.metadata.extractedData.deliveryAddress}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.address && (
                              <div className="break-words">
                                <span className="text-gray-500 dark:text-gray-400">Address: </span>
                                <span className="font-medium text-gray-900 dark:text-white break-words">
                                  {result.metadata.extractedData.address}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.deliveryDeadline && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Deadline: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.deliveryDeadline}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.pickupTime && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Pickup Time: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.pickupTime}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.customerName && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Customer Name: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.customerName}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.deliveryType && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Delivery Type: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.deliveryType}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.requiresDeliveryPIN !== undefined && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Requires PIN: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.requiresDeliveryPIN ? "Yes" : "No"}
                                </span>
                              </div>
                            )}
                            {/* Restaurants array for order screenshots */}
                            {result.metadata.extractedData.restaurants && Array.isArray(result.metadata.extractedData.restaurants) && (
                              <div className="col-span-full">
                                <span className="text-gray-500 dark:text-gray-400 block mb-2">Restaurants:</span>
                                <div className="space-y-2">
                                  {result.metadata.extractedData.restaurants.map((r: any, idx: number) => (
                                    <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                                      <div className="font-medium text-gray-900 dark:text-white">
                                        {r.restaurantName || "Unknown"}
                                      </div>
                                      {r.deliveryType && (
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          Type: {r.deliveryType}
                                        </div>
                                      )}
                                      {r.itemCount && (
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          Items: {r.itemCount}
                                        </div>
                                      )}
                                      {r.units && (
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          Units: {r.units}
                                        </div>
                                      )}
                                      {r.hasRestrictedItems !== undefined && (
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          Restricted Items: {r.hasRestrictedItems ? "Yes" : "No"}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {result.metadata.extractedData.phoneNumber && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Phone: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.phoneNumber}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.orderNumber && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Order Number: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.orderNumber}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.deliveryInstructions && (
                              <div className="break-words">
                                <span className="text-gray-500 dark:text-gray-400">Delivery Instructions: </span>
                                <span className="font-medium text-gray-900 dark:text-white break-words">
                                  {result.metadata.extractedData.deliveryInstructions}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.pickupInstructions && (
                              <div className="break-words">
                                <span className="text-gray-500 dark:text-gray-400">Pickup Instructions: </span>
                                <span className="font-medium text-gray-900 dark:text-white break-words">
                                  {result.metadata.extractedData.pickupInstructions}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.apartmentNumber && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Apartment/Unit: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.apartmentNumber}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.gateCode && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Gate Code: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.gateCode}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.tip && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Tip: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  ${result.metadata.extractedData.tip.toFixed(2)}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.numberOfItems && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Items: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.numberOfItems}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.numberOfDeliveries && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Deliveries: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {result.metadata.extractedData.numberOfDeliveries}
                                </span>
                              </div>
                            )}
                            {result.metadata.extractedData.isExclusive && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Exclusive: </span>
                                <span className="font-medium text-green-600 dark:text-green-400">Yes</span>
                              </div>
                            )}
                            {result.metadata.extractedData.hasBoost && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Boost: </span>
                                <span className="font-medium text-orange-600 dark:text-orange-400">Yes</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Raw OCR Text */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                          Raw OCR Text
                        </p>
                        <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                          {result.rawOcrText || "No text extracted"}
                        </pre>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}

