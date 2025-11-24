"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import Layout from "@/components/Layout";
import AddTransactionModal from "@/components/AddTransactionModal";
import Button from "@/components/ui/Button";

interface Transaction {
  _id: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  time: string;
  notes?: string;
  tag?: string;
  isBill: boolean;
  dueDate?: string;
}

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
  return new Date(year, month - 1, day, hour, minute);
};

export default function HistoryPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  useEffect(() => {
    if (session?.user?.id) {
      fetchTransactions();
    }
  }, [session, filterType, filterTag]);

  const fetchTransactions = async () => {
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
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  };

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
      return "TODAY";
    } else if (isYesterday(date)) {
      return "YESTERDAY";
    } else {
      return format(date, "MMM d, yyyy").toUpperCase();
    }
  };

  const formatTime = (dateString: string, timeString: string) => {
    const date = buildLocalDateFromParts(dateString, timeString);
    return format(date, "h:mm a").toUpperCase();
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">HISTORY</h2>

        <div className="flex gap-2 mb-4 overflow-x-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "all"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType("income")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "income"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            Income
          </button>
          <button
            onClick={() => setFilterType("expense")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "expense"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700"
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
                  : "bg-gray-100 text-gray-700"
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
                    : "bg-gray-100 text-gray-700"
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
          <div className="text-center py-12 text-gray-500">
            No transactions found. Add your first transaction!
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([dateKey, dateTransactions]) => (
            <div key={dateKey}>
              <h3 className="text-sm font-bold text-gray-700 mb-2">{dateKey}</h3>
              <div className="space-y-2">
                {dateTransactions.map((transaction) => {
                  const isIncome = transaction.type === "income";
                  return (
                    <div
                      key={transaction._id}
                      className="bg-white rounded-lg p-4 border border-gray-200 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            isIncome ? "bg-green-100" : "bg-red-100"
                          }`}
                        >
                          <span className="text-xl">📊</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                isIncome ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {transaction.type.toUpperCase()}
                            </span>
                            {transaction.tag && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {transaction.tag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatTime(transaction.date, transaction.time)}
                          </div>
                          {transaction.isBill && transaction.dueDate ? (
                            <div className="text-sm text-gray-600 mt-1">
                              {transaction.notes && (
                                <span className="font-medium">{transaction.notes}</span>
                              )}
                              <span className={transaction.notes ? " ml-1" : ""}>
                                - Bill due on {format(parseISO(transaction.dueDate), "MMM d, yyyy")}
                              </span>
                            </div>
                          ) : transaction.notes ? (
                            <div className="text-sm text-gray-600 mt-1 truncate">
                              {transaction.notes}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={`text-lg font-bold ${
                            isIncome ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setEditingTransaction(transaction._id)}
                          className="p-2 text-gray-600 hover:text-gray-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(transaction._id)}
                          className="p-2 text-red-600 hover:text-red-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          type={transactions.find((t) => t._id === editingTransaction)?.type || "income"}
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


