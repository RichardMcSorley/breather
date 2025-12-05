"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { format } from "date-fns";

interface Customer {
  address: string;
  customerName: string;
  visitCount: number;
  lastVisitDate?: string;
  firstVisitDate?: string;
}

interface LinkCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId?: string | null;
  userId?: string;
  onLink?: () => void;
}

export default function LinkCustomerModal({
  isOpen,
  onClose,
  transactionId,
  userId,
  onLink,
}: LinkCustomerModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingAddress, setLinkingAddress] = useState<string | null>(null);
  const [filtersActive, setFiltersActive] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ amount?: number; appName?: string }>({});
  const [transactionTime, setTransactionTime] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchCustomers();
    } else {
      setCustomers([]);
      setError(null);
      setFiltersActive(false);
      setActiveFilters({});
    }
  }, [isOpen, userId, transactionId]);

  const fetchCustomers = async (skipFilters = false) => {
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
          
          // Add filtering parameters
          if (transactionData.amount) {
            params.append("filterAmount", transactionData.amount.toString());
            filters.amount = transactionData.amount;
          }
          if (transactionData.tag) {
            params.append("filterAppName", transactionData.tag);
            filters.appName = transactionData.tag;
          }
        }
      } else {
        setTransactionTime(null);
      }

      setFiltersActive(!skipFilters && (filters.amount !== undefined || filters.appName !== undefined));
      setActiveFilters(filters);

      const response = await fetch(`/api/ocr-exports/customers?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }

      const data = await response.json();
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    fetchCustomers(true);
  };

  const handleLink = async (customerAddress: string) => {
    if (!transactionId) return;

    try {
      setLinkingAddress(customerAddress);
      setError(null);

      // First, get the first OcrExport entry for this address to get the ID
      const encodedAddress = encodeURIComponent(customerAddress);
      const customerResponse = await fetch(`/api/ocr-exports/customers/${encodedAddress}?userId=${userId}`);
      if (!customerResponse.ok) {
        throw new Error("Failed to fetch customer details");
      }

      const customerData = await customerResponse.json();
      if (!customerData.visits || customerData.visits.length === 0) {
        throw new Error("Customer not found");
      }

      const ocrExportId = customerData.visits[0]._id;

      const response = await fetch("/api/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId,
          ocrExportId,
          action: "link",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link customer");
      }

      // Transition transaction step to NAV_TO_CUSTOMER after linking
      if (transactionId) {
        try {
          await fetch(`/api/transactions/${transactionId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              step: "NAV_TO_CUSTOMER",
            }),
          });
        } catch (err) {
          console.error("Error updating transaction step:", err);
        }
      }

      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link customer");
    } finally {
      setLinkingAddress(null);
    }
  };

  const handleSkip = async () => {
    if (!transactionId) return;

    try {
      setError(null);
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          step: "NAV_TO_CUSTOMER",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to skip step" }));
        throw new Error(errorData.error || "Failed to skip step");
      }

      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to skip step");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Customer">
      {transactionId && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-base font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-md"
          >
            Skip Step
          </button>
        </div>
      )}
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

      {loading && customers.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {customers.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          {filtersActive ? (
            <>
              No customers found matching the filters.
              <button
                onClick={handleClearFilters}
                className="block mt-2 text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear filters to see all customers
              </button>
            </>
          ) : (
            "No customers found."
          )}
        </div>
      )}

      {customers.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {customers.map((customer) => (
            <div
              key={customer.address}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {customer.customerName}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {customer.address}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {customer.visitCount} visit{customer.visitCount !== 1 ? "s" : ""}
                  {customer.lastVisitDate && (
                    <> • Last: {format(new Date(customer.lastVisitDate), "MMM d, yyyy 'at' h:mm a")}</>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleLink(customer.address)}
                disabled={linkingAddress === customer.address}
                className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed ml-4"
              >
                {linkingAddress === customer.address ? "Linking..." : "Link"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

