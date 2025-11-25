"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import AddMileageModal from "@/components/AddMileageModal";

interface MileageEntry {
  _id: string;
  odometer: number;
  date: string;
  classification?: "work" | "personal";
  notes?: string;
  createdAt: string;
}

export default function MileagePage() {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [odometer, setOdometer] = useState("");
  // Use local date components (not UTC) to match dashboard behavior
  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const [date, setDate] = useState(getLocalDateString());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [irsMileageDeduction, setIrsMileageDeduction] = useState<number>(0.67);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/mileage");
      if (res.ok) {
        const data = await res.json();
        setEntries(sortEntriesByDate(data.entries || []));
      } else {
        const errorData = await res.json();
        console.error("Error fetching mileage entries:", errorData.error);
      }
    } catch (error) {
      console.error("Error fetching mileage entries:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      fetchEntries();
      fetchSettings();
    }
  }, [session, fetchEntries]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setIrsMileageDeduction(data.irsMileageDeduction || 0.67);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const odometerValue = parseOdometerInput(odometer);
      if (isNaN(odometerValue) || odometerValue < 0) {
        setError("Please enter a valid odometer reading");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/mileage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          odometer: odometerValue,
          date,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.ok) {
        const newEntry = await res.json();
        setEntries((prev) => sortEntriesByDate([newEntry, ...prev]));
        setOdometer("");
        setNotes("");
        setDate(getLocalDateString());
        fetchSettings(); // Refresh settings in case IRS rate changed
      } else {
        const errorData = await res.json();
        setError(errorData.error || "Failed to save mileage entry");
      }
    } catch (error) {
      console.error("Error saving mileage entry:", error);
      setError("Failed to save mileage entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string | Date) => {
    // Handle both Date objects and ISO strings
    let year: number, month: number, day: number;
    
    if (dateString instanceof Date) {
      // If it's a Date object, use UTC components to avoid timezone issues
      year = dateString.getUTCFullYear();
      month = dateString.getUTCMonth();
      day = dateString.getUTCDate();
    } else if (typeof dateString === 'string') {
      // If it's already in YYYY-MM-DD format, parse directly without timezone conversion
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        [year, month, day] = dateString.split('-').map(Number);
        month = month - 1; // JavaScript months are 0-indexed
      } else {
        // Otherwise parse as ISO string and use UTC components
        const date = new Date(dateString);
        year = date.getUTCFullYear();
        month = date.getUTCMonth();
        day = date.getUTCDate();
      }
    } else {
      const date = new Date(dateString);
      year = date.getUTCFullYear();
      month = date.getUTCMonth();
      day = date.getUTCDate();
    }
    
    // Format directly using the date components to avoid timezone conversion
    const dateObj = new Date(year, month, day);
    return dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const sortEntriesByDate = (entriesToSort: MileageEntry[]) => {
    return entriesToSort
      .slice()
      .sort((a, b) => {
        // Parse dates as UTC for consistent sorting
        let dateA: Date;
        let dateB: Date;
        
        if (typeof a.date === 'string' && a.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = a.date.split('-').map(Number);
          dateA = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } else {
          dateA = new Date(a.date);
        }
        
        if (typeof b.date === 'string' && b.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = b.date.split('-').map(Number);
          dateB = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } else {
          dateB = new Date(b.date);
        }
        
        return dateB.getTime() - dateA.getTime();
      });
  };

  const formatOdometer = (value: number) => {
    return value.toLocaleString("en-US");
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

  const handleOdometerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const formatted = formatOdometerInput(inputValue);
    setOdometer(formatted);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this mileage entry?")) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/mileage/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setEntries(entries.filter((entry) => entry._id !== id));
      } else {
        const errorData = await res.json();
        alert(errorData.error || "Failed to delete entry");
      }
    } catch (error) {
      console.error("Error deleting mileage entry:", error);
      alert("Failed to delete entry. Please try again.");
    } finally {
      setDeletingId(null);
    }
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

  const latestEntry = entries[0];
  const previousEntry = entries[1];
  const milesDriven = latestEntry && previousEntry 
    ? latestEntry.odometer - previousEntry.odometer 
    : null;

  // Calculate current year's work mileage for tax deductions
  const currentYear = new Date().getFullYear();
  let currentYearMiles = 0;
  
  // Find work entries from current year
  const currentYearWorkEntries = entries.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate.getFullYear() === currentYear && entry.classification === "work";
  });
  
  if (currentYearWorkEntries.length > 0) {
    // Sum up miles between consecutive work entries in current year
    for (let i = 0; i < currentYearWorkEntries.length; i++) {
      const entry = currentYearWorkEntries[i];
      const previousWorkEntry = i < currentYearWorkEntries.length - 1 
        ? currentYearWorkEntries[i + 1] 
        : entries.find(e => {
            const eDate = new Date(e.date);
            return eDate.getFullYear() < currentYear && e.classification === "work";
          });
      
      if (previousWorkEntry) {
        currentYearMiles += entry.odometer - previousWorkEntry.odometer;
      }
    }
  }

  // Calculate tax deduction (work miles only)
  const taxDeduction = currentYearMiles * irsMileageDeduction;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Layout>
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Mileage Tracking</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Current Odometer"
            type="text"
            value={odometer}
            onChange={handleOdometerChange}
            placeholder="Enter odometer reading"
            inputMode="numeric"
            required
            error={error}
          />

          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <Input
            label="Notes (optional)"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes..."
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Save Entry"}
          </Button>
        </form>
      </Card>

      {latestEntry && (
        <Card className="p-6 mb-6">
          <div className="space-y-6">
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                {formatOdometer(currentYearMiles)}
              </div>
              <div className="text-gray-600 dark:text-gray-400 text-sm">{currentYear} mileage</div>
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">
                  {formatCurrency(taxDeduction)}
                </div>
                <div className="text-gray-600 dark:text-gray-400 text-sm">Tax deduction ({irsMileageDeduction}/mile)</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {entries.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">History</h3>
          <div className="space-y-0">
            {entries.map((entry, index) => {
              const previousEntry = entries[index + 1];
              const milesDifference = previousEntry 
                ? entry.odometer - previousEntry.odometer 
                : null;
              
              return (
                <div key={entry._id}>
                  <div className="flex justify-between items-center py-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {formatOdometer(entry.odometer)} miles
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(entry.date)}
                        {entry.classification && (
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            entry.classification === "work"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                          }`}>
                            {entry.classification === "work" ? "Work" : "Personal"}
                          </span>
                        )}
                      </div>
                      {entry.notes && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {entry.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => setEditingEntryId(entry._id)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Edit entry"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(entry._id)}
                        disabled={deletingId === entry._id}
                        className="p-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Delete entry"
                      >
                        {deletingId === entry._id ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 dark:border-red-400"></div>
                        ) : (
                          <span className="text-xl">🗑️</span>
                        )}
                      </button>
                    </div>
                  </div>
                  {milesDifference !== null && index < entries.length - 1 && (
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white dark:bg-gray-800 px-2 text-sm text-gray-500 dark:text-gray-400">
                          {formatOdometer(milesDifference)} miles
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {entries.length === 0 && (
        <Card className="p-6">
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            No mileage entries yet. Add your first odometer reading above.
          </div>
        </Card>
      )}

      {editingEntryId && (
        <AddMileageModal
          isOpen={!!editingEntryId}
          onClose={() => {
            setEditingEntryId(null);
          }}
          onSuccess={() => {
            setEditingEntryId(null);
            fetchEntries();
            fetchSettings(); // Refresh settings in case IRS rate changed
          }}
          entryId={editingEntryId}
        />
      )}
    </Layout>
  );
}

