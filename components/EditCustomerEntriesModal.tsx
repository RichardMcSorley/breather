"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { format } from "date-fns";
import MetadataViewer from "./MetadataViewer";

interface Visit {
  _id: string;
  entryId: string;
  customerName: string;
  customerAddress: string;
  appName?: string;
  screenshot?: string;
  metadata?: Record<string, any>;
  processedAt: string;
  createdAt: string;
  lat?: number;
  lon?: number;
  geocodeDisplayName?: string;
}

interface CustomerDetails {
  address: string;
  customerName: string;
  customerNames?: string[];
  visitCount: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
  apps: string[];
  visits: Visit[];
}

interface EditCustomerEntriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string | null;
  entryId?: string | null;
  userId?: string;
  onUpdate?: () => void;
}

export default function EditCustomerEntriesModal({
  isOpen,
  onClose,
  address,
  entryId,
  userId,
  onUpdate,
}: EditCustomerEntriesModalProps) {
  const [data, setData] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    appName: "",
    customerName: "",
    customerAddress: "",
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && address) {
      fetchCustomerDetails();
    } else {
      setData(null);
      setError(null);
      setEditingId(null);
    }
  }, [isOpen, address, userId]);

  // Auto-start editing when data loads and entryId is provided
  useEffect(() => {
    if (data && entryId && !editingId && !loading) {
      const entryToEdit = data.visits.find(
        (visit: Visit) => visit._id === entryId
      );
      if (entryToEdit) {
        startEditing(entryToEdit);
      }
    }
  }, [data, entryId, editingId, loading]);

  const fetchCustomerDetails = async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);

      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `/api/ocr-exports/customers/${encodedAddress}?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch customer details");
      }

      const customerData = await response.json();
      setData(customerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (visit: Visit) => {
    setEditingId(visit._id);
    setFormValues({
      appName: visit.appName || "",
      customerName: visit.customerName || "",
      customerAddress: visit.customerAddress || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormValues({
      appName: "",
      customerName: "",
      customerAddress: "",
    });
  };

  const handleSave = async (id: string) => {
    try {
      setSaving(true);
      const response = await fetch("/api/ocr-exports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          ...formValues,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update entry");
      }

      await fetchCustomerDetails();
      onUpdate?.();
      cancelEditing();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/ocr-exports?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete entry");
      }

      await fetchCustomerDetails();
      onUpdate?.();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch {
      return dateString;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Entries - ${address || ""}`}>
      {loading && !data && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {data.visitCount} {data.visitCount === 1 ? "entry" : "entries"} for this address
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {data.visits.map((visit) => (
              <div
                key={visit._id}
                className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                {editingId === visit._id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        value={formValues.customerName}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            customerName: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Address
                      </label>
                      <textarea
                        value={formValues.customerAddress}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            customerAddress: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        App Name
                      </label>
                      <input
                        type="text"
                        value={formValues.appName}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            appName: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(visit._id)}
                        disabled={saving}
                        className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDate(visit.processedAt || visit.createdAt)}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          {visit.customerName}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {visit.customerAddress}
                        </div>
                      </div>
                      {visit.appName && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          {visit.appName}
                        </span>
                      )}
                    </div>
                    {visit.screenshot && typeof visit.screenshot === 'string' && visit.screenshot.trim().length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Screenshot</div>
                        <div className="rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                          <img
                            src={`data:image/png;base64,${visit.screenshot}`}
                            alt="Customer screenshot"
                            className="w-full h-auto max-h-[300px] object-contain"
                          />
                        </div>
                      </div>
                    )}
                    <MetadataViewer metadata={visit.metadata} title="Extracted Metadata" />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => startEditing(visit)}
                        className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(visit._id)}
                        disabled={deletingId === visit._id}
                        className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === visit._id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

