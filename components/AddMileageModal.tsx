"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import { useMileageEntry, useCreateMileageEntry, useUpdateMileageEntry } from "@/hooks/useQueries";

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
  const { data: entryData } = useMileageEntry(entryId);
  const createMileageEntry = useCreateMileageEntry();
  const updateMileageEntry = useUpdateMileageEntry();
  
  const [formData, setFormData] = useState({
    odometer: "",
    date: formatLocalDate(new Date()),
    notes: "",
    classification: "work" as "work" | "personal",
  });
  const [error, setError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const odometerInputRef = useRef<HTMLInputElement | null>(null);

  // Update form data when entry is loaded
  useEffect(() => {
    if (entryId && entryData) {
      setFormData({
        odometer: formatOdometerInput(entryData.odometer.toString()),
        date: formatLocalDate(entryData.date),
        notes: entryData.notes || "",
        classification: entryData.classification === "personal" ? "personal" : "work",
      });
      setDataLoaded(true);
    } else if (!entryId) {
      const now = new Date();
      setFormData({
        odometer: "",
        date: formatLocalDate(now),
        notes: "",
        classification: "work",
      });
      setDataLoaded(true);
    }
  }, [entryId, entryData]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      const now = new Date();
      setFormData({
        odometer: "",
        date: formatLocalDate(now),
        notes: "",
        classification: "work",
      });
      setError("");
      setDataLoaded(false);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !dataLoaded) return;
    // Use setTimeout to ensure the modal is fully rendered and input is visible
    const timeoutId = setTimeout(() => {
      odometerInputRef.current?.focus();
      odometerInputRef.current?.select();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [isOpen, dataLoaded]);

  const handleOdometerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const formatted = formatOdometerInput(inputValue);
    setFormData({ ...formData, odometer: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const odometerValue = parseOdometerInput(formData.odometer);
    if (isNaN(odometerValue) || odometerValue < 0) {
      setError("Please enter a valid odometer reading");
      return;
    }

    // Ensure classification is always set (should be "work" or "personal")
    const classificationValue = formData.classification === "personal" ? "personal" : "work";
    
    const requestBody = {
      odometer: odometerValue,
      date: formData.date,
      notes: formData.notes.trim() || undefined,
      classification: classificationValue,
    };

    if (entryId) {
      updateMileageEntry.mutate(
        { id: entryId, ...requestBody },
        {
          onSuccess: () => {
            onSuccess();
            onClose();
          },
          onError: (error: Error) => {
            setError(error.message || "Error saving mileage entry");
          },
        }
      );
    } else {
      createMileageEntry.mutate(requestBody, {
        onSuccess: () => {
          onSuccess();
          onClose();
        },
        onError: (error: Error) => {
          setError(error.message || "Error saving mileage entry");
        },
      });
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
          <Button 
            type="submit" 
            variant="primary" 
            className="flex-1" 
            disabled={createMileageEntry.isPending || updateMileageEntry.isPending}
          >
            {(createMileageEntry.isPending || updateMileageEntry.isPending) ? "Saving..." : entryId ? "Update" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

