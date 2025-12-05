"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import Modal from "./ui/Modal";
import { format } from "date-fns";
import MetadataViewer from "./MetadataViewer";
import SearchAddressModal from "./SearchAddressModal";

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
  userLatitude?: number | null;
  userLongitude?: number | null;
  userAltitude?: number | null;
  userAddress?: string | null;
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
  const [notes, setNotes] = useState("");
  const [existingNotes, setExistingNotes] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [streetViewUrl, setStreetViewUrl] = useState<string | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [pendingPlaceData, setPendingPlaceData] = useState<{ placeId?: string; lat?: number; lon?: number } | null>(null);

  useEffect(() => {
    if (isOpen && address) {
      fetchCustomerDetails();
      fetchNotes();
    } else {
      setData(null);
      setError(null);
      setEditingId(null);
      setNotes("");
      setExistingNotes(null);
      setIsEditingNotes(false);
      setStreetViewUrl(null);
    }
  }, [isOpen, address, userId]);

  // Fetch Street View URL when data is available
  useEffect(() => {
    if (data?.address) {
      const params = new URLSearchParams({
        address: data.address,
        width: "600",
        height: "300",
      });
      
      fetch(`/api/streetview?${params.toString()}`)
        .then((res) => res.json())
        .then((result) => {
          if (result.url) {
            setStreetViewUrl(result.url);
          } else {
            setStreetViewUrl(null);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch Street View URL:", err);
          setStreetViewUrl(null);
        });
    } else {
      setStreetViewUrl(null);
    }
  }, [data?.address]);

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
    setPendingPlaceData(null); // Reset place data when starting to edit
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormValues({
      appName: "",
      customerName: "",
      customerAddress: "",
    });
    setPendingPlaceData(null);
  };

  const handleSave = async (id: string) => {
    try {
      setSaving(true);
      const updateData: any = {
        id,
        ...formValues,
      };
      
      // Include place data if available
      if (pendingPlaceData) {
        if (pendingPlaceData.placeId !== undefined) {
          updateData.placeId = pendingPlaceData.placeId;
        }
        if (pendingPlaceData.lat !== undefined) {
          updateData.lat = pendingPlaceData.lat;
        }
        if (pendingPlaceData.lon !== undefined) {
          updateData.lon = pendingPlaceData.lon;
        }
      }
      
      const response = await fetch("/api/ocr-exports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
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

  const fetchNotes = async () => {
    if (!address) return;
    
    try {
      setLoadingNotes(true);
      const response = await fetch(
        `/api/ocr-exports/notes?address=${encodeURIComponent(address)}`
      );
      if (response.ok) {
        const data = await response.json();
        setExistingNotes(data.notes);
        setNotes(data.notes || "");
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!address) return;
    
    try {
      setSavingNotes(true);
      const response = await fetch("/api/ocr-exports/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address,
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save notes");
      }

      setExistingNotes(notes.trim() || null);
      setIsEditingNotes(false);
    } catch (error) {
      console.error("Error saving notes:", error);
      alert("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch {
      return dateString;
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Address: ${address || ""}`}>
      {loading && !data && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Street View Image */}
          {streetViewUrl && (
            <div className="mb-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Street View</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
              >
                <img
                  src={streetViewUrl}
                  alt={`Street view of ${data.address}`}
                  className="w-full h-[300px] object-cover"
                  onError={(e) => {
                    // Hide image if it fails to load (e.g., no Street View available or API key missing)
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </a>
            </div>
          )}

          {/* Notes Section */}
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes
            </div>
            {loadingNotes ? (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                Loading notes...
              </div>
            ) : isEditingNotes || !existingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for this address..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={4}
                />
                <div className="flex justify-end gap-2">
                  {existingNotes && (
                    <button
                      onClick={() => {
                        setNotes(existingNotes);
                        setIsEditingNotes(false);
                      }}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[40px] transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[40px] transition-colors"
                  >
                    {savingNotes ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">
                      Notes:
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {existingNotes}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setNotes(existingNotes || "");
                      setIsEditingNotes(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 min-h-[32px] transition-colors flex-shrink-0"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              ENTRIES ({data.visitCount})
            </h3>
            {data.visits.map((visit) => (
              <div
                key={visit._id}
                className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                {editingId === visit._id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Address
                      </label>
                      <div className="flex gap-2">
                        <textarea
                          value={formValues.customerAddress}
                          onChange={(e) =>
                            setFormValues((prev) => ({
                              ...prev,
                              customerAddress: e.target.value,
                            }))
                          }
                          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows={2}
                        />
                        <button
                          onClick={() => setShowSearchModal(true)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center self-start"
                          title="Search Address"
                        >
                          <Search className="w-5 h-5" />
                        </button>
                        {formValues.customerAddress && (
                          <button
                            onClick={async () => {
                              if (navigator.share) {
                                try {
                                  await navigator.share({
                                    text: formValues.customerAddress,
                                  });
                                } catch (err) {
                                  console.log("Share cancelled or failed:", err);
                                }
                              } else {
                                try {
                                  await navigator.clipboard.writeText(formValues.customerAddress);
                                  alert("Address copied to clipboard");
                                } catch (err) {
                                  console.error("Failed to copy address:", err);
                                }
                              }
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center self-start"
                            title="Share Address"
                          >
                            📤
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={cancelEditing}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[40px] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(visit._id)}
                        disabled={saving}
                        className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[40px] transition-colors"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Customer Name at top - left aligned */}
                    <div className="font-bold text-base text-gray-900 dark:text-white mb-2 text-left">
                      {visit.customerName}
                    </div>
                    
                    {/* Date below customer name - left aligned */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 text-left">
                      {formatDate(visit.processedAt || visit.createdAt)}
                    </div>
                    
                    {/* Address below date - left aligned */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 text-left">
                      {visit.customerAddress}
                    </div>
                    
                    {/* App name badge - left aligned */}
                    {visit.appName && (() => {
                      const appColor = getAppTagColor(visit.appName);
                      return (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3 text-left">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${appColor.bg} ${appColor.text}`}>
                            {visit.appName}
                          </span>
                        </div>
                      );
                    })()}
                    
                    {visit.screenshot && typeof visit.screenshot === 'string' && visit.screenshot.trim().length > 0 && (
                      <div className="mt-3 mb-3">
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
                    <MetadataViewer 
                      metadata={visit.metadata} 
                      title="Extracted Metadata"
                      userLatitude={visit.userLatitude}
                      userLongitude={visit.userLongitude}
                      userAltitude={visit.userAltitude}
                      userAddress={visit.userAddress}
                    />
                    {/* Action buttons right-aligned */}
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        onClick={() => startEditing(visit)}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[40px] transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(visit._id)}
                        disabled={deletingId === visit._id}
                        className="px-6 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 min-h-[40px] transition-colors"
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

      {/* Search Address Modal */}
      {data && (
        <SearchAddressModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          title="Search Customer Address"
          initialQuery={formValues.customerAddress || data.address}
          userLatitude={data.visits[0]?.userLatitude || undefined}
          userLongitude={data.visits[0]?.userLongitude || undefined}
          userAddress={data.visits[0]?.userAddress || undefined}
          onAddressSelected={(address, placeId, lat, lon) => {
            setFormValues((prev) => ({
              ...prev,
              customerAddress: address,
            }));
            // Store place_id, lat, lon for saving
            setPendingPlaceData({
              placeId,
              lat,
              lon,
            });
          }}
        />
      )}
    </Modal>
  );
}

