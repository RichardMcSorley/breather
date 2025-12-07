"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import CustomerFrequencyList from "@/components/CustomerFrequencyList";
import CustomerDetailsModal from "@/components/CustomerDetailsModal";
import EditCustomerEntriesModal from "@/components/EditCustomerEntriesModal";
import SearchAddressModal from "@/components/SearchAddressModal";

interface OcrExportEntry {
  _id: string;
  entryId: string;
  userId: string;
  appName?: string;
  customerName: string;
  customerAddress: string;
  rawResponse?: string;
  lat?: number;
  lon?: number;
  geocodeDisplayName?: string;
  processedAt: string;
  createdAt: string;
  updatedAt: string;
}

function OcrDataPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<OcrExportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showSearchAddressModal, setShowSearchAddressModal] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    customerName: "",
    customerAddress: "",
    appName: "",
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchOcrData();
    }
  }, [userId]);

  // Check for address query parameter and auto-open customer details
  useEffect(() => {
    const addressParam = searchParams.get("address");
    const entryIdParam = searchParams.get("entryId");
    if (addressParam && userId) {
      const decodedAddress = decodeURIComponent(addressParam);
      if (entryIdParam) {
        // If entryId is present, open edit modal
        setEditingAddress(decodedAddress);
        setEditingEntryId(entryIdParam);
      } else {
        // Otherwise, open view modal
      setSelectedCustomer(decodedAddress);
      }
    }
  }, [searchParams, userId]);

  const fetchOcrData = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/ocr-exports?userId=${userId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch customer data");
      }
      const data = await response.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!userId) return;

    // Validate form
    if (!createFormData.customerName.trim()) {
      setCreateError("Customer name is required");
      return;
    }
    if (!createFormData.customerAddress.trim()) {
      setCreateError("Customer address is required");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);

      const response = await fetch("/api/ocr-exports/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          customerName: createFormData.customerName.trim(),
          customerAddress: createFormData.customerAddress.trim(),
          ...(createFormData.appName.trim() && { appName: createFormData.appName.trim() }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create customer");
      }

      // Refresh customer list and close modal
      setShowCreateCustomerModal(false);
      setCreateFormData({
        customerName: "",
        customerAddress: "",
        appName: "",
      });
      // Refresh the customer list by triggering a refetch
      setRefreshTrigger((prev) => prev + 1);
      fetchOcrData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateCustomerModal(false);
    setCreateFormData({
      customerName: "",
      customerAddress: "",
      appName: "",
    });
    setCreateError(null);
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Data</h2>
        <button
          onClick={() => setShowCreateCustomerModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add Customer</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {error && (
        <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </Card>
      )}

      {/* Customer Frequency List */}
      <div className="mb-6">
        <CustomerFrequencyList
          userId={userId}
          onCustomerClick={(address) => setSelectedCustomer(address)}
          onEditClick={(address) => setEditingAddress(address)}
          onDelete={() => fetchOcrData()}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Customer Details Modal */}
      <CustomerDetailsModal
        isOpen={selectedCustomer !== null}
        onClose={() => setSelectedCustomer(null)}
        address={selectedCustomer}
        userId={userId}
      />

      {/* Edit Customer Entries Modal */}
      <EditCustomerEntriesModal
        isOpen={editingAddress !== null}
        onClose={() => {
          setEditingAddress(null);
          setEditingEntryId(null);
        }}
        address={editingAddress}
        entryId={editingEntryId}
        userId={userId}
        onUpdate={() => {
          fetchOcrData();
          setEditingAddress(null);
          setEditingEntryId(null);
        }}
      />

      {/* Create Customer Modal */}
      <Modal
        isOpen={showCreateCustomerModal}
        onClose={handleCloseCreateModal}
        title="Create New Customer"
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
                Customer Name *
              </label>
              <input
                type="text"
                value={createFormData.customerName}
                onChange={(e) =>
                  setCreateFormData((prev) => ({ ...prev, customerName: e.target.value }))
                }
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
                  onChange={(e) =>
                    setCreateFormData((prev) => ({ ...prev, customerAddress: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter customer address"
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
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateCustomer}
              disabled={creating}
              className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {creating ? "Creating..." : "Create Customer"}
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

      {/* Search Address Modal */}
      <SearchAddressModal
        isOpen={showSearchAddressModal}
        onClose={() => setShowSearchAddressModal(false)}
        title="Search Customer Address"
        initialQuery={createFormData.customerAddress}
        onAddressSelected={(address) => {
          setCreateFormData((prev) => ({
            ...prev,
            customerAddress: address,
          }));
          setShowSearchAddressModal(false);
        }}
      />
    </Layout>
  );
}

export default function OcrDataPage() {
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
      <OcrDataPageContent />
    </Suspense>
  );
}

