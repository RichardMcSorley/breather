"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import CustomerLocationMap from "@/components/CustomerLocationMap";
import { format } from "date-fns";

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

export default function OcrDataPage() {
  const [entries, setEntries] = useState<OcrExportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    appName: "",
    customerName: "",
    customerAddress: "",
    rawResponse: "",
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOcrData();
  }, []);

  const fetchOcrData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/ocr-exports");
      if (!response.ok) {
        throw new Error("Failed to fetch OCR data");
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

  const startEditing = (entry: OcrExportEntry) => {
    setEditingId(entry._id);
    setFormValues({
      appName: entry.appName || "",
      customerName: entry.customerName || "",
      customerAddress: entry.customerAddress || "",
      rawResponse: entry.rawResponse || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormValues({
      appName: "",
      customerName: "",
      customerAddress: "",
      rawResponse: "",
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

      const data = await response.json();
      const updated = data.entry as OcrExportEntry;

      // Update the entry in state
      setEntries((current) =>
        current.map((entry) => (entry._id === id ? updated : entry))
      );
      
      // Refetch data to ensure we have the latest from database
      await fetchOcrData();
      
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

      // Remove the entry from the list
      setEntries((current) => current.filter((entry) => entry._id !== id));
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

  const truncateText = (text: string, maxLength: number = 100) => {
    if (!text) return "-";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
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

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">OCR Data Explorer</h2>
      </div>

      {error && (
        <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </Card>
      )}

      {entries.length > 0 && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Customer Locations Map
          </h3>
          <CustomerLocationMap entries={entries} />
        </Card>
      )}

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No OCR data found.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    App Name
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Customer Name
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Customer Address
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date 
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {entries.map((entry) => (
                  <tr
                    key={entry._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {editingId === entry._id ? (
                          <input
                            type="text"
                            value={formValues.appName}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                appName: e.target.value,
                              }))
                            }
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white"
                          />
                        ) : (
                          entry.appName || "-"
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {editingId === entry._id ? (
                          <input
                            type="text"
                            value={formValues.customerName}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                customerName: e.target.value,
                              }))
                            }
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white"
                          />
                        ) : (
                          entry.customerName || "-"
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="text-sm text-gray-700 dark:text-gray-300 max-w-md">
                        {editingId === entry._id ? (
                          <textarea
                            value={formValues.customerAddress}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                customerAddress: e.target.value,
                              }))
                            }
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white"
                            rows={2}
                          />
                        ) : (
                          <div className="flex items-start gap-2">
                            <span>{entry.customerAddress || "-"}</span>
                            {entry.customerAddress && (!entry.lat || !entry.lon) && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                title="Location data unavailable"
                              >
                                ⚠️ No location
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                      <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(entry.processedAt || entry.createdAt)}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-right">
                      {editingId === entry._id ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSave(entry._id)}
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
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => startEditing(entry)}
                            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry._id)}
                            disabled={deletingId === entry._id}
                            className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingId === entry._id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Layout>
  );
}

