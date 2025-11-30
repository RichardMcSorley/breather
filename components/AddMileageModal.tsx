"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import { useMileageEntry, useCreateMileageEntry, useUpdateMileageEntry, useSettings, useUpdateSettings } from "@/hooks/useQueries";

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
  const { data: settingsData } = useSettings();
  const createMileageEntry = useCreateMileageEntry();
  const updateMileageEntry = useUpdateMileageEntry();
  const updateSettings = useUpdateSettings();
  
  const [formData, setFormData] = useState({
    odometer: "",
    date: formatLocalDate(new Date()),
    notes: "",
    classification: "work" as "work" | "personal",
    carId: "",
  });
  const [newCarName, setNewCarName] = useState("");
  const [showNewCarInput, setShowNewCarInput] = useState(false);
  const [error, setError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const odometerInputRef = useRef<HTMLInputElement | null>(null);

  const cars = settingsData?.cars || [];

  // Update form data when entry is loaded
  useEffect(() => {
    if (entryId && entryData) {
      setFormData({
        odometer: formatOdometerInput(entryData.odometer.toString()),
        date: formatLocalDate(entryData.date),
        notes: entryData.notes || "",
        classification: entryData.classification === "personal" ? "personal" : "work",
        carId: entryData.carId || "",
      });
      setDataLoaded(true);
    } else if (!entryId) {
      const now = new Date();
      // Default to first car if available
      const defaultCarId = cars.length > 0 ? cars[0] : "";
      setFormData({
        odometer: "",
        date: formatLocalDate(now),
        notes: "",
        classification: "work",
        carId: defaultCarId,
      });
      setDataLoaded(true);
    }
  }, [entryId, entryData, cars]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      const now = new Date();
      const defaultCarId = cars.length > 0 ? cars[0] : "";
      setFormData({
        odometer: "",
        date: formatLocalDate(now),
        notes: "",
        classification: "work",
        carId: defaultCarId,
      });
      setNewCarName("");
      setShowNewCarInput(false);
      setError("");
      setDataLoaded(false);
      return;
    }
  }, [isOpen, cars]);

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

  const handleAddNewCar = async () => {
    if (!newCarName.trim()) {
      setError("Please enter a car name");
      return;
    }

    if (cars.includes(newCarName.trim())) {
      setError("This car already exists");
      return;
    }

    // Add new car to settings
    const updatedCars = [...cars, newCarName.trim()];
    updateSettings.mutate(
      {
        irsMileageDeduction: settingsData?.irsMileageDeduction || 0.70,
        incomeSourceTags: settingsData?.incomeSourceTags || [],
        expenseSourceTags: settingsData?.expenseSourceTags || [],
        cars: updatedCars,
      },
      {
        onSuccess: () => {
          setFormData({ ...formData, carId: newCarName.trim() });
          setNewCarName("");
          setShowNewCarInput(false);
          setError("");
        },
        onError: (error: Error) => {
          setError(error.message || "Failed to add car");
        },
      }
    );
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
      carId: formData.carId || undefined,
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
            Car
          </label>
          {!showNewCarInput ? (
            <div className="space-y-2">
              {cars.length > 0 ? (
                <select
                  value={formData.carId}
                  onChange={(e) => setFormData({ ...formData, carId: e.target.value })}
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent min-h-[44px] text-gray-900 dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                >
                  {cars.map((car: string) => (
                    <option key={car} value={car}>
                      {car}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  No cars added yet. Create your first car below.
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowNewCarInput(true)}
                className="w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 border border-blue-300 dark:border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                + Add New Car
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter car name"
                  value={newCarName}
                  onChange={(e) => setNewCarName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNewCar();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleAddNewCar}
                  disabled={updateSettings.isPending}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowNewCarInput(false);
                    setNewCarName("");
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

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

