"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { format, isToday, isYesterday } from "date-fns";
import Layout from "@/components/Layout";
import AddTransactionModal from "@/components/AddTransactionModal";

interface Transaction {
  _id: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  time: string;
  notes?: string;
  tag?: string;
  isBill: boolean;
  isBalanceAdjustment?: boolean; // Kept for filtering out existing balance adjustments
  dueDate?: string;
}

/**
 * Parses a date string (YYYY-MM-DD) and time string (HH:MM) as LOCAL time.
 * The time string represents the user's local time, not UTC.
 */
const buildLocalDateFromParts = (dateString: string, timeString?: string) => {
  if (!dateString) return new Date();
  const baseDate = dateString.split("T")[0] || dateString;
  const [year, month, day] = baseDate.split("-").map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    const fallback = new Date(dateString);
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  }
  const [hour, minute] = (timeString?.split(":").map(Number) ?? [0, 0]).map((value) =>
    Number.isNaN(value) ? 0 : value
  );
  
  // Parse as LOCAL date/time - the time string is already in the user's local timezone
  // Create a local Date object directly without UTC conversion
  return new Date(year, month - 1, day, hour, minute);
};

export default function HistoryPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  const fetchTransactions = useCallback(async () => {
    try {
      let url = "/api/transactions?limit=100";
      if (filterType !== "all") {
        url += `&type=${filterType}`;
      }
      if (filterTag !== "all") {
        url += `&tag=${filterTag}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Filter out bills and balance adjustments from the transaction list
        setTransactions(data.transactions.filter((t: Transaction) => !t.isBill && !t.isBalanceAdjustment));
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterTag]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchTransactions();
    }
  }, [session, filterType, filterTag, fetchTransactions]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) {
      return;
    }

    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchTransactions();
      } else {
        alert("Error deleting transaction");
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("Error deleting transaction");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string, timeString?: string) => {
    const date = buildLocalDateFromParts(dateString, timeString);
    if (isToday(date)) {
      return "Today";
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "MMM d, yyyy");
    }
  };

  const formatTime = (dateString: string, timeString: string) => {
    const date = buildLocalDateFromParts(dateString, timeString);
    return format(date, "h:mm a");
  };

  const groupedTransactions = transactions.reduce((acc, transaction) => {
    const dateKey = formatDate(transaction.date, transaction.time);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const allTags = Array.from(
    new Set(transactions.filter((t) => t.tag).map((t) => t.tag))
  ) as string[];

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Logs</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditingTransaction(null);
                setShowAddModal(true);
                setTransactionType("income");
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 min-h-[44px]"
            >
              + Income
            </button>
            <button
              onClick={() => {
                setEditingTransaction(null);
                setShowAddModal(true);
                setTransactionType("expense");
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 min-h-[44px]"
            >
              + Expense
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "all"
                ? "bg-green-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType("income")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "income"
                ? "bg-green-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Income
          </button>
          <button
            onClick={() => setFilterType("expense")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "expense"
                ? "bg-red-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Expense
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              onClick={() => setFilterTag("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
                filterTag === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              All Sources
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
                  filterTag === tag
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No transactions found. Add your first transaction!
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([dateKey, dateTransactions]) => (
            <div key={dateKey}>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{dateKey}</h3>
              <div className="space-y-2">
                {dateTransactions.map((transaction) => {
                  const isIncome = transaction.type === "income";
                  return (
                    <div
                      key={transaction._id}
                      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            isIncome 
                              ? "bg-green-100 dark:bg-green-900/30" 
                              : "bg-red-100 dark:bg-red-900/30"
                          }`}
                        >
                          <span className="text-xl">📊</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {transaction.tag && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {transaction.tag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(transaction.date, transaction.time)}
                          </div>
                          {transaction.notes ? (
                            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1 truncate">
                              {transaction.notes}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={`text-lg font-bold ${
                            isIncome 
                              ? "text-green-600 dark:text-green-400" 
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setEditingTransaction(transaction._id)}
                          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(transaction._id)}
                          className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {(showAddModal || editingTransaction) && (
        <AddTransactionModal
          isOpen={showAddModal || !!editingTransaction}
          onClose={() => {
            setShowAddModal(false);
            setEditingTransaction(null);
          }}
          type={editingTransaction ? (transactions.find((t) => t._id === editingTransaction)?.type || "income") : transactionType}
          onSuccess={() => {
            setShowAddModal(false);
            setEditingTransaction(null);
            fetchTransactions();
          }}
          transactionId={editingTransaction || undefined}
        />
      )}
    </Layout>
  );
}


