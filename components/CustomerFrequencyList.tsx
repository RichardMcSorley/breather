"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Pencil, Trash2, User, MapPin } from "lucide-react";

interface Customer {
  address: string;
  customerName: string;
  customerNames?: string[];
  visitCount: number;
  isRepeatCustomer: boolean;
  firstVisitDate: string;
  lastVisitDate: string;
  apps: string[];
}

interface CustomerFrequencyListProps {
  userId?: string;
  onCustomerClick?: (address: string) => void;
  onEditClick?: (address: string) => void;
  onDelete?: () => void;
}

export default function CustomerFrequencyList({
  userId,
  onCustomerClick,
  onEditClick,
  onDelete,
}: CustomerFrequencyListProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deletingAddress, setDeletingAddress] = useState<string | null>(null);
  const [confirmDeleteAddress, setConfirmDeleteAddress] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, [userId, page]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      params.append("page", page.toString());
      params.append("limit", "25");

      const response = await fetch(`/api/ocr-exports/customers?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }

      const data = await response.json();
      setCustomers(data.customers || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (address: string) => {
    setConfirmDeleteAddress(address);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteAddress || !userId) return;

    try {
      setDeletingAddress(confirmDeleteAddress);
      setError(null);

      const params = new URLSearchParams();
      params.append("address", confirmDeleteAddress);

      const response = await fetch(`/api/ocr-exports/customers?${params.toString()}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete entries");
      }

      // Refresh the list
      await fetchCustomers();
      setConfirmDeleteAddress(null);
      setDeletingAddress(null);
      
      // Notify parent component to refresh its data
      if (onDelete) {
        onDelete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entries");
      setDeletingAddress(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteAddress(null);
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

  if (loading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  if (error && customers.length === 0) {
    return (
      <div className="rounded-lg p-4 mb-2 border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {customers.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No customers found.
        </div>
      ) : (
        <>
          {customers.map((customer) => (
            <div
              key={customer.address}
              className={`rounded-lg p-4 pb-4 mb-2 border flex flex-col gap-3 overflow-visible min-w-0 ${
                customer.isRepeatCustomer
                  ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 shadow-md"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              {/* Top section: App badges and visit count */}
              <div className="flex items-start justify-between mb-1 gap-2 min-w-0">
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  {customer.apps.length > 0 && customer.apps.slice(0, 2).map((app) => {
                    const appColor = getAppTagColor(app);
                    return (
                      <span key={app} className={`text-sm px-2 py-1 rounded flex-shrink-0 ${appColor.bg} ${appColor.text}`}>
                        {app}
                      </span>
                    );
                  })}
                  {customer.apps.length > 2 && (
                    <span className="text-sm px-2 py-1 rounded flex-shrink-0 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      +{customer.apps.length - 2} more
                    </span>
                  )}
                  {customer.isRepeatCustomer && (
                    <span className="text-sm px-2 py-1 rounded flex-shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Repeat
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold flex-shrink-0 text-gray-900 dark:text-white">
                  {customer.visitCount}
                </div>
              </div>

              {/* Address */}
              <div className="mb-1 min-w-0">
                <button
                  onClick={() => {
                    if (onCustomerClick) {
                      onCustomerClick(customer.address);
                    }
                  }}
                  className="text-sm text-gray-900 dark:text-white hover:underline flex items-center gap-1 text-left w-full min-w-0"
                >
                  <span className="flex-shrink-0"><MapPin className="w-4 h-4" /></span>
                  <span className="truncate">
                    {customer.address}
                  </span>
                </button>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Last: {formatDate(customer.lastVisitDate)} {formatDateTime(customer.lastVisitDate)}
                  {customer.firstVisitDate !== customer.lastVisitDate && (
                    <> • First: {formatDate(customer.firstVisitDate)}</>
                  )}
                </div>
              </div>

              {/* Bottom section: Customer names and Edit/Delete buttons */}
              <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-200 dark:border-gray-700 gap-2 min-w-0">
                {customer.customerNames && customer.customerNames.length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-0 flex items-center gap-1">
                    <span className="flex-shrink-0"><User className="w-3 h-3" /></span>
                    <span className="truncate">{customer.customerNames.join(" • ")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {onEditClick && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditClick(customer.address);
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
                      handleDeleteClick(customer.address);
                    }}
                    disabled={deletingAddress === customer.address}
                    className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                <span className="hidden sm:inline">
                  Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, total)} of {total} customers
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
      {confirmDeleteAddress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl relative z-[10000]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirm Delete
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              Are you sure you want to delete all entries for this address?
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Address:
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 break-words">
              {confirmDeleteAddress}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              This will delete{" "}
              {customers.find((c) => c.address === confirmDeleteAddress)?.visitCount || 0}{" "}
              entr{customers.find((c) => c.address === confirmDeleteAddress)?.visitCount === 1 ? "y" : "ies"}. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deletingAddress !== null}
                className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletingAddress !== null}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingAddress ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
