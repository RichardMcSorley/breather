"use client";

import { useState, useEffect, useRef } from "react";
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
}

const INCOME_TAGS = ["Instacart", "Uber", "DoorDash", "GrubHub", "ProxyPics"];

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
}: AddTransactionModalProps) {
  const [loading, setLoading] = useState(false);
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
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (transactionId) {
      fetchTransaction();
    } else {
      resetForm();
    }
  }, [transactionId, isOpen, initialAmount, initialNotes, initialIsBill]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, transactionId]);

  const fetchTransaction = async () => {
    try {
      const res = await fetch(`/api/transactions/${transactionId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          amount: data.amount.toString(),
          date: formatLocalDate(data.date),
          time: data.time,
          notes: data.notes || "",
          tag: data.tag || "",
          isBill: data.isBill || false,
          dueDate: data.dueDate || "",
        });
      }
    } catch (error) {
      console.error("Error fetching transaction:", error);
    }
  };

  const resetForm = () => {
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
  };

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
        type,
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
          type: method === "DELETE" ? "delete" : method === "PUT" ? "update" : "create",
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
          type: method === "DELETE" ? "delete" : method === "PUT" ? "update" : "create",
          endpoint: url,
          method,
          data: {
            amount: parseFloat(formData.amount),
            type,
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
      title={transactionId ? "Edit Transaction" : `Add ${type === "income" ? "Income" : "Expense"}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Amount ($)"
          type="number"
          step="0.01"
          required
          ref={amountInputRef}
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          placeholder="0.00"
        />

        {type === "income" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Income Source
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {INCOME_TAGS.map((tag) => (
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
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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

