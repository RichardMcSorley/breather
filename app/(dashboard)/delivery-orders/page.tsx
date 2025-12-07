"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, Utensils, MapPin, Package, Pencil, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import DeliveryOrdersList from "@/components/DeliveryOrdersList";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";
import SearchAddressModal from "@/components/SearchAddressModal";

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  time: string;
  processedAt: string;
  createdAt: string;
}

function DeliveryOrdersPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showSearchAddressModal, setShowSearchAddressModal] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    appName: "",
    restaurantName: "",
    restaurantAddress: "",
    money: "",
    miles: "",
    date: "",
    time: "",
  });
  const [additionalRestaurants, setAdditionalRestaurants] = useState<
    Array<{
      name: string;
      address?: string;
    }>
  >([]);
  const [editingAdditionalRestaurantIndex, setEditingAdditionalRestaurantIndex] = useState<number | null>(null);
  const [showAdditionalRestaurantModal, setShowAdditionalRestaurantModal] = useState(false);
  const [additionalRestaurantForm, setAdditionalRestaurantForm] = useState({
    name: "",
    address: "",
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchOrders();
    }
  }, [userId]);

  // Check for orderId query parameter and auto-open edit modal
  useEffect(() => {
    const orderIdParam = searchParams.get("orderId");
    if (orderIdParam && userId) {
      setEditingOrderId(orderIdParam);
    }
  }, [searchParams, userId]);

  const fetchOrders = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/delivery-orders?userId=${userId}&limit=100`);
      if (!response.ok) {
        throw new Error("Failed to fetch delivery orders");
      }
      const data = await response.json();
      setOrders(data.orders || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Initialize date and time to current date/time when modal opens
  useEffect(() => {
    if (showCreateOrderModal) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      
      // Format time as HH:MM AM/PM
      let hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const minutesStr = String(minutes).padStart(2, "0");
      const timeStr = `${hours}:${minutesStr} ${ampm}`;
      
      setCreateFormData((prev) => ({
        ...prev,
        date: `${year}-${month}-${day}`,
        time: timeStr,
      }));
    }
  }, [showCreateOrderModal]);

  const handleCreateOrder = async () => {
    if (!userId) return;

    // Validate form
    if (!createFormData.restaurantName.trim()) {
      setCreateError("Restaurant name is required");
      return;
    }
    if (!createFormData.money.trim()) {
      setCreateError("Money is required");
      return;
    }
    const moneyNum = parseFloat(createFormData.money);
    if (isNaN(moneyNum) || moneyNum <= 0) {
      setCreateError("Money must be a positive number");
      return;
    }
    if (createFormData.miles.trim()) {
      const milesNum = parseFloat(createFormData.miles);
      if (isNaN(milesNum) || milesNum < 0) {
        setCreateError("Miles must be a valid number");
        return;
      }
    }
    if (!createFormData.date.trim()) {
      setCreateError("Date is required");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);

      const response = await fetch("/api/delivery-orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          ...(createFormData.appName.trim() && { appName: createFormData.appName.trim() }),
          restaurantName: createFormData.restaurantName.trim(),
          restaurantAddress: createFormData.restaurantAddress.trim() || undefined,
          money: createFormData.money.trim(),
          miles: createFormData.miles.trim() || undefined,
          date: createFormData.date.trim(),
          time: createFormData.time.trim() || undefined,
          ...(additionalRestaurants.length > 0 && {
            additionalRestaurants: additionalRestaurants.map((r) => ({
              name: r.name.trim(),
              address: r.address?.trim() || undefined,
            })),
          }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create delivery order");
      }

      // Refresh orders list and close modal
      setShowCreateOrderModal(false);
      setCreateFormData({
        appName: "",
        restaurantName: "",
        restaurantAddress: "",
        money: "",
        miles: "",
        date: "",
        time: "",
      });
      setRefreshTrigger((prev) => prev + 1);
      await fetchOrders();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create delivery order");
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateOrderModal(false);
    setCreateFormData({
      appName: "",
      restaurantName: "",
      restaurantAddress: "",
      money: "",
      miles: "",
      date: "",
      time: "",
    });
    setAdditionalRestaurants([]);
    setAdditionalRestaurantForm({ name: "", address: "" });
    setEditingAdditionalRestaurantIndex(null);
    setShowAdditionalRestaurantModal(false);
    setCreateError(null);
  };

  const handleAddAdditionalRestaurant = () => {
    if (!additionalRestaurantForm.name.trim()) {
      setCreateError("Restaurant name is required");
      return;
    }
    const newRestaurant = {
      name: additionalRestaurantForm.name.trim(),
      address: additionalRestaurantForm.address.trim() || undefined,
    };
    if (editingAdditionalRestaurantIndex !== null) {
      // Editing existing restaurant
      const updated = [...additionalRestaurants];
      updated[editingAdditionalRestaurantIndex] = newRestaurant;
      setAdditionalRestaurants(updated);
      setEditingAdditionalRestaurantIndex(null);
    } else {
      // Adding new restaurant
      setAdditionalRestaurants([...additionalRestaurants, newRestaurant]);
    }
    setAdditionalRestaurantForm({ name: "", address: "" });
    setShowAdditionalRestaurantModal(false);
    setCreateError(null);
  };

  const handleEditAdditionalRestaurant = (index: number) => {
    const restaurant = additionalRestaurants[index];
    setAdditionalRestaurantForm({
      name: restaurant.name,
      address: restaurant.address || "",
    });
    setEditingAdditionalRestaurantIndex(index);
    setShowAdditionalRestaurantModal(true);
  };

  const handleDeleteAdditionalRestaurant = (index: number) => {
    if (confirm(`Are you sure you want to delete "${additionalRestaurants[index].name}"?`)) {
      setAdditionalRestaurants(additionalRestaurants.filter((_, i) => i !== index));
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Layout>
    );
  }

  if (!userId) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h2>
        <button
          onClick={() => setShowCreateOrderModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add Order</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {error && (
        <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </Card>
      )}

      {/* Delivery Orders List */}
      <div className="mb-6">
        <DeliveryOrdersList
          userId={userId}
          onRefresh={fetchOrders}
          onEditClick={(orderId) => setEditingOrderId(orderId)}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Edit Delivery Order Modal */}
      <EditDeliveryOrderModal
        isOpen={editingOrderId !== null}
        onClose={() => setEditingOrderId(null)}
        orderId={editingOrderId}
        userId={userId}
        onUpdate={() => {
          fetchOrders();
          setEditingOrderId(null);
        }}
      />

      {/* Create Delivery Order Modal */}
      <Modal
        isOpen={showCreateOrderModal}
        onClose={handleCloseCreateModal}
        title="Create New Delivery Order"
      >
        <div className="space-y-4">
          {createError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">{createError}</div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                App Name
              </label>
              <select
                value={createFormData.appName}
                onChange={(e) =>
                  setCreateFormData((prev) => ({ ...prev, appName: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                <option value="Uber Driver">Uber Driver</option>
                <option value="Dasher">Dasher</option>
                <option value="GH Drivers">GH Drivers</option>
                <option value="Shopper">Shopper</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Utensils className="w-4 h-4" />
                Restaurant Name *
              </label>
              <input
                type="text"
                value={createFormData.restaurantName}
                onChange={(e) =>
                  setCreateFormData((prev) => ({ ...prev, restaurantName: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter restaurant name"
              />
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <MapPin className="w-4 h-4" />
                Restaurant Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createFormData.restaurantAddress}
                  onChange={(e) =>
                    setCreateFormData((prev) => ({ ...prev, restaurantAddress: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter restaurant address"
                />
                <button
                  type="button"
                  onClick={() => setShowSearchAddressModal(true)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  title="Search address"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Package className="w-4 h-4" />
                  Miles
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={createFormData.miles}
                  onChange={(e) =>
                    setCreateFormData((prev) => ({ ...prev, miles: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Money ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={createFormData.money}
                  onChange={(e) =>
                    setCreateFormData((prev) => ({ ...prev, money: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={createFormData.date}
                  onChange={(e) =>
                    setCreateFormData((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Time
                </label>
                <input
                  type="text"
                  value={createFormData.time}
                  onChange={(e) =>
                    setCreateFormData((prev) => ({ ...prev, time: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 2:30 PM"
                />
              </div>
            </div>

            {/* Additional Restaurants */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  ADDITIONAL RESTAURANTS
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAdditionalRestaurantIndex(null);
                    setAdditionalRestaurantForm({ name: "", address: "" });
                    setShowAdditionalRestaurantModal(true);
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1"
                  title="Add Restaurant"
                >
                  <Utensils className="w-3 h-3" />
                  Add Restaurant
                </button>
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
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {restaurant.address}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditAdditionalRestaurant(index)}
                            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                            title="Edit Restaurant"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdditionalRestaurant(index)}
                            className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                            title="Delete Restaurant"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateOrder}
              disabled={creating}
              className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {creating ? "Creating..." : "Create Order"}
            </button>
            <button
              onClick={handleCloseCreateModal}
              disabled={creating}
              className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Search Address Modal for Main Restaurant */}
      <SearchAddressModal
        isOpen={showSearchAddressModal}
        onClose={() => setShowSearchAddressModal(false)}
        title="Search Restaurant Address"
        initialQuery={createFormData.restaurantName || createFormData.restaurantAddress}
        onAddressSelected={(address, placeId, lat, lon, name) => {
          setCreateFormData((prev) => ({
            ...prev,
            restaurantAddress: address,
            ...(name && { restaurantName: name }),
          }));
          setShowSearchAddressModal(false);
        }}
      />

      {/* Additional Restaurant Modal */}
      <Modal
        isOpen={showAdditionalRestaurantModal}
        onClose={() => {
          setShowAdditionalRestaurantModal(false);
          setEditingAdditionalRestaurantIndex(null);
          setAdditionalRestaurantForm({ name: "", address: "" });
          setCreateError(null);
        }}
        title={editingAdditionalRestaurantIndex !== null ? "Edit Restaurant" : "Add Restaurant"}
      >
        <div className="space-y-4">
          {createError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">{createError}</div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Utensils className="w-4 h-4" />
                Restaurant Name *
              </label>
              <input
                type="text"
                value={additionalRestaurantForm.name}
                onChange={(e) =>
                  setAdditionalRestaurantForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter restaurant name"
              />
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <MapPin className="w-4 h-4" />
                Restaurant Address
              </label>
              <input
                type="text"
                value={additionalRestaurantForm.address}
                onChange={(e) =>
                  setAdditionalRestaurantForm((prev) => ({ ...prev, address: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter restaurant address"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddAdditionalRestaurant}
              className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors min-h-[44px]"
            >
              {editingAdditionalRestaurantIndex !== null ? "Update" : "Add"} Restaurant
            </button>
            <button
              onClick={() => {
                setShowAdditionalRestaurantModal(false);
                setEditingAdditionalRestaurantIndex(null);
                setAdditionalRestaurantForm({ name: "", address: "" });
                setCreateError(null);
              }}
              className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

export default function DeliveryOrdersPage() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        </Layout>
      }
    >
      <DeliveryOrdersPageContent />
    </Suspense>
  );
}

