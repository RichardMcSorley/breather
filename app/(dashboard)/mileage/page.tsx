"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AddMileageModal from "@/components/AddMileageModal";
import { useMileageEntries, useMileageEntriesForCalculation, useSettings, useDeleteMileageEntry, useTeslaConnection, useSyncTesla } from "@/hooks/useQueries";

interface MileageEntry {
  _id: string;
  odometer: number;
  date: string;
  classification?: "work" | "personal";
  carId?: string;
  notes?: string;
  createdAt: string;
}

export default function MileagePage() {
  const { data: session } = useSession();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;
  
  // Use paginated query for display
  const { data: mileageData, isLoading: loading } = useMileageEntries(page, limit);
  // Use separate query for year calculation (needs all entries)
  const { data: allMileageData } = useMileageEntriesForCalculation();
  const { data: settingsData } = useSettings();
  const deleteMileageEntry = useDeleteMileageEntry();
  const { data: teslaConnection, isLoading: teslaLoading } = useTeslaConnection();
  const syncTesla = useSyncTesla();
  
  const irsMileageDeduction = settingsData?.irsMileageDeduction || 0.67;
  
  const pagination = mileageData?.pagination;

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

  // Use paginated entries for display
  const entries = mileageData ? sortEntriesByDate(mileageData.entries || []) : [];
  
  // Use all entries for year calculation
  const allEntries = allMileageData ? sortEntriesByDate(allMileageData.entries || []) : [];

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

  const formatOdometer = (value: number) => {
    return value.toLocaleString("en-US");
  };


  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this mileage entry?")) {
      return;
    }
    deleteMileageEntry.mutate(id);
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

  // Get latest entry from all entries (for display purposes)
  const latestEntry = allEntries[0];
  const previousEntry = allEntries[1];
  const milesDriven = latestEntry && previousEntry 
    ? latestEntry.odometer - previousEntry.odometer 
    : null;

  // Calculate current year's work mileage for tax deductions using ALL entries
  const currentYear = new Date().getFullYear();
  let currentYearMiles = 0;
  
  // Helper function to parse date string as UTC and get year
  const getYearFromDateString = (dateString: string): number => {
    if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year] = dateString.split('-').map(Number);
      return year;
    }
    // Fallback to Date parsing
    const date = new Date(dateString);
    return date.getUTCFullYear();
  };
  
  // Find work entries from current year using all entries
  const currentYearWorkEntries = allEntries.filter(entry => {
    const entryYear = getYearFromDateString(entry.date);
    return entryYear === currentYear && entry.classification === "work";
  });
  
  if (currentYearWorkEntries.length > 0) {
    // Sum up miles between consecutive work entries in current year
    // Entries are sorted descending (newest first)
    for (let i = 0; i < currentYearWorkEntries.length; i++) {
      const entry = currentYearWorkEntries[i];
      
      // Find the previous work entry
      let previousWorkEntry: MileageEntry | undefined;
      
      if (i < currentYearWorkEntries.length - 1) {
        // There's a next entry in the current year, use that
        previousWorkEntry = currentYearWorkEntries[i + 1];
      } else {
        // This is the oldest entry in current year, find the most recent work entry from before current year
        // Since entries are sorted descending, find the first one with year < currentYear
        previousWorkEntry = allEntries.find(e => {
          const eYear = getYearFromDateString(e.date);
          return eYear < currentYear && e.classification === "work";
        });
      }
      
      if (previousWorkEntry) {
        const miles = entry.odometer - previousWorkEntry.odometer;
        if (miles > 0) {
          currentYearMiles += miles;
        }
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
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mileage Tracking</h2>
          <div className="flex gap-2 items-center">
            {!teslaLoading && teslaConnection?.connected ? (
              <Button
                variant="outline"
                onClick={() => syncTesla.mutate()}
                disabled={syncTesla.isPending}
                className="flex items-center gap-2"
              >
                {syncTesla.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 dark:border-white"></div>
                    Syncing...
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    Sync Tesla
                  </>
                )}
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => setShowAddModal(true)}
            >
              Add Entry
            </Button>
          </div>
        </div>
      </div>

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
                        {entry.carId && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            🚗 {entry.carId}
                          </span>
                        )}
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
                        disabled={deleteMileageEntry.isPending}
                        className="p-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Delete entry"
                      >
                        {deleteMileageEntry.isPending ? (
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

      {entries.length === 0 && !loading && (
        <Card className="p-6">
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            No mileage entries yet. Add your first odometer reading above.
          </div>
        </Card>
      )}

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
            <span className="hidden sm:inline">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of {pagination.total} entries
            </span>
            <span className="sm:hidden">
              Page {page} of {pagination.totalPages}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                page === 1
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium ${
                      page === pageNum
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === pagination.totalPages}
              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                page === pagination.totalPages
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {(showAddModal || editingEntryId) && (
        <AddMileageModal
          isOpen={showAddModal || !!editingEntryId}
          onClose={() => {
            setShowAddModal(false);
            setEditingEntryId(null);
          }}
          onSuccess={() => {
            setShowAddModal(false);
            setEditingEntryId(null);
          }}
          entryId={editingEntryId || undefined}
        />
      )}
    </Layout>
  );
}

