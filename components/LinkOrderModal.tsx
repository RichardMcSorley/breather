"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import SearchAddressModal from "./SearchAddressModal";
import { format } from "date-fns";
import { MapPin, Search } from "lucide-react";

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles?: number;
  money: number;
  milesToMoneyRatio?: number;
  restaurantName: string;
  time: string;
  processedAt: string;
}

interface LinkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId?: string | null;
  ocrExportId?: string | null;
  userId?: string;
  onLink?: () => void;
}

export default function LinkOrderModal({
  isOpen,
  onClose,
  transactionId,
  ocrExportId,
  userId,
  onLink,
}: LinkOrderModalProps) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [filtersActive, setFiltersActive] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ amount?: number; appName?: string }>({});
  const [transactionTime, setTransactionTime] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionData, setTransactionData] = useState<{ date?: string; time?: string; amount?: number; tag?: string } | null>(null);
  const [createFormData, setCreateFormData] = useState({
    restaurantName: "",
    appName: "",
    miles: "",
    money: "",
    restaurantAddress: "",
  });
  const [showSearchAddressModal, setShowSearchAddressModal] = useState(false);
  const [restaurantPlaceData, setRestaurantPlaceData] = useState<{ placeId?: string; lat?: number; lon?: number } | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchOrders();
    } else {
      setOrders([]);
      setError(null);
      setFiltersActive(false);
      setActiveFilters({});
      setShowCreateForm(false);
      setTransactionData(null);
      setCreateFormData({
        restaurantName: "",
        appName: "",
        miles: "",
        money: "",
        restaurantAddress: "",
      });
      setRestaurantPlaceData(null);
    }
  }, [isOpen, userId, transactionId]);

  // Pre-fill form when transaction data becomes available
  useEffect(() => {
    if (transactionData && showCreateForm) {
      if (transactionData.amount) {
        setCreateFormData(prev => ({
          ...prev,
          money: transactionData.amount!.toString(),
        }));
      }
      if (transactionData.tag) {
        setCreateFormData(prev => ({
          ...prev,
          appName: transactionData.tag!,
        }));
      }
    }
  }, [transactionData, showCreateForm]);

  const fetchOrders = async (skipFilters = false) => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams({
        userId,
        limit: "100",
      });

      const filters: { amount?: number; appName?: string } = {};

      // If transactionId is provided and filters are not skipped, fetch transaction data and add filters
      if (transactionId && !skipFilters) {
        const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
        if (transactionResponse.ok) {
          const transactionData = await transactionResponse.json();
          setTransactionData(transactionData);
          
          // Store transaction time for display
          if (transactionData.date && transactionData.time) {
            try {
              // Parse date as YYYY-MM-DD (local date, not UTC)
              const [year, month, day] = transactionData.date.split("-").map(Number);
              const [hours, minutes] = transactionData.time.split(":").map(Number);
              // Create date in local timezone
              const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
              setTransactionTime(format(date, "MMM d, yyyy 'at' h:mm a"));
            } catch {
              setTransactionTime(`${transactionData.date} at ${transactionData.time}`);
            }
          }
          
          // Pre-fill create form with transaction data
          if (transactionData.amount) {
            setCreateFormData(prev => ({
              ...prev,
              money: transactionData.amount!.toString(),
            }));
          }
          if (transactionData.tag) {
            setCreateFormData(prev => ({
              ...prev,
              appName: transactionData.tag!,
            }));
            params.append("filterAppName", transactionData.tag);
            filters.appName = transactionData.tag;
          }
          if (transactionData.amount) {
            params.append("filterAmount", transactionData.amount.toString());
            filters.amount = transactionData.amount;
          }
        }
      } else {
        setTransactionTime(null);
        setTransactionData(null);
      }

      setFiltersActive(!skipFilters && (filters.amount !== undefined || filters.appName !== undefined));
      setActiveFilters(filters);

      const response = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch delivery orders");
      }

      const data = await response.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    fetchOrders(true);
  };

  const handleLink = async (orderId: string) => {
    try {
      setLinkingId(orderId);
      setError(null);

      const body: any = {
        deliveryOrderId: orderId,
        action: "link",
      };

      if (transactionId) {
        body.transactionId = transactionId;
      }
      if (ocrExportId) {
        body.ocrExportId = ocrExportId;
      }

      const response = await fetch("/api/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link order");
      }

      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link order");
    } finally {
      setLinkingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleCreateOrder = async () => {
    if (!userId || !transactionId) return;

    // Validate form
    if (!createFormData.restaurantName.trim()) {
      setError("Restaurant name is required");
      return;
    }
    if (!createFormData.appName.trim()) {
      setError("App name is required");
      return;
    }
    // Miles is optional - if provided, must be valid
    if (createFormData.miles && createFormData.miles.trim() !== "") {
      if (isNaN(parseFloat(createFormData.miles)) || parseFloat(createFormData.miles) < 0) {
        setError("Miles must be a valid number");
        return;
      }
    }
    if (!createFormData.money || isNaN(parseFloat(createFormData.money)) || parseFloat(createFormData.money) <= 0) {
      setError("Valid pay amount is required");
      return;
    }

    // Fetch transaction data if not already available
    let txData = transactionData;
    if (!txData?.date && transactionId) {
      try {
        setError(null);
        const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
        if (!transactionResponse.ok) {
          throw new Error("Failed to fetch transaction data");
        }
        txData = await transactionResponse.json();
        setTransactionData(txData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch transaction data");
        return;
      }
    }

    if (!txData?.date || txData.date.trim() === "") {
      setError("Transaction date is required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const response = await fetch("/api/delivery-orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          appName: createFormData.appName.trim(),
          ...(createFormData.miles && createFormData.miles.trim() !== "" && { miles: parseFloat(createFormData.miles) }),
          money: parseFloat(createFormData.money),
          restaurantName: createFormData.restaurantName.trim(),
          restaurantAddress: createFormData.restaurantAddress.trim() || undefined,
          restaurantPlaceId: restaurantPlaceData?.placeId,
          restaurantLat: restaurantPlaceData?.lat,
          restaurantLon: restaurantPlaceData?.lon,
          date: txData.date,
          time: txData.time || "00:00",
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create order");
      }

      // Refresh orders list and close create form
      setShowCreateForm(false);
      await fetchOrders();
      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Delivery Order">
      {filtersActive && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                Filters Active
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-400">
                {activeFilters.amount !== undefined && `Amount: $${activeFilters.amount.toFixed(2)}`}
                {activeFilters.amount !== undefined && activeFilters.appName && " • "}
                {activeFilters.appName && `App: ${activeFilters.appName}`}
              </div>
            </div>
            <button
              onClick={handleClearFilters}
              className="ml-4 px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
          {transactionTime && (
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
              Transaction: {transactionTime}
            </div>
          )}
        </div>
      )}
      
      {!filtersActive && transactionTime && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Transaction: {transactionTime}
          </div>
        </div>
      )}

      {loading && orders.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {orders.length === 0 && !loading && !showCreateForm && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          {filtersActive ? (
            <>
              <p>No delivery orders found matching the filters.</p>
              <div className="mt-4 space-y-2">
                <button
                  onClick={handleClearFilters}
                  className="block w-full px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear filters to see all orders
                </button>
                {transactionId && (
                  <button
                    onClick={async () => {
                      // Ensure transaction data is loaded before showing form
                      if (!transactionData && transactionId) {
                        try {
                          const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
                          if (transactionResponse.ok) {
                            const txData = await transactionResponse.json();
                            setTransactionData(txData);
                            // Pre-fill form with transaction data
                            if (txData.amount) {
                              setCreateFormData(prev => ({
                                ...prev,
                                money: txData.amount!.toString(),
                              }));
                            }
                            if (txData.tag) {
                              setCreateFormData(prev => ({
                                ...prev,
                                appName: txData.tag!,
                              }));
                            }
                          }
                        } catch (err) {
                          setError("Failed to load transaction data");
                          return;
                        }
                      } else if (transactionData) {
                        // If transaction data is already available, ensure form is prefilled
                        if (transactionData.amount) {
                          setCreateFormData(prev => ({
                            ...prev,
                            money: transactionData.amount!.toString(),
                          }));
                        }
                        if (transactionData.tag) {
                          setCreateFormData(prev => ({
                            ...prev,
                            appName: transactionData.tag!,
                          }));
                        }
                      }
                      setShowCreateForm(true);
                    }}
                    className="block w-full px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    Create New Order
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p>No delivery orders found.</p>
                {transactionId && (
                  <button
                    onClick={async () => {
                      // Ensure transaction data is loaded before showing form
                      if (!transactionData && transactionId) {
                        try {
                          const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
                          if (transactionResponse.ok) {
                            const txData = await transactionResponse.json();
                            setTransactionData(txData);
                            // Pre-fill form with transaction data
                            if (txData.amount) {
                              setCreateFormData(prev => ({
                                ...prev,
                                money: txData.amount!.toString(),
                              }));
                            }
                            if (txData.tag) {
                              setCreateFormData(prev => ({
                                ...prev,
                                appName: txData.tag!,
                              }));
                            }
                          }
                        } catch (err) {
                          setError("Failed to load transaction data");
                          return;
                        }
                      }
                      setShowCreateForm(true);
                    }}
                    className="mt-4 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    Create New Order
                  </button>
                )}
            </>
          )}
        </div>
      )}

      {showCreateForm && (
        <div className="space-y-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Create New Delivery Order
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Restaurant Name *
              </label>
              <input
                type="text"
                value={createFormData.restaurantName}
                onChange={(e) => setCreateFormData(prev => ({ ...prev, restaurantName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter restaurant name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                App Name *
              </label>
              <input
                type="text"
                value={createFormData.appName}
                onChange={(e) => setCreateFormData(prev => ({ ...prev, appName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Dasher, Roadie"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Miles
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={createFormData.miles}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, miles: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pay Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={createFormData.money}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, money: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Restaurant Address (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createFormData.restaurantAddress}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, restaurantAddress: e.target.value }))}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter restaurant address"
                />
                <button
                  type="button"
                  onClick={() => setShowSearchAddressModal(true)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  title="Search address"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {transactionData && (
              <div className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                Order will be created with date: {transactionData.date} {transactionData.time ? `at ${transactionData.time}` : ""}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateOrder}
              disabled={creating}
              className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating..." : "Create & Link Order"}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setError(null);
              }}
              disabled={creating}
              className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {orders.length > 0 && !showCreateForm && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {transactionId && (
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={async () => {
                  // Ensure transaction data is loaded before showing form
                  if (!transactionData && transactionId) {
                    try {
                      const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
                      if (transactionResponse.ok) {
                        const txData = await transactionResponse.json();
                        setTransactionData(txData);
                        // Pre-fill form with transaction data
                        if (txData.amount) {
                          setCreateFormData(prev => ({
                            ...prev,
                            money: txData.amount!.toString(),
                          }));
                        }
                        if (txData.tag) {
                          setCreateFormData(prev => ({
                            ...prev,
                            appName: txData.tag!,
                          }));
                        }
                      }
                    } catch (err) {
                      setError("Failed to load transaction data");
                      return;
                    }
                  }
                  setShowCreateForm(true);
                }}
                className="w-full px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                Create New Order
              </button>
            </div>
          )}
          {orders.map((order) => (
            <div
              key={order.id}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {order.restaurantName}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {order.appName}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {formatDate(order.processedAt)}
                  {order.time && ` at ${order.time}`}
                  {" • "}
                  {order.miles !== undefined ? `${order.miles.toFixed(1)} mi • ` : ""}{formatCurrency(order.money)}
                </div>
                {order.milesToMoneyRatio !== undefined && (
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Ratio: ${order.milesToMoneyRatio.toFixed(2)}/mi
                  </div>
                )}
              </div>
              <button
                onClick={() => handleLink(order.id)}
                disabled={linkingId === order.id}
                className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed ml-4"
              >
                {linkingId === order.id ? "Linking..." : "Link"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Address Modal */}
      <SearchAddressModal
        isOpen={showSearchAddressModal}
        onClose={() => setShowSearchAddressModal(false)}
        title="Search Restaurant Address"
        initialQuery={
          createFormData.restaurantName.trim() && createFormData.restaurantAddress.trim()
            ? `${createFormData.restaurantName} ${createFormData.restaurantAddress}`
            : createFormData.restaurantName.trim() || createFormData.restaurantAddress.trim() || ""
        }
        onAddressSelected={(address, placeId, lat, lon) => {
          setCreateFormData(prev => ({
            ...prev,
            restaurantAddress: address,
          }));
          setRestaurantPlaceData({
            placeId,
            lat,
            lon,
          });
          setShowSearchAddressModal(false);
        }}
      />
    </Modal>
  );
}

