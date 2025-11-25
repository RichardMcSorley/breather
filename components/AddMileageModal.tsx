"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import { addToSyncQueue } from "@/lib/offline";

interface AddMileageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entryId?: string;
}

const formatLocalDate = (value: Date | string) => {
  if (typeof value === "string") {
    const [datePart] = value.split("T");
    return datePart || value;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatOdometerInput = (value: string): string => {
  // Remove all non-digit characters (including commas, we'll add them back)
  const digitsOnly = value.replace(/\D/g, "");
  
  if (digitsOnly === "") return "";
  
  // Format with commas every 3 digits from right to left
  const formatted = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  return formatted;
};

const parseOdometerInput = (value: string): number => {
  // Remove all commas and parse
  const cleaned = value.replace(/,/g, "");
  return parseFloat(cleaned) || 0;
};

export default function AddMileageModal({
  isOpen,
  onClose,
  onSuccess,
  entryId,
}: AddMileageModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    odometer: "",
    date: formatLocalDate(new Date()),
    notes: "",
    classification: "work" as "work" | "personal",
  });
  const [error, setError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const odometerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      resetForm();
      setDataLoaded(false);
      return;
    }

    if (entryId) {
      setDataLoaded(false);
      // Clear form data before fetching to avoid stale data
      setFormData({
        odometer: "",
        date: formatLocalDate(new Date()),
        notes: "",
        classification: "work",
      });
      fetchEntry();
    } else {
      resetForm();
      setDataLoaded(true);
    }
  }, [entryId, isOpen]);

  useEffect(() => {
    if (!isOpen || !dataLoaded) return;
    // Use setTimeout to ensure the modal is fully rendered and input is visible
    const timeoutId = setTimeout(() => {
      odometerInputRef.current?.focus();
      odometerInputRef.current?.select();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [isOpen, dataLoaded]);

  const fetchEntry = async () => {
    if (!entryId) return;
    
    try {
      const res = await fetch(`/api/mileage/${entryId}`);
      if (res.ok) {
        const data = await res.json();
        // Debug logging (can be removed later)
        console.log("Fetched mileage entry classification:", data.classification);
        // Ensure we're setting the classification from the API response
        setFormData({
          odometer: formatOdometerInput(data.odometer.toString()),
          date: formatLocalDate(data.date),
          notes: data.notes || "",
          classification: data.classification === "personal" ? "personal" : "work",
        });
        setDataLoaded(true);
      } else {
        console.error("Error fetching mileage entry:", res.statusText);
        setDataLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching mileage entry:", error);
      setDataLoaded(true);
    }
  };

  const resetForm = () => {
    const now = new Date();
    setFormData({
      odometer: "",
      date: formatLocalDate(now),
      notes: "",
      classification: "work",
    });
    setError("");
  };

  const handleOdometerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const formatted = formatOdometerInput(inputValue);
    setFormData({ ...formData, odometer: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const odometerValue = parseOdometerInput(formData.odometer);
      if (isNaN(odometerValue) || odometerValue < 0) {
        setError("Please enter a valid odometer reading");
        setLoading(false);
        return;
      }

      const url = entryId ? `/api/mileage/${entryId}` : "/api/mileage";
      const method = entryId ? "PUT" : "POST";

      // Ensure classification is always set (should be "work" or "personal")
      const classificationValue = formData.classification === "personal" ? "personal" : "work";
      
      const requestBody = {
        odometer: odometerValue,
        date: formData.date,
        notes: formData.notes.trim() || undefined,
        classification: classificationValue,
      };
      
      // Debug logging (can be removed later)
      console.log("Saving mileage entry with classification:", classificationValue, "formData.classification:", formData.classification);

      // If offline, add to sync queue
      if (!navigator.onLine) {
        await addToSyncQueue({
          type: method === "PUT" ? "update" : "create",
          endpoint: url,
          method,
          data: {
            ...requestBody,
            classification: classificationValue,
          },
        });
        onSuccess();
        resetForm();
        return;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        onSuccess();
        resetForm();
      } else {
        const errorData = await res.json();
        setError(errorData.error || "Error saving mileage entry");
      }
    } catch (error) {
      // If offline, queue the operation
      if (!navigator.onLine) {
        const odometerValue = parseOdometerInput(formData.odometer);
        const url = entryId ? `/api/mileage/${entryId}` : "/api/mileage";
        const method = entryId ? "PUT" : "POST";
        const classificationValue = formData.classification === "personal" ? "personal" : "work";
        await addToSyncQueue({
          type: method === "PUT" ? "update" : "create",
          endpoint: url,
          method,
          data: {
            odometer: odometerValue,
            date: formData.date,
            notes: formData.notes.trim() || undefined,
            classification: classificationValue,
          },
        });
        onSuccess();
        resetForm();
      } else {
        console.error("Error saving mileage entry:", error);
        setError("Error saving mileage entry. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={entryId ? "Edit Mileage Entry" : "Add Mileage Entry"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Odometer Reading"
          type="text"
          inputMode="numeric"
          required
          ref={odometerInputRef}
          value={formData.odometer}
          onChange={handleOdometerChange}
          placeholder="Enter odometer reading"
          error={error}
        />

        <Input
          label="Date"
          type="date"
          required
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Classification
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, classification: "work" }))}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                formData.classification === "work"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Work
            </button>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, classification: "personal" }))}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                formData.classification === "personal"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Personal
            </button>
          </div>
        </div>

        <Input
          label="Notes (optional)"
          type="text"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Add any notes..."
        />

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
            {loading ? "Saving..." : entryId ? "Update" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

