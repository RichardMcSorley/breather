"use client";

import { useState, useEffect } from "react";
import { Search, Utensils, MapPin, Package, Pencil } from "lucide-react";
import Modal from "./ui/Modal";
import { format } from "date-fns";
import MetadataViewer from "./MetadataViewer";
import ShareOrderModal from "./ShareOrderModal";

interface LinkedTransaction {
  _id: string;
  amount: number;
  date: string;
  time: string;
  tag?: string;
  notes?: string;
}

interface AdditionalRestaurant {
  name: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lon?: number;
  screenshot?: string;
  extractedText?: string;
  userLatitude?: number;
  userLongitude?: number;
  userAltitude?: number;
  userAddress?: string;
}

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  restaurantAddress?: string | null;
  time: string;
  screenshot?: string;
  metadata?: Record<string, any>;
  userLatitude?: number | null;
  userLongitude?: number | null;
  userAltitude?: number | null;
  userAddress?: string | null;
  processedAt: string;
  createdAt: string;
  linkedTransactions?: LinkedTransaction[];
  additionalRestaurants?: AdditionalRestaurant[];
}

interface EditDeliveryOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  userId?: string;
  onUpdate?: () => void;
}

export default function EditDeliveryOrderModal({
  isOpen,
  onClose,
  orderId,
  userId,
  onUpdate,
}: EditDeliveryOrderModalProps) {
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingAdditionalRestaurantIndex, setEditingAdditionalRestaurantIndex] = useState<number | null>(null);
  const [showAdditionalRestaurantModal, setShowAdditionalRestaurantModal] = useState(false);
  const [formValues, setFormValues] = useState({
    appName: "",
    miles: "",
    money: "",
    restaurantName: "",
    restaurantAddress: "",
    time: "",
  });
  const [additionalRestaurants, setAdditionalRestaurants] = useState<AdditionalRestaurant[]>([]);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrder();
    } else {
      setOrder(null);
      setError(null);
    }
  }, [isOpen, orderId, userId]);

  const fetchOrder = async () => {
    if (!orderId || !userId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch the specific order by ID
      const response = await fetch(`/api/delivery-orders?userId=${userId}&id=${orderId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Order not found");
        }
        throw new Error("Failed to fetch order");
      }

      const data = await response.json();
      const foundOrder = data.order;
      
      if (!foundOrder) {
        throw new Error("Order not found");
      }

      setOrder(foundOrder);
      setFormValues({
        appName: foundOrder.appName,
        miles: foundOrder.miles.toString(),
        money: foundOrder.money.toString(),
        restaurantName: foundOrder.restaurantName,
        restaurantAddress: foundOrder.restaurantAddress || "",
        time: foundOrder.time,
      });
      setAdditionalRestaurants(foundOrder.additionalRestaurants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!orderId) return;

    try {
      setSaving(true);
      setError(null);

      const miles = parseFloat(formValues.miles);
      const money = parseFloat(formValues.money);

      if (isNaN(miles) || miles <= 0) {
        throw new Error("Miles must be a positive number");
      }
      if (isNaN(money) || money <= 0) {
        throw new Error("Money must be a positive number");
      }

      // Remove restaurant name from the beginning of the address if present
      let cleanedAddress = formValues.restaurantAddress || null;
      if (cleanedAddress && formValues.restaurantName && cleanedAddress.startsWith(formValues.restaurantName)) {
        // Remove restaurant name and any following comma/space
        cleanedAddress = cleanedAddress.substring(formValues.restaurantName.length).replace(/^[,\s]+/, "").trim();
      }

      const response = await fetch("/api/delivery-orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: orderId,
          appName: formValues.appName,
          miles,
          money,
          restaurantName: formValues.restaurantName,
          restaurantAddress: cleanedAddress,
          time: formValues.time,
          additionalRestaurants: additionalRestaurants,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update order");
      }

      onUpdate?.();
      onClose();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch {
      return dateString;
    }
  };

  // App name to color mapping (matching logs screen)
  const getAppTagColor = (appName: string) => {
    const appColors: Record<string, { bg: string; text: string }> = {
      "Uber Driver": { bg: "bg-black dark:bg-gray-800", text: "text-white dark:text-gray-100" },
      "Dasher": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
      "GH Drivers": { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
      "Shopper": { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
    };

    return appColors[appName] || { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-500 dark:text-gray-400" };
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Delivery Order">
      {loading && !order && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </div>
      )}

      {order && !loading && (
        <div className="space-y-4">

          {/* Screenshot Display */}
          {order.screenshot && typeof order.screenshot === 'string' && order.screenshot.trim().length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Screenshot
              </label>
              <div className="rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <img
                  src={`data:image/png;base64,${order.screenshot}`}
                  alt="Order screenshot"
                  className="w-full h-auto max-h-[400px] object-contain"
                />
              </div>
            </div>
          )}

          <MetadataViewer 
            metadata={order.metadata} 
            title="Extracted Metadata"
            userLatitude={order.userLatitude}
            userLongitude={order.userLongitude}
            userAltitude={order.userAltitude}
            userAddress={order.userAddress}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              App Name
            </label>
            <input
              type="text"
              value={formValues.appName}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  appName: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Utensils className="w-4 h-4" />
              Restaurant Name
            </label>
            <input
              type="text"
              value={formValues.restaurantName}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  restaurantName: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <MapPin className="w-4 h-4" />
              Restaurant Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formValues.restaurantAddress}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    restaurantAddress: e.target.value,
                  }))
                }
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 123 Main St, City, State"
              />
              <button
                onClick={() => setShowShareModal(true)}
                className="p-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Search Restaurant Address"
              >
                <Search className="w-5 h-5" />
              </button>
              {formValues.restaurantAddress && (
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          text: formValues.restaurantAddress,
                        });
                      } catch (err) {
                        console.log("Share cancelled or failed:", err);
                      }
                    } else {
                      try {
                        await navigator.clipboard.writeText(formValues.restaurantAddress);
                        alert("Address copied to clipboard");
                      } catch (err) {
                        console.error("Failed to copy address:", err);
                      }
                    }
                  }}
                  className="p-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="Share Restaurant Address"
                >
                  📤
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Package className="w-4 h-4" />
                Miles
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formValues.miles}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    miles: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Money ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formValues.money}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    money: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {formValues.miles && formValues.money && (
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Ratio: ${(parseFloat(formValues.money) / parseFloat(formValues.miles)).toFixed(2)}/mi
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time
            </label>
            <input
              type="text"
              value={formValues.time}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  time: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 2:30 PM"
            />
          </div>

          {/* Additional Restaurants */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              ADDITIONAL RESTAURANTS
            </div>
            {additionalRestaurants.length > 0 ? (
              <div className="space-y-3">
                {additionalRestaurants.map((restaurant, index) => (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-bold text-base text-gray-900 dark:text-white mb-1">
                          {restaurant.name}
                        </div>
                        {restaurant.address && (
                          <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            {restaurant.address}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setEditingAdditionalRestaurantIndex(index);
                          setShowAdditionalRestaurantModal(true);
                        }}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Edit Restaurant"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                No additional restaurants
              </div>
            )}
          </div>

          {/* Linked Transactions */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              LINKED TRANSACTIONS
            </div>
            {order.linkedTransactions && order.linkedTransactions.length > 0 ? (
              <div className="space-y-3">
                {order.linkedTransactions.map((transaction) => (
                  <div
                    key={transaction._id}
                    className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-bold text-base text-gray-900 dark:text-white">
                        ${transaction.amount.toFixed(2)}
                      </div>
                      <button
                        onClick={async () => {
                          if (!orderId) return;
                          try {
                            setSaving(true);
                            setError(null);
                            const response = await fetch("/api/link", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                transactionId: transaction._id,
                                deliveryOrderId: orderId,
                                action: "unlink",
                              }),
                            });
                            if (!response.ok) {
                              const errorData = await response.json();
                              throw new Error(errorData.error || "Failed to unlink transaction");
                            }
                            // Refresh the order data
                            await fetchOrder();
                            onUpdate?.();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to unlink transaction");
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 min-h-[40px] transition-colors"
                      >
                        Unlink
                      </button>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {format(new Date(transaction.date), "MMM d, yyyy")} at {transaction.time}
                    </div>
                    {transaction.tag && (() => {
                      const appColor = getAppTagColor(transaction.tag);
                      return (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${appColor.bg} ${appColor.text}`}>
                            {transaction.tag}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                No linked transactions
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[40px] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[40px] transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {order && (
        <>
          <ShareOrderModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            restaurantName={formValues.restaurantName || order.restaurantName}
            orderId={orderId || undefined}
            orderDetails={{
              miles: parseFloat(formValues.miles) || order.miles,
              money: parseFloat(formValues.money) || order.money,
              milesToMoneyRatio: formValues.miles && formValues.money 
                ? parseFloat(formValues.money) / parseFloat(formValues.miles)
                : order.milesToMoneyRatio,
              appName: formValues.appName || order.appName,
            }}
            userLatitude={order.userLatitude || undefined}
            userLongitude={order.userLongitude || undefined}
            userAddress={order.userAddress || undefined}
            onAddressSaved={() => {
              fetchOrder();
              onUpdate?.();
              setShowShareModal(false);
            }}
          />
          {editingAdditionalRestaurantIndex !== null && additionalRestaurants[editingAdditionalRestaurantIndex] && (
            <ShareOrderModal
              isOpen={showAdditionalRestaurantModal}
              onClose={() => {
                setShowAdditionalRestaurantModal(false);
                setEditingAdditionalRestaurantIndex(null);
              }}
              restaurantName={additionalRestaurants[editingAdditionalRestaurantIndex].name}
              orderId={orderId || undefined}
              orderDetails={{
                miles: order.miles,
                money: order.money,
                milesToMoneyRatio: order.milesToMoneyRatio,
                appName: order.appName,
              }}
              userLatitude={additionalRestaurants[editingAdditionalRestaurantIndex].userLatitude}
              userLongitude={additionalRestaurants[editingAdditionalRestaurantIndex].userLongitude}
              userAddress={additionalRestaurants[editingAdditionalRestaurantIndex].userAddress}
              onAddressSaved={async (address?: string, placeId?: string, lat?: number, lon?: number) => {
                if (editingAdditionalRestaurantIndex !== null) {
                  const updatedRestaurants = [...additionalRestaurants];
                  updatedRestaurants[editingAdditionalRestaurantIndex] = {
                    ...updatedRestaurants[editingAdditionalRestaurantIndex],
                    address: address || updatedRestaurants[editingAdditionalRestaurantIndex].address,
                    placeId: placeId || updatedRestaurants[editingAdditionalRestaurantIndex].placeId,
                    lat: lat !== undefined ? lat : updatedRestaurants[editingAdditionalRestaurantIndex].lat,
                    lon: lon !== undefined ? lon : updatedRestaurants[editingAdditionalRestaurantIndex].lon,
                  };
                  setAdditionalRestaurants(updatedRestaurants);
                  
                  // Save to backend
                  await fetch("/api/delivery-orders", {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      id: orderId,
                      updateAdditionalRestaurant: {
                        index: editingAdditionalRestaurantIndex,
                        data: updatedRestaurants[editingAdditionalRestaurantIndex],
                      },
                    }),
                  });
                  
                  await fetchOrder();
                  onUpdate?.();
                }
                setShowAdditionalRestaurantModal(false);
                setEditingAdditionalRestaurantIndex(null);
              }}
            />
          )}
        </>
      )}
    </Modal>
  );
}

