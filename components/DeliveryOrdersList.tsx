"use client";

import { useState, useEffect } from "react";
import Card from "./ui/Card";
import { format } from "date-fns";

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

interface DeliveryOrdersListProps {
  userId?: string;
  onRefresh?: () => void;
  onEditClick?: (orderId: string) => void;
}

export default function DeliveryOrdersList({
  userId,
  onRefresh,
  onEditClick,
}: DeliveryOrdersListProps) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [allOrders, setAllOrders] = useState<DeliveryOrder[]>([]);
  const [searchResults, setSearchResults] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    fetchOrders();
  }, [userId]);

  const performSearch = async () => {
    if (!userId || searchQuery.trim() === "") {
      return;
    }

    try {
      setSearchLoading(true);
      setError(null);
      setIsSearching(true);
      setPage(1);

      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("query", searchQuery.trim());
      if (selectedApp) {
        params.append("filterAppName", selectedApp);
      }

      const response = await fetch(`/api/delivery-orders/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to search delivery orders");
      }

      const data = await response.json();
      setSearchResults(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle search
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setIsSearching(false);
      setSearchResults([]);
      setPage(1);
      return;
    }

    // Debounce search
    const timeoutId = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedApp, userId]);

  // Filter orders by app name (for non-search view)
  useEffect(() => {
    if (!isSearching) {
      let filtered = allOrders;

      // Filter by app name if selected
      if (selectedApp !== "") {
        filtered = filtered.filter(
          (order) => order.appName.toLowerCase() === selectedApp.toLowerCase()
        );
      }

      // Update paginated orders
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      setOrders(filtered.slice(startIndex, endIndex));
      setTotalPages(Math.ceil(filtered.length / ITEMS_PER_PAGE));
    }
  }, [selectedApp, allOrders, page, isSearching]);

  // Update paginated orders when search results or page changes
  useEffect(() => {
    if (isSearching) {
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      setOrders(searchResults.slice(startIndex, endIndex));
      setTotalPages(Math.ceil(searchResults.length / ITEMS_PER_PAGE));
    }
  }, [searchResults, page, isSearching]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      params.append("limit", "100"); // Keep original limit for regular view

      const response = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch delivery orders");
      }

      const data = await response.json();
      const fetchedOrders = data.orders || [];
      setAllOrders(fetchedOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || !userId) return;

    try {
      setDeletingId(confirmDeleteId);
      setError(null);

      const response = await fetch(`/api/delivery-orders?id=${confirmDeleteId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete order");
      }

      // Refresh the list or search results based on current state
      if (isSearching && searchQuery.trim() !== "") {
        // Re-run search to refresh results
        await performSearch();
      } else {
        // Refresh regular list
        await fetchOrders();
      }
      setConfirmDeleteId(null);
      setDeletingId(null);
      
      // Notify parent component to refresh its data
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete order");
      setDeletingId(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
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

  const handleShareRestaurant = async (restaurantName: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          text: restaurantName,
        });
      } catch (err) {
        // User cancelled or error occurred - silently fail
        console.log("Share cancelled or failed:", err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(restaurantName);
        alert("Restaurant name copied to clipboard");
      } catch (err) {
        console.error("Failed to copy restaurant name:", err);
      }
    }
  };

  if (loading && orders.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Card>
    );
  }

  if (error && orders.length === 0) {
    return (
      <Card className="p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </Card>
    );
  }

  // Get unique app names for filter dropdown
  const uniqueAppNames = Array.from(
    new Set(allOrders.map((order) => order.appName).filter(Boolean))
  ).sort();

  // Calculate statistics from current view (search results or filtered orders)
  const currentOrders = isSearching ? searchResults : allOrders.filter(
    (order) => selectedApp === "" || order.appName.toLowerCase() === selectedApp.toLowerCase()
  );

  const avgMiles = currentOrders.length > 0
    ? currentOrders.reduce((sum, order) => sum + order.miles, 0) / currentOrders.length 
    : 0;
  const avgRatio = currentOrders.length > 0
    ? currentOrders.reduce((sum, order) => sum + order.milesToMoneyRatio, 0) / currentOrders.length
    : 0;
  const highestMiles = currentOrders.length > 0
    ? Math.max(...currentOrders.map(order => order.miles))
    : 0;
  const highestEarnings = currentOrders.length > 0
    ? Math.max(...currentOrders.map(order => order.money))
    : 0;
  const lowestEarnings = currentOrders.length > 0
    ? Math.min(...currentOrders.map(order => order.money))
    : 0;

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delivery Orders
              </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isSearching
                ? `Search results (${searchResults.length} matches)`
                : "Orders sorted by most recent"}
            </p>
          </div>
            {uniqueAppNames.length > 0 && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="app-filter"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Filter by App:
                </label>
                <select
                  id="app-filter"
                  value={selectedApp}
                  onChange={(e) => setSelectedApp(e.target.value)}
                  className="px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Apps</option>
                  {uniqueAppNames.map((appName) => (
                    <option key={appName} value={appName}>
                      {appName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="search-orders"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Search:
            </label>
            <input
              id="search-orders"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by app name or restaurant..."
              className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-white"></div>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-h-[44px]"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      {currentOrders.length > 0 && (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Avg Miles
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {avgMiles.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Avg Ratio
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {avgRatio.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Highest Miles
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {highestMiles.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Highest Earnings
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {formatCurrency(highestEarnings)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Lowest Earnings
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {formatCurrency(lowestEarnings)}
              </div>
            </div>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No delivery orders found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date/Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Restaurant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    App
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Miles
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Money
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Ratio
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatDate(order.processedAt)}
                      </div>
                      {order.time && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Order time: {order.time}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {order.restaurantName}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShareRestaurant(order.restaurantName);
                          }}
                          className="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Share Restaurant"
                        >
                          📤
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {order.appName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {order.miles.toFixed(1)} mi
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(order.money)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${order.milesToMoneyRatio.toFixed(2)}/mi
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex gap-2 justify-end">
                        {onEditClick && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditClick(order.id);
                            }}
                            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(order.id);
                          }}
                          disabled={deletingId === order.id}
                          className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingId === order.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2 justify-center sm:justify-end">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl relative z-[10000]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirm Delete
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete this delivery order? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

