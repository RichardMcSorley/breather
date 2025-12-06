"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Pencil, Trash2, Utensils, Package, Search } from "lucide-react";

interface AdditionalRestaurant {
  name: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lon?: number;
}

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  restaurantAddress?: string;
  time: string;
  processedAt: string;
  createdAt: string;
  additionalRestaurants?: AdditionalRestaurant[];
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>("");

  useEffect(() => {
    if (userId) {
      fetchOrders();
    }
  }, [userId, page, activeSearchQuery]);

  const fetchOrders = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("page", page.toString());
      params.append("limit", "25");
      if (activeSearchQuery.trim()) {
        params.append("search", activeSearchQuery.trim());
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

      // Refresh the list
      await fetchOrders();
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
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "h:mm a");
    } catch {
      return "";
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

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="rounded-lg p-4 mb-2 border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search Input */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setActiveSearchQuery(searchQuery);
              setPage(1);
            }
          }}
          placeholder="Search by restaurant name or address..."
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={() => {
            setActiveSearchQuery(searchQuery);
            setPage(1);
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[44px] flex items-center justify-center gap-2 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No delivery orders found.
        </div>
      ) : (
        <>
          {orders.map((order) => {
            const appColor = getAppTagColor(order.appName);
            return (
              <div
                key={order.id}
                className="rounded-lg p-4 pb-4 mb-2 border flex flex-col gap-3 overflow-visible min-w-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                {/* Top section: App badge and money amount */}
                <div className="flex items-start justify-between mb-1 gap-2 min-w-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                    <span className={`text-sm px-2 py-1 rounded flex-shrink-0 ${appColor.bg} ${appColor.text}`}>
                      {order.appName}
                    </span>
                  </div>
                  <div className="text-lg font-bold flex-shrink-0 text-gray-900 dark:text-white">
                    {formatCurrency(order.money)}
                  </div>
                </div>

                {/* Restaurant name */}
                <div className="mb-1 min-w-0">
                  <div className="text-sm text-gray-900 dark:text-white flex items-center gap-1 text-left w-full min-w-0">
                    <span className="flex-shrink-0"><Utensils className="w-4 h-4" /></span>
                    <span className="truncate">
                      {order.restaurantName}
                    </span>
                  </div>
                  {order.restaurantAddress && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                      {order.restaurantAddress}
                    </div>
                  )}
                  {/* Additional restaurants */}
                  {order.additionalRestaurants && order.additionalRestaurants.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {order.additionalRestaurants.map((restaurant, idx) => (
                        <div key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1 text-left w-full min-w-0">
                          <span className="flex-shrink-0"><Utensils className="w-3 h-3" /></span>
                          <span className="truncate">
                            {restaurant.name}
                            {restaurant.address && (
                              <> • <span className="text-xs text-gray-500 dark:text-gray-400">{restaurant.address}</span></>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDate(order.processedAt)} {formatDateTime(order.processedAt)}
                    {order.time && (
                      <> • {order.time}</>
                    )}
                  </div>
                </div>

                {/* Bottom section: Miles/ratio and Edit/Delete buttons */}
                <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-200 dark:border-gray-700 gap-2 min-w-0">
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-0 flex items-center gap-2">
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
                  <div className="flex items-center gap-2 flex-shrink-0">
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
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                <span className="hidden sm:inline">
                  Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, total)} of {total} orders
                </span>
                <span className="sm:hidden">
                  Page {page} of {totalPages}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                    page === 1
                      ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium ${
                          page === pageNum
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                    page === totalPages
                      ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
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
    </div>
  );
}
