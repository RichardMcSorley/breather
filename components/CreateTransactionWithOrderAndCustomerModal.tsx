"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Utensils, MapPin, User, Package, Search, Plus, X, Pencil, Trash2 } from "lucide-react";
import Modal from "./ui/Modal";
import SearchAddressModal from "./SearchAddressModal";
import { getCurrentESTAsUTC } from "@/lib/date-utils";
import { queryKeys } from "@/hooks/useQueries";

interface CreateTransactionWithOrderAndCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTransactionWithOrderAndCustomerModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTransactionWithOrderAndCustomerModalProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  // Transaction form data
  const [transactionData, setTransactionData] = useState({
    amount: "",
    date: "",
    time: "",
    tag: "",
    notes: "",
  });

  // Order form data (always included)
  const [orderData, setOrderData] = useState({
    appName: "",
    restaurantName: "",
    restaurantAddress: "",
    money: "",
    miles: "",
    date: "",
    time: "",
  });
  const [showOrderAddressSearch, setShowOrderAddressSearch] = useState(false);

  // Customer form data (always included)
  const [customerData, setCustomerData] = useState({
    customerName: "",
    customerAddress: "",
    appName: "",
  });
  const [showCustomerAddressSearch, setShowCustomerAddressSearch] = useState(false);

  // Toggle for showing order and customer forms
  const [addAppDetails, setAddAppDetails] = useState(false);

  // Additional restaurants
  const [additionalRestaurants, setAdditionalRestaurants] = useState<
    Array<{ name: string; address?: string }>
  >([]);
  const [editingAdditionalRestaurantIndex, setEditingAdditionalRestaurantIndex] = useState<number | null>(null);
  const [showAdditionalRestaurantModal, setShowAdditionalRestaurantModal] = useState(false);
  const [additionalRestaurantForm, setAdditionalRestaurantForm] = useState({
    name: "",
    address: "",
  });
  const [showAdditionalRestaurantAddressSearch, setShowAdditionalRestaurantAddressSearch] = useState(false);

  // Additional customers
  const [additionalCustomers, setAdditionalCustomers] = useState<
    Array<{ customerName: string; customerAddress: string }>
  >([]);
  const [editingAdditionalCustomerIndex, setEditingAdditionalCustomerIndex] = useState<number | null>(null);
  const [showAdditionalCustomerModal, setShowAdditionalCustomerModal] = useState(false);
  const [additionalCustomerForm, setAdditionalCustomerForm] = useState({
    customerName: "",
    customerAddress: "",
  });
  const [showAdditionalCustomerAddressSearch, setShowAdditionalCustomerAddressSearch] = useState(false);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with current date/time
  useEffect(() => {
    if (isOpen) {
      const estNow = getCurrentESTAsUTC();
      setTransactionData((prev) => ({
        ...prev,
        date: prev.date || estNow.estDateString,
        time: prev.time || estNow.timeString,
      }));
      setOrderData((prev) => ({
        ...prev,
        date: prev.date || estNow.estDateString,
        time: prev.time || estNow.timeString,
      }));
    }
  }, [isOpen]);

  // Inherit App Name from transaction to order and customer
  useEffect(() => {
    if (transactionData.tag) {
      setOrderData((prev) => ({ ...prev, appName: transactionData.tag }));
      setCustomerData((prev) => ({ ...prev, appName: transactionData.tag }));
    }
  }, [transactionData.tag]);

  // Inherit Money (amount) from transaction to order
  useEffect(() => {
    if (transactionData.amount) {
      setOrderData((prev) => ({ ...prev, money: transactionData.amount }));
    }
  }, [transactionData.amount]);

  // Inherit Date and Time from transaction to order
  useEffect(() => {
    if (transactionData.date) {
      setOrderData((prev) => ({ ...prev, date: transactionData.date }));
    }
    if (transactionData.time) {
      setOrderData((prev) => ({ ...prev, time: transactionData.time }));
    }
  }, [transactionData.date, transactionData.time]);

  const handleClose = () => {
    setTransactionData({
      amount: "",
      date: "",
      time: "",
      tag: "",
      notes: "",
    });
    setOrderData({
      appName: "",
      restaurantName: "",
      restaurantAddress: "",
      money: "",
      miles: "",
      date: "",
      time: "",
    });
    setCustomerData({
      customerName: "",
      customerAddress: "",
      appName: "",
    });
    setAddAppDetails(false);
    setAdditionalRestaurants([]);
    setAdditionalCustomers([]);
    setAdditionalRestaurantForm({ name: "", address: "" });
    setAdditionalCustomerForm({ customerName: "", customerAddress: "" });
    setEditingAdditionalRestaurantIndex(null);
    setEditingAdditionalCustomerIndex(null);
    setShowAdditionalRestaurantModal(false);
    setShowAdditionalCustomerModal(false);
    setError(null);
    onClose();
  };

  const handleAddAdditionalRestaurant = () => {
    if (!additionalRestaurantForm.name.trim()) {
      setError("Restaurant name is required");
      return;
    }
    const newRestaurant = {
      name: additionalRestaurantForm.name.trim(),
      address: additionalRestaurantForm.address.trim() || undefined,
    };
    if (editingAdditionalRestaurantIndex !== null) {
      const updated = [...additionalRestaurants];
      updated[editingAdditionalRestaurantIndex] = newRestaurant;
      setAdditionalRestaurants(updated);
      setEditingAdditionalRestaurantIndex(null);
    } else {
      setAdditionalRestaurants([...additionalRestaurants, newRestaurant]);
    }
    setAdditionalRestaurantForm({ name: "", address: "" });
    setShowAdditionalRestaurantModal(false);
    setError(null);
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

  const handleAddAdditionalCustomer = () => {
    if (!additionalCustomerForm.customerName.trim()) {
      setError("Customer name is required");
      return;
    }
    if (!additionalCustomerForm.customerAddress.trim()) {
      setError("Customer address is required");
      return;
    }
    const newCustomer = {
      customerName: additionalCustomerForm.customerName.trim(),
      customerAddress: additionalCustomerForm.customerAddress.trim(),
    };
    if (editingAdditionalCustomerIndex !== null) {
      const updated = [...additionalCustomers];
      updated[editingAdditionalCustomerIndex] = newCustomer;
      setAdditionalCustomers(updated);
      setEditingAdditionalCustomerIndex(null);
    } else {
      setAdditionalCustomers([...additionalCustomers, newCustomer]);
    }
    setAdditionalCustomerForm({ customerName: "", customerAddress: "" });
    setShowAdditionalCustomerModal(false);
    setError(null);
  };

  const handleEditAdditionalCustomer = (index: number) => {
    const customer = additionalCustomers[index];
    setAdditionalCustomerForm({
      customerName: customer.customerName,
      customerAddress: customer.customerAddress,
    });
    setEditingAdditionalCustomerIndex(index);
    setShowAdditionalCustomerModal(true);
  };

  const handleDeleteAdditionalCustomer = (index: number) => {
    if (confirm(`Are you sure you want to delete "${additionalCustomers[index].customerName}"?`)) {
      setAdditionalCustomers(additionalCustomers.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!userId) return;

    setError(null);

    // Validate transaction
    if (!transactionData.amount.trim()) {
      setError("Transaction amount is required");
      return;
    }
    const amountNum = parseFloat(transactionData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Transaction amount must be a positive number");
      return;
    }
    if (!transactionData.date.trim()) {
      setError("Transaction date is required");
      return;
    }
    if (!transactionData.time.trim()) {
      setError("Transaction time is required");
      return;
    }

    // Validate order and customer only if "Add app details" is checked
    if (addAppDetails) {
      // Validate order
      if (!orderData.restaurantName.trim()) {
        setError("Restaurant name is required");
        return;
      }
      // Money is inherited from transaction amount, so use that if orderData.money is empty
      const orderMoneyValue = orderData.money.trim() || transactionData.amount.trim();
      if (!orderMoneyValue) {
        setError("Order money is required (inherited from transaction amount)");
        return;
      }
      const orderMoneyNum = parseFloat(orderMoneyValue);
      if (isNaN(orderMoneyNum) || orderMoneyNum <= 0) {
        setError("Order money must be a positive number");
        return;
      }
      if (orderData.miles.trim()) {
        const orderMilesNum = parseFloat(orderData.miles);
        if (isNaN(orderMilesNum) || orderMilesNum < 0) {
          setError("Order miles must be a valid number");
          return;
        }
      }
      // Date and time are inherited from transaction, so use transaction values if order values are empty
      const orderDateValue = orderData.date.trim() || transactionData.date.trim();
      if (!orderDateValue) {
        setError("Order date is required (inherited from transaction date)");
        return;
      }

      // Validate customer
      if (!customerData.customerName.trim()) {
        setError("Customer name is required");
        return;
      }
      if (!customerData.customerAddress.trim()) {
        setError("Customer address is required");
        return;
      }
    }

    try {
      setCreating(true);

      // Step 1: Create transaction
      const transactionResponse = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: transactionData.amount.trim(),
          type: "income",
          date: transactionData.date.trim(),
          time: transactionData.time.trim(),
          tag: transactionData.tag.trim() || undefined,
          notes: transactionData.notes.trim() || undefined,
        }),
      });

      if (!transactionResponse.ok) {
        const errorData = await transactionResponse.json();
        throw new Error(errorData.error || "Failed to create transaction");
      }

      const transaction = await transactionResponse.json();
      const transactionId = transaction._id;

      // Step 2: Create order and customer only if "Add app details" is checked
      if (addAppDetails) {
        // Create order
        const orderResponse = await fetch("/api/delivery-orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
          body: JSON.stringify({
            userId,
            ...((orderData.appName.trim() || transactionData.tag.trim()) && { 
              appName: (orderData.appName.trim() || transactionData.tag.trim()) 
            }),
            restaurantName: orderData.restaurantName.trim(),
            restaurantAddress: orderData.restaurantAddress.trim() || undefined,
            money: orderData.money.trim() || transactionData.amount.trim(),
            miles: orderData.miles.trim() || undefined,
            date: orderData.date.trim() || transactionData.date.trim(),
            time: orderData.time.trim() || transactionData.time.trim() || undefined,
            transactionId,
          }),
      });

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json();
        throw new Error(errorData.error || "Failed to create order");
      }

        const order = await orderResponse.json();
        const orderId = order.id;

        // Step 3: Create customer
        const customerResponse = await fetch("/api/ocr-exports/create", {
          method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          customerName: customerData.customerName.trim(),
          customerAddress: customerData.customerAddress.trim(),
          ...((customerData.appName.trim() || transactionData.tag.trim()) && { 
            appName: (customerData.appName.trim() || transactionData.tag.trim()) 
          }),
          transactionId,
        }),
      });

        if (!customerResponse.ok) {
          const errorData = await customerResponse.json();
          throw new Error(errorData.error || "Failed to create customer");
        }

        // Step 4: Create additional customers if any
        for (const additionalCustomer of additionalCustomers) {
          const additionalCustomerResponse = await fetch("/api/ocr-exports/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            customerName: additionalCustomer.customerName,
            customerAddress: additionalCustomer.customerAddress,
            ...(transactionData.tag.trim() && { appName: transactionData.tag.trim() }),
            transactionId,
          }),
        });

          if (!additionalCustomerResponse.ok) {
            const errorData = await additionalCustomerResponse.json();
            throw new Error(errorData.error || "Failed to create additional customer");
          }
        }

        // Invalidate delivery orders query
        queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transaction");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Income"
      >
        <div className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
              TRANSACTION *
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={transactionData.amount}
                onChange={(e) =>
                  setTransactionData((prev) => ({ ...prev, amount: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={transactionData.date}
                  onChange={(e) =>
                    setTransactionData((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Time *
                </label>
                <input
                  type="text"
                  value={transactionData.time}
                  onChange={(e) =>
                    setTransactionData((prev) => ({ ...prev, time: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 2:30 PM"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                App Name
              </label>
              <select
                value={transactionData.tag}
                onChange={(e) =>
                  setTransactionData((prev) => ({ ...prev, tag: e.target.value }))
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <textarea
                value={transactionData.notes}
                onChange={(e) =>
                  setTransactionData((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes"
                rows={2}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={addAppDetails}
                onChange={(e) => setAddAppDetails(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Add app details</span>
            </label>
          </div>

          {/* Order Section */}
          {addAppDetails && (
          <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              ORDER *
            </div>
            <div className="space-y-3 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Utensils className="w-4 h-4" />
                    Restaurant Name *
                  </label>
                  <input
                    type="text"
                    value={orderData.restaurantName}
                    onChange={(e) =>
                      setOrderData((prev) => ({ ...prev, restaurantName: e.target.value }))
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
                      value={orderData.restaurantAddress}
                      onChange={(e) =>
                        setOrderData((prev) => ({ ...prev, restaurantAddress: e.target.value }))
                      }
                      className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter restaurant address"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOrderAddressSearch(true)}
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
                      value={orderData.miles}
                      onChange={(e) =>
                        setOrderData((prev) => ({ ...prev, miles: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                {/* Additional Restaurants */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
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
                    <div className="space-y-2">
                      {additionalRestaurants.map((restaurant, index) => (
                        <div
                          key={index}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1">
                              <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">
                                {restaurant.name}
                              </div>
                              {restaurant.address && (
                                <div className="text-xs text-gray-700 dark:text-gray-300">
                                  {restaurant.address}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditAdditionalRestaurant(index)}
                                className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                                title="Edit Restaurant"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAdditionalRestaurant(index)}
                                className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                                title="Delete Restaurant"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      No additional restaurants
                    </div>
                  )}
                </div>
            </div>
          </div>
          )}

          {addAppDetails && (
          <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              CUSTOMER *
            </div>
            <div className="space-y-3 pl-4 border-l-2 border-green-200 dark:border-green-800">
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <User className="w-4 h-4" />
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={customerData.customerName}
                    onChange={(e) =>
                      setCustomerData((prev) => ({ ...prev, customerName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <MapPin className="w-4 h-4" />
                    Customer Address *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customerData.customerAddress}
                      onChange={(e) =>
                        setCustomerData((prev) => ({ ...prev, customerAddress: e.target.value }))
                      }
                      className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter customer address"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomerAddressSearch(true)}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                      title="Search address"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Additional Customers */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      ADDITIONAL CUSTOMERS
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdditionalCustomerIndex(null);
                        setAdditionalCustomerForm({ customerName: "", customerAddress: "" });
                        setShowAdditionalCustomerModal(true);
                      }}
                      className="px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1"
                      title="Add Customer"
                    >
                      <User className="w-3 h-3" />
                      Add Customer
                    </button>
                  </div>
                  {additionalCustomers.length > 0 ? (
                    <div className="space-y-2">
                      {additionalCustomers.map((customer, index) => (
                        <div
                          key={index}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1">
                              <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">
                                {customer.customerName}
                              </div>
                              <div className="text-xs text-gray-700 dark:text-gray-300">
                                {customer.customerAddress}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditAdditionalCustomer(index)}
                                className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                                title="Edit Customer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAdditionalCustomer(index)}
                                className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                                title="Delete Customer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      No additional customers
                    </div>
                  )}
                </div>
            </div>
          </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSubmit}
              disabled={creating}
              className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {creating ? "Creating..." : "Create All"}
            </button>
            <button
              onClick={handleClose}
              disabled={creating}
              className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Search Address Modals */}
      <SearchAddressModal
        isOpen={showOrderAddressSearch}
        onClose={() => setShowOrderAddressSearch(false)}
        title="Search Restaurant Address"
        initialQuery={orderData.restaurantName || orderData.restaurantAddress}
        onAddressSelected={(address, placeId, lat, lon, name) => {
          setOrderData((prev) => ({
            ...prev,
            restaurantAddress: address,
            ...(name && { restaurantName: name }),
          }));
          setShowOrderAddressSearch(false);
        }}
      />

      <SearchAddressModal
        isOpen={showCustomerAddressSearch}
        onClose={() => setShowCustomerAddressSearch(false)}
        title="Search Customer Address"
        initialQuery={customerData.customerAddress}
        onAddressSelected={(address) => {
          setCustomerData((prev) => ({
            ...prev,
            customerAddress: address,
          }));
          setShowCustomerAddressSearch(false);
        }}
      />

      {/* Additional Restaurant Modal */}
      <Modal
        isOpen={showAdditionalRestaurantModal}
        onClose={() => {
          setShowAdditionalRestaurantModal(false);
          setEditingAdditionalRestaurantIndex(null);
          setAdditionalRestaurantForm({ name: "", address: "" });
          setError(null);
        }}
        title={editingAdditionalRestaurantIndex !== null ? "Edit Restaurant" : "Add Restaurant"}
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={additionalRestaurantForm.address}
                  onChange={(e) =>
                    setAdditionalRestaurantForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter restaurant address"
                />
                <button
                  type="button"
                  onClick={() => setShowAdditionalRestaurantAddressSearch(true)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  title="Search address"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
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
                setError(null);
              }}
              className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Additional Customer Modal */}
      <Modal
        isOpen={showAdditionalCustomerModal}
        onClose={() => {
          setShowAdditionalCustomerModal(false);
          setEditingAdditionalCustomerIndex(null);
          setAdditionalCustomerForm({ customerName: "", customerAddress: "" });
          setError(null);
        }}
        title={editingAdditionalCustomerIndex !== null ? "Edit Customer" : "Add Customer"}
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <User className="w-4 h-4" />
                Customer Name *
              </label>
              <input
                type="text"
                value={additionalCustomerForm.customerName}
                onChange={(e) =>
                  setAdditionalCustomerForm((prev) => ({ ...prev, customerName: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <MapPin className="w-4 h-4" />
                Customer Address *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={additionalCustomerForm.customerAddress}
                  onChange={(e) =>
                    setAdditionalCustomerForm((prev) => ({ ...prev, customerAddress: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter customer address"
                />
                <button
                  type="button"
                  onClick={() => setShowAdditionalCustomerAddressSearch(true)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  title="Search address"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddAdditionalCustomer}
              className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors min-h-[44px]"
            >
              {editingAdditionalCustomerIndex !== null ? "Update" : "Add"} Customer
            </button>
            <button
              onClick={() => {
                setShowAdditionalCustomerModal(false);
                setEditingAdditionalCustomerIndex(null);
                setAdditionalCustomerForm({ customerName: "", customerAddress: "" });
                setError(null);
              }}
              className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Search Address Modals for Additional Items */}
      <SearchAddressModal
        isOpen={showAdditionalRestaurantAddressSearch}
        onClose={() => setShowAdditionalRestaurantAddressSearch(false)}
        title="Search Restaurant Address"
        initialQuery={additionalRestaurantForm.name || additionalRestaurantForm.address}
        onAddressSelected={(address, placeId, lat, lon, name) => {
          setAdditionalRestaurantForm((prev) => ({
            ...prev,
            address: address,
            ...(name && { name: name }),
          }));
          setShowAdditionalRestaurantAddressSearch(false);
        }}
      />

      <SearchAddressModal
        isOpen={showAdditionalCustomerAddressSearch}
        onClose={() => setShowAdditionalCustomerAddressSearch(false)}
        title="Search Customer Address"
        initialQuery={additionalCustomerForm.customerAddress}
        onAddressSelected={(address) => {
          setAdditionalCustomerForm((prev) => ({
            ...prev,
            customerAddress: address,
          }));
          setShowAdditionalCustomerAddressSearch(false);
        }}
      />
    </>
  );
}

