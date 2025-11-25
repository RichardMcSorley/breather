"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import { addToSyncQueue } from "@/lib/offline";
import { useToast } from "@/lib/toast";

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

const DEFAULT_INCOME_SOURCE_TAGS = ["DoorDash", "Uber", "Instacart", "GrubHub", "Roadie", "Shipt", "ProxyPics"];
const DEFAULT_EXPENSE_SOURCE_TAGS = ["Gas", "Maintenance", "Insurance", "Tolls", "Parking", "Car Wash", "Oil Change", "Withdraw Fees"];

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
  const [incomeSourceTags, setIncomeSourceTags] = useState<string[]>(DEFAULT_INCOME_SOURCE_TAGS);
  const [expenseSourceTags, setExpenseSourceTags] = useState<string[]>(DEFAULT_EXPENSE_SOURCE_TAGS);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

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

  const fetchUserSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.incomeSourceTags && data.incomeSourceTags.length > 0) {
          setIncomeSourceTags(data.incomeSourceTags);
        }
        if (data.expenseSourceTags && data.expenseSourceTags.length > 0) {
          setExpenseSourceTags(data.expenseSourceTags);
        }
      }
    } catch (error) {
      console.error("Error fetching user settings:", error);
    }
  }, []);

  const saveCustomTagToSettings = async (tag: string, type: "income" | "expense") => {
    try {
      // Fetch current settings
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      
      const currentSettings = await res.json();
      const currentTags = type === "income" 
        ? (currentSettings.incomeSourceTags || [])
        : (currentSettings.expenseSourceTags || []);
      
      // Check if tag already exists (case-insensitive)
      const tagExists = currentTags.some(
        (existingTag: string) => existingTag.toLowerCase() === tag.toLowerCase()
      );
      
      if (!tagExists) {
        // Add the new tag to the appropriate array
        const updatedTags = [...currentTags, tag];
        
        // Update settings
        const updateBody: any = {
          irsMileageDeduction: currentSettings.irsMileageDeduction || 0.70,
        };
        
        if (type === "income") {
          updateBody.incomeSourceTags = updatedTags;
          updateBody.expenseSourceTags = currentSettings.expenseSourceTags || [];
        } else {
          updateBody.incomeSourceTags = currentSettings.incomeSourceTags || [];
          updateBody.expenseSourceTags = updatedTags;
        }
        
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });
        
        // Update local state to reflect the new tag
        if (type === "income") {
          setIncomeSourceTags(updatedTags);
        } else {
          setExpenseSourceTags(updatedTags);
        }
      }
    } catch (error) {
      console.error("Error saving custom tag to settings:", error);
      // Don't show error to user - this is a background operation
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUserSettings();
    }
  }, [isOpen, fetchUserSettings]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      resetForm();
      setDataLoaded(false);
      return;
    }

    if (transactionId) {
      setDataLoaded(false);
      fetchTransaction();
    } else {
      // When opening for new transaction, ensure date is set to today
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
      setDataLoaded(true);
    }
  }, [transactionId, isOpen, initialAmount, initialNotes, initialIsBill, fetchTransaction]);

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

    // Use form data for both new and edited transactions
    const submissionDate = formData.date;
    const submissionTime = formData.time;

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
        // If a custom tag was used, save it to settings
        const finalTag = customTag || formData.tag;
        if (finalTag && finalTag.trim()) {
          // Check if it's a custom tag (not in the current tags list)
          const currentTags = transactionType === "income" ? incomeSourceTags : expenseSourceTags;
          const isCustomTag = !currentTags.includes(finalTag.trim());
          
          if (isCustomTag) {
            await saveCustomTagToSettings(finalTag.trim(), transactionType);
          }
        }
        
        onSuccess();
        resetForm();
        toast.success("Transaction saved successfully");
      } else {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(errorData.error || "Error saving transaction");
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
            date: formData.date,
            time: formData.time,
            notes: formData.notes,
            tag: tag || undefined,
            isBill: formData.isBill,
            dueDate: formData.dueDate || undefined,
          },
        });
        onSuccess();
        resetForm();
        toast.success("Transaction queued for sync");
      } else {
        console.error("Error saving transaction:", error);
        toast.error("Error saving transaction");
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

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date"
            type="date"
            required
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
          <Input
            label="Time"
            type="time"
            required
            value={formData.time}
            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
          />
        </div>

        {transactionType === "income" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Income Source
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {incomeSourceTags.map((tag) => (
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

        {transactionType === "expense" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expense Source (optional)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {expenseSourceTags.map((tag) => (
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

