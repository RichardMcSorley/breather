"use client";

import { useState, useEffect } from "react";
import Card from "./ui/Card";
import { format } from "date-fns";
import { Pencil, Trash2, Utensils, Package } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<DeliveryOrder[]>([]);

  const ITEMS_PER_PAGE = 25;

  useEffect(() => {
    if (userId) {
      if (isSearching && searchQuery.trim() !== "") {
        performSearch();
      } else {
        fetchOrders();
      }
    }
  }, [userId, page, selectedApp]);

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
      
      // Client-side pagination for search results
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      setOrders(data.orders?.slice(startIndex, endIndex) || []);
      setTotalPages(Math.ceil((data.orders?.length || 0) / ITEMS_PER_PAGE));
      setTotal(data.orders?.length || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSearchResults([]);
      setOrders([]);
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
      fetchOrders();
      return;
    }

    // Debounce search
    const timeoutId = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedApp, userId]);

  // Update paginated search results when page changes
  useEffect(() => {
    if (isSearching && searchResults.length > 0) {
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      setOrders(searchResults.slice(startIndex, endIndex));
      setTotalPages(Math.ceil(searchResults.length / ITEMS_PER_PAGE));
    }
  }, [page, searchResults, isSearching]);

  const fetchOrders = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("page", page.toString());
      params.append("limit", ITEMS_PER_PAGE.toString());
      if (selectedApp) {
        params.append("filterAppName", selectedApp);
      }

      const response = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch delivery orders");
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
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

  // Get unique app names for filter dropdown (from all orders we've seen)
  const [uniqueAppNames, setUniqueAppNames] = useState<string[]>([]);
  
  useEffect(() => {
    // Fetch unique app names separately for the filter
    const fetchAppNames = async () => {
      if (!userId) return;
      try {
        const response = await fetch(`/api/delivery-orders?userId=${userId}&limit=1000`);
        if (response.ok) {
          const data = await response.json();
          const appNames = (data.orders || []).map((o: DeliveryOrder) => o.appName).filter((name: string | undefined): name is string => Boolean(name));
          const apps: string[] = Array.from(new Set<string>(appNames)).sort();
          setUniqueAppNames(apps);
        }
      } catch (err) {
        // Silently fail - filter will just be empty
      }
    };
    fetchAppNames();
  }, [userId]);

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

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delivery Orders
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {isSearching
                  ? `Search results (${total} matches)`
                  : `Showing ${orders.length} of ${total} orders`}
              </p>
            </div>
            {uniqueAppNames.length > 0 && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="app-filter"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Filter:
                </label>
                <select
                  id="app-filter"
                  value={selectedApp}
                  onChange={(e) => {
                    setSelectedApp(e.target.value);
                    setPage(1);
                  }}
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

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No delivery orders found.
        </div>
      ) : (
        <>
          {/* Mobile-friendly card layout */}
          <div className="p-4 sm:p-6 space-y-4">
            {orders.map((order) => {
              const appColor = getAppTagColor(order.appName);
              return (
                <div
                  key={order.id}
                  className="rounded-lg p-4 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                >
                  {/* Restaurant name and money amount */}
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="font-bold text-base text-gray-900 dark:text-white text-left flex-1 min-w-0 flex items-center gap-1">
                      <span className="flex-shrink-0"><Utensils className="w-4 h-4" /></span>
                      <span className="truncate">{order.restaurantName}</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white flex-shrink-0">
                      {formatCurrency(order.money)}
                    </div>
                  </div>
                  
                  {/* Date below restaurant name - left aligned */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 text-left">
                    {formatDate(order.processedAt)}
                    {order.time && (
                      <span className="ml-2">• {order.time}</span>
                    )}
                  </div>
                  
                  {/* Miles and ratio - left aligned */}
                  <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-300 mb-2 text-left">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      <span>
                        <span className="font-medium">{order.miles.toFixed(1)}</span> mi
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">${order.milesToMoneyRatio.toFixed(2)}</span>/mi
                    </div>
                  </div>
                  
                  {/* App name badge - left aligned */}
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3 text-left">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${appColor.bg} ${appColor.text}`}>
                      {order.appName}
                    </span>
                  </div>
                  
                  {/* Action buttons right-aligned */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                    {onEditClick && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditClick(order.id);
                        }}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Edit"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(order.id);
                      }}
                      disabled={deletingId === order.id}
                      className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
