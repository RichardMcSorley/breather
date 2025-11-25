"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import { addToSyncQueue } from "@/lib/offline";

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "income" | "expense";
  onSuccess: () => void;
  transactionId?: string;
  initialAmount?: number;
  initialNotes?: string;
  initialIsBill?: boolean;
  initialType?: "income" | "expense";
}

const INCOME_SOURCE_TAGS = ["DoorDash", "Uber", "Instacart", "GrubHub", "Roadie", "Shipt", "ProxyPics"];
const EXPENSE_SOURCE_TAGS = ["Withdraw Fees"];

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

export default function AddTransactionModal({
  isOpen,
  onClose,
  type,
  onSuccess,
  transactionId,
  initialAmount,
  initialNotes,
  initialIsBill,
  initialType,
}: AddTransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">(initialType || type);
  const [formData, setFormData] = useState({
    amount: initialAmount?.toString() || "",
    date: formatLocalDate(new Date()),
    time: new Date().toTimeString().slice(0, 5),
    notes: initialNotes || "",
    tag: "",
    isBill: initialIsBill || false,
    dueDate: "",
  });
  const [customTag, setCustomTag] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = useCallback(() => {
    const now = new Date();
    setFormData({
      amount: initialAmount?.toString() || "",
      date: formatLocalDate(now),
      time: now.toTimeString().slice(0, 5),
      notes: initialNotes || "",
      tag: "",
      isBill: initialIsBill || false,
      dueDate: "",
    });
    setCustomTag("");
  }, [initialAmount, initialNotes, initialIsBill]);

  const fetchTransaction = useCallback(async () => {
    try {
      const res = await fetch(`/api/transactions/${transactionId}`);
      if (res.ok) {
        const data = await res.json();
        setTransactionType(data.type || type);
        setFormData({
          amount: data.amount.toString(),
          date: formatLocalDate(data.date),
          time: data.time,
          notes: data.notes || "",
          tag: data.tag || "",
          isBill: data.isBill || false,
          dueDate: data.dueDate || "",
        });
        setDataLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching transaction:", error);
      setDataLoaded(true);
    }
  }, [transactionId, type]);

  useEffect(() => {
    if (transactionId) {
      setDataLoaded(false);
      fetchTransaction();
    } else {
      resetForm();
      setDataLoaded(true);
    }
  }, [transactionId, isOpen, initialAmount, initialNotes, initialIsBill, fetchTransaction, resetForm]);

  useEffect(() => {
    if (!isOpen || !dataLoaded) return;
    // Use setTimeout to ensure the modal is fully rendered and input is visible
    const timeoutId = setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [isOpen, dataLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const now = new Date();
    const submissionDate = transactionId ? formData.date : formatLocalDate(now);
    const submissionTime = transactionId ? formData.time : now.toTimeString().slice(0, 5);

    try {
      const tag = customTag || formData.tag;
      const url = transactionId
        ? `/api/transactions/${transactionId}`
        : "/api/transactions";
      const method = transactionId ? "PUT" : "POST";

      const requestBody = {
        amount: parseFloat(formData.amount),
        type: transactionType,
        date: submissionDate,
        time: submissionTime,
        notes: formData.notes,
        tag: tag || undefined,
        isBill: formData.isBill,
        dueDate: formData.dueDate || undefined,
      };

      // If offline, add to sync queue
      if (!navigator.onLine) {
        await addToSyncQueue({
          type: method === "PUT" ? "update" : "create",
          endpoint: url,
          method,
          data: requestBody,
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
        alert("Error saving transaction");
      }
    } catch (error) {
      // If offline, queue the operation
      if (!navigator.onLine) {
        const tag = customTag || formData.tag;
        const url = transactionId
          ? `/api/transactions/${transactionId}`
          : "/api/transactions";
        const method = transactionId ? "PUT" : "POST";
        await addToSyncQueue({
          type: method === "PUT" ? "update" : "create",
          endpoint: url,
          method,
          data: {
            amount: parseFloat(formData.amount),
            type: transactionType,
            date: submissionDate,
            time: submissionTime,
            notes: formData.notes,
            tag: tag || undefined,
            isBill: formData.isBill,
            dueDate: formData.dueDate || undefined,
          },
        });
        onSuccess();
        resetForm();
      } else {
        console.error("Error saving transaction:", error);
        alert("Error saving transaction");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={transactionId ? "Edit Transaction" : `Add ${transactionType === "income" ? "Income" : "Expense"}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {transactionId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Transaction Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTransactionType("income")}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  transactionType === "income"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                Income
              </button>
              <button
                type="button"
                onClick={() => setTransactionType("expense")}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  transactionType === "expense"
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                Expense
              </button>
            </div>
          </div>
        )}

        <Input
          label="Amount ($)"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          ref={amountInputRef}
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          placeholder="0.00"
        />

        {transactionType === "income" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Income Source
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {INCOME_SOURCE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, tag });
                    setCustomTag("");
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                    formData.tag === tag && !customTag
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <Input
              placeholder="Or enter custom source"
              value={customTag}
              onChange={(e) => {
                setCustomTag(e.target.value);
                if (e.target.value) {
                  setFormData({ ...formData, tag: "" });
                }
              }}
            />
          </div>
        )}

        {transactionId && transactionType === "expense" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expense Source (optional)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {EXPENSE_SOURCE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, tag });
                    setCustomTag("");
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                    formData.tag === tag && !customTag
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <Input
              placeholder="Or enter custom source"
              value={customTag}
              onChange={(e) => {
                setCustomTag(e.target.value);
                if (e.target.value) {
                  setFormData({ ...formData, tag: "" });
                }
              }}
            />
          </div>
        )}

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
            {loading ? "Saving..." : transactionId ? "Update" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

