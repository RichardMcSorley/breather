"use client";

import { useState, useEffect } from "react";
import Card from "./ui/Card";
import { format } from "date-fns";
import { Pencil, Trash2, Eye } from "lucide-react";

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

  if (loading && customers.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Card>
    );
  }

  if (error && customers.length === 0) {
    return (
      <Card className="p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Customer Frequency
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Customers sorted by latest visit
        </p>
      </div>

      {customers.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No customers found.
        </div>
      ) : (
        <>
          {/* Mobile-friendly card layout */}
          <div className="p-4 sm:p-6 space-y-4">
            {customers.map((customer) => (
              <div
                key={customer.address}
                className={`rounded-lg p-4 border ${
                  customer.isRepeatCustomer
                    ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                } hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
              >
                {/* Header: Customer name and visit count */}
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                        {customer.customerName}
                      </h4>
                      {customer.isRepeatCustomer && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex-shrink-0">
                          Repeat
                        </span>
                      )}
                    </div>
                    {customer.customerNames && customer.customerNames.length > 1 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        +{customer.customerNames.length - 1} more name{customer.customerNames.length - 1 !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {customer.visitCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      visit{customer.visitCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3 break-words">
                  {customer.address}
                </div>

                {/* Details: Apps and dates */}
                <div className="space-y-2 mb-3">
                  {customer.apps.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {customer.apps.slice(0, 3).map((app) => (
                        <span
                          key={app}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {app}
                        </span>
                      ))}
                      {customer.apps.length > 3 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          +{customer.apps.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Last visit: {formatDate(customer.lastVisitDate)}
                    {customer.firstVisitDate !== customer.lastVisitDate && (
                      <> • First: {formatDate(customer.firstVisitDate)}</>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                  {onCustomerClick && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCustomerClick(customer.address);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[44px]"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  )}
                  {onEditClick && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditClick(customer.address);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 min-h-[44px]"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(customer.address);
                    }}
                    disabled={deletingAddress === customer.address}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingAddress === customer.address ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
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
    </Card>
  );
}
