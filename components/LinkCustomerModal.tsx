"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { format } from "date-fns";
import { formatAddress } from "@/lib/address-formatter";

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
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingAddress, setLinkingAddress] = useState<string | null>(null);
  const [filtersActive, setFiltersActive] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ amount?: number; appName?: string }>({});
  const [transactionTime, setTransactionTime] = useState<string | null>(null);
  const [errorAddress, setErrorAddress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (isOpen && userId) {
      fetchCustomers();
    } else {
      setCustomers([]);
      setAllCustomers([]);
      setError(null);
      setFiltersActive(false);
      setActiveFilters({});
      setSearchQuery("");
    }
  }, [isOpen, userId, transactionId]);

  // Filter customers based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setCustomers(allCustomers);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = allCustomers.filter(
        (customer) =>
          customer.customerName.toLowerCase().includes(query) ||
          customer.address.toLowerCase().includes(query)
      );
      setCustomers(filtered);
    }
  }, [searchQuery, allCustomers]);

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
      setAllCustomers(data.customers || []);
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

  const handleLink = async (customerAddress: string, force: boolean = false) => {
    if (!transactionId) return;

    try {
      setLinkingAddress(customerAddress);
      setError(null);
      setErrorAddress(null);

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
          force: force || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || "Failed to link customer";
        const isAppNameMismatch = errorMessage.includes("appName does not match");
        
        if (isAppNameMismatch && !force) {
          // Store the error and address so we can show the force button
          setError(errorMessage);
          setErrorAddress(customerAddress);
          setLinkingAddress(null);
          return;
        }
        
        throw new Error(errorMessage);
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
      setErrorAddress(null);
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
      <div className="space-y-4">
        {/* Search Input */}
        <div>
          <label htmlFor="search-customer-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search:
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              id="search-customer-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name or address..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Filters Active Banner */}
        {filtersActive && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                  Filters Active
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-400">
                  {activeFilters.amount !== undefined && `Amount: $${activeFilters.amount.toFixed(2)}`}
                  {activeFilters.amount !== undefined && activeFilters.appName && " • "}
                  {activeFilters.appName && `App: ${activeFilters.appName}`}
                </div>
                {transactionTime && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    Transaction: {transactionTime}
                  </div>
                )}
              </div>
              <button
                onClick={handleClearFilters}
                className="ml-4 px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-red-600 dark:text-red-400">Error: {error}</div>
              </div>
              {errorAddress && error.includes("appName does not match") && (
                <button
                  onClick={() => handleLink(errorAddress, true)}
                  disabled={linkingAddress === errorAddress}
                  className="px-3 py-1.5 text-sm rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {linkingAddress === errorAddress ? "Linking..." : "Force Link"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && customers.length === 0 && (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        )}

        {/* No Customers */}
        {!loading && customers.length === 0 && (
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
            ) : searchQuery.trim() !== "" ? (
              "No customers found matching your search."
            ) : (
              "No customers found."
            )}
          </div>
        )}

        {/* Customer Results */}
        {customers.length > 0 && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              CUSTOMERS
            </h3>
            {customers.map((customer) => {
              const formattedAddress = formatAddress(customer.address);
              return (
                <div
                  key={customer.address}
                  className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4"
                >
                  {/* Left side: All text content */}
                  <div className="flex-1 text-left">
                    {/* Customer Name */}
                    <div className="font-bold text-base text-gray-900 dark:text-white mb-2">
                      {customer.customerName}
                    </div>
                    
                    {/* Address */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {formattedAddress}
                    </div>
                    
                    {/* Visit count and last visit */}
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {customer.visitCount} visit{customer.visitCount !== 1 ? "s" : ""}
                      {customer.lastVisitDate && (
                        <> • Last: {format(new Date(customer.lastVisitDate), "MMM d, yyyy 'at' h:mm a")}</>
                      )}
                    </div>
                  </div>
                  
                  {/* Right side: Link button (vertically centered) */}
                  <div className="flex-shrink-0">
                    {errorAddress === customer.address && error?.includes("appName does not match") ? (
                      <button
                        onClick={() => handleLink(customer.address, true)}
                        disabled={linkingAddress === customer.address}
                        className="px-6 py-2 text-sm font-medium rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] transition-colors"
                      >
                        {linkingAddress === customer.address ? "Linking..." : "Force Link"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLink(customer.address)}
                        disabled={linkingAddress === customer.address}
                        className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] transition-colors"
                      >
                        {linkingAddress === customer.address ? "Linking..." : "Link"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Skip Step button at bottom */}
        {transactionId && (
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSkip}
              className="px-6 py-2 text-base font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-md min-h-[44px]"
            >
              Skip Step
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
