"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";

interface DeliveryConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerAddress: string;
  customerName?: string;
  onMarkDelivered: (notes?: string) => void;
  isMarking?: boolean;
}

export default function DeliveryConfirmationModal({
  isOpen,
  onClose,
  customerAddress,
  customerName,
  onMarkDelivered,
  isMarking = false,
}: DeliveryConfirmationModalProps) {
  const [notes, setNotes] = useState("");
  const [existingNotes, setExistingNotes] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [streetViewImageUrl, setStreetViewImageUrl] = useState<string | null>(null);

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}`;

  // Fetch existing notes and Street View URL when modal opens
  useEffect(() => {
    if (isOpen && customerAddress) {
      fetchNotes();
      fetchStreetViewUrl();
      setIsEditingNotes(false);
    } else {
      setNotes("");
      setExistingNotes(null);
      setIsEditingNotes(false);
      setStreetViewImageUrl(null);
    }
  }, [isOpen, customerAddress]);

  const fetchStreetViewUrl = async () => {
    try {
      const params = new URLSearchParams({
        address: customerAddress,
        width: "600",
        height: "300",
      });
      
      const response = await fetch(`/api/streetview?${params.toString()}`);
      if (response.ok) {
        const result = await response.json();
        if (result.url) {
          setStreetViewImageUrl(result.url);
        } else {
          setStreetViewImageUrl(null);
        }
      } else {
        setStreetViewImageUrl(null);
      }
    } catch (error) {
      console.error("Failed to fetch Street View URL:", error);
      setStreetViewImageUrl(null);
    }
  };

  const fetchNotes = async () => {
    try {
      setLoadingNotes(true);
      const response = await fetch(
        `/api/ocr-exports/notes?address=${encodeURIComponent(customerAddress)}`
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

  const handleNavigate = async () => {
    try {
      // Use Web Share API if available (mobile devices)
      if (navigator.share) {
        await navigator.share({
          title: customerName ? `Navigate to ${customerName}` : "Navigate to Customer",
          text: customerAddress,
        });
      } else {
        // Fallback: open Google Maps in new tab
        window.open(googleMapsUrl, "_blank");
      }
    } catch (error) {
      // User cancelled share or error occurred
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error sharing address:", error);
        // Fallback to opening Google Maps if share fails
        window.open(googleMapsUrl, "_blank");
      }
    }
  };

  const handleMarkDelivered = async () => {
    // Save notes before marking as delivered if they've changed or if we're in edit mode
    const notesToSave = isEditingNotes ? notes.trim() : (existingNotes || "");
    if (notesToSave !== (existingNotes || "")) {
      try {
        setSavingNotes(true);
        const response = await fetch("/api/ocr-exports/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: customerAddress,
            notes: notesToSave || null,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save notes");
        }

        setExistingNotes(notesToSave || null);
        setIsEditingNotes(false);
      } catch (error) {
        console.error("Error saving notes:", error);
        alert("Failed to save notes");
        return; // Don't proceed with marking as delivered if notes save failed
      } finally {
        setSavingNotes(false);
      }
    }
    onMarkDelivered(notesToSave || undefined);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customerName ? `Deliver to ${customerName}` : "Navigate to Customer"}
    >
      <div className="space-y-4">
        {/* Address */}
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Address
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-700 dark:text-gray-300">
            {customerAddress}
          </div>
        </div>

        {/* Street View Image */}
        {streetViewImageUrl && (
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Street View
            </div>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
            >
              <img
                src={streetViewImageUrl}
                alt={`Street view of ${customerAddress}`}
                className="w-full h-[300px] object-cover"
                onError={(e) => {
                  // Hide image if it fails to load
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for this address..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
            />
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

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleNavigate}
            className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[44px] transition-colors"
          >
            Navigate
          </button>
          <button
            onClick={handleMarkDelivered}
            disabled={isMarking || savingNotes}
            className="px-6 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 min-h-[44px] transition-colors"
          >
            {isMarking || savingNotes ? "Saving..." : "Mark Delivered"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

