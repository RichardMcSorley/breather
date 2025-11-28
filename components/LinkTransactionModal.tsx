"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";

interface Transaction {
  _id: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  time: string;
  tag?: string;
  notes?: string;
}

interface LinkTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ocrExportId?: string | null;
  deliveryOrderId?: string | null;
  userId?: string;
  onLink?: () => void;
}

export default function LinkTransactionModal({
  isOpen,
  onClose,
  ocrExportId,
  deliveryOrderId,
  userId,
  onLink,
}: LinkTransactionModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchIncomeTransactions();
    } else {
      setTransactions([]);
      setError(null);
    }
  }, [isOpen, userId]);

  const fetchIncomeTransactions = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch recent income transactions
      const response = await fetch(
        `/api/transactions?userId=${userId}&type=income&limit=50`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch transactions");
      }

      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (transactionId: string) => {
    try {
      setLinkingId(transactionId);
      setError(null);

      const response = await fetch("/api/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId,
          ocrExportId: ocrExportId || undefined,
          deliveryOrderId: deliveryOrderId || undefined,
          action: "link",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link transaction");
      }

      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link transaction");
    } finally {
      setLinkingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Income Transaction">
      {loading && transactions.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {transactions.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No income transactions found.
        </div>
      )}

      {transactions.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {transactions.map((transaction) => (
            <div
              key={transaction._id}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(transaction.amount)}
                  </span>
                  {transaction.tag && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {transaction.tag}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {formatDate(transaction.date)} at {transaction.time}
                </div>
                {transaction.notes && (
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {transaction.notes}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleLink(transaction._id)}
                disabled={linkingId === transaction._id}
                className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed ml-4"
              >
                {linkingId === transaction._id ? "Linking..." : "Link"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

