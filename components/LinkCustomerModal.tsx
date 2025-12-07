"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import SearchAddressModal from "./SearchAddressModal";
import { format } from "date-fns";
import { formatAddress } from "@/lib/address-formatter";
import { Search } from "lucide-react";

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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionData, setTransactionData] = useState<{ date?: string; time?: string; amount?: number; tag?: string } | null>(null);
  const [createFormData, setCreateFormData] = useState({
    customerName: "",
    customerAddress: "",
  });
  const [showSearchAddressModal, setShowSearchAddressModal] = useState(false);

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
      setShowCreateForm(false);
      setTransactionData(null);
      setCreateFormData({
        customerName: "",
        customerAddress: "",
      });
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
        setTransactionData(null);
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

  const handleCreateCustomer = async () => {
    if (!userId || !transactionId) return;

    // Validate form
    if (!createFormData.customerName.trim()) {
      setError("Customer name is required");
      return;
    }
    if (!createFormData.customerAddress.trim()) {
      setError("Customer address is required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const response = await fetch("/api/ocr-exports/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          customerName: createFormData.customerName.trim(),
          customerAddress: createFormData.customerAddress.trim(),
          appName: transactionData?.tag || undefined,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create customer");
      }

      // Refresh customers list and close create form
      setShowCreateForm(false);
      await fetchCustomers();
      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreating(false);
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
        {!loading && customers.length === 0 && !showCreateForm && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {filtersActive ? (
              <>
                <p>No customers found matching the filters.</p>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleClearFilters}
                    className="block w-full px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Clear filters to see all customers
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
                            }
                          } catch (err) {
                            setError("Failed to load transaction data");
                            return;
                          }
                        }
                        setShowCreateForm(true);
                      }}
                      className="block w-full px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      Create New Customer
                    </button>
                  )}
                </div>
              </>
            ) : searchQuery.trim() !== "" ? (
              <>
                <p>No customers found matching your search.</p>
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
                    Create New Customer
                  </button>
                )}
              </>
            ) : (
              <>
                <p>No customers found.</p>
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
                    Create New Customer
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Create Customer Form */}
        {showCreateForm && (
          <div className="space-y-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
              Create New Customer
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={createFormData.customerName}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter customer name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer Address *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={createFormData.customerAddress}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, customerAddress: e.target.value }))}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter customer address"
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
                  Customer will be created and linked to transaction: {transactionData.date} {transactionData.time ? `at ${transactionData.time}` : ""}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreateCustomer}
                disabled={creating}
                className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "Creating..." : "Create & Link Customer"}
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

        {/* Customer Results */}
        {customers.length > 0 && !showCreateForm && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                CUSTOMERS
              </h3>
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
                        }
                      } catch (err) {
                        setError("Failed to load transaction data");
                        return;
                      }
                    }
                    setShowCreateForm(true);
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Create New Customer
                </button>
              )}
            </div>
            {customers.map((customer) => {
              const formattedAddress = formatAddress(customer.address);
              return (
                <div
                  key={customer.address}
                  className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4"
                >
                  {/* Left side: All text content */}
                  <div className="flex-1 text-left min-w-0 overflow-hidden">
                    {/* Customer Name */}
                    <div className="font-bold text-base text-gray-900 dark:text-white mb-2 truncate">
                      {customer.customerName}
                    </div>
                    
                    {/* Address */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 truncate">
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

      {/* Search Address Modal */}
      <SearchAddressModal
        isOpen={showSearchAddressModal}
        onClose={() => setShowSearchAddressModal(false)}
        title="Search Customer Address"
        initialQuery={createFormData.customerAddress}
        onAddressSelected={(address) => {
          setCreateFormData(prev => ({
            ...prev,
            customerAddress: address,
          }));
          setShowSearchAddressModal(false);
        }}
      />
    </Modal>
  );
}
