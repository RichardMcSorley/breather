"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import LinkCustomerModal from "./LinkCustomerModal";
import LinkOrderModal from "./LinkOrderModal";
import { useTransaction, useSettings, useCreateTransaction, useUpdateTransaction, useUpdateSettings, queryKeys } from "@/hooks/useQueries";

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
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: transactionData } = useTransaction(transactionId);
  const { data: settingsData } = useSettings();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const updateSettings = useUpdateSettings();
  const [showLinkCustomerModal, setShowLinkCustomerModal] = useState(false);
  const [showLinkOrderModal, setShowLinkOrderModal] = useState(false);
  
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

  const incomeSourceTags = settingsData?.incomeSourceTags?.length > 0 
    ? settingsData.incomeSourceTags 
    : DEFAULT_INCOME_SOURCE_TAGS;
  const expenseSourceTags = settingsData?.expenseSourceTags?.length > 0 
    ? settingsData.expenseSourceTags 
    : DEFAULT_EXPENSE_SOURCE_TAGS;

  // Update form data when transaction is loaded
  useEffect(() => {
    if (transactionId && transactionData) {
      setTransactionType(transactionData.type || type);
      setFormData({
        amount: transactionData.amount.toString(),
        date: formatLocalDate(transactionData.date),
        time: transactionData.time,
        notes: transactionData.notes || "",
        tag: transactionData.tag || "",
        isBill: transactionData.isBill || false,
        dueDate: transactionData.dueDate || "",
      });
      setDataLoaded(true);
    } else if (!transactionId) {
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
  }, [transactionId, transactionData, type, initialAmount, initialNotes, initialIsBill]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
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
      setDataLoaded(false);
      return;
    }
  }, [isOpen, initialAmount, initialNotes, initialIsBill]);

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

    const tag = customTag || formData.tag;
    const requestBody = {
      amount: parseFloat(formData.amount),
      type: transactionType,
      date: formData.date,
      time: formData.time,
      notes: formData.notes,
      tag: tag || undefined,
      isBill: formData.isBill,
      dueDate: formData.dueDate || undefined,
    };

    const saveCustomTag = async (finalTag: string) => {
      if (!settingsData) return;
      
      const currentTags = transactionType === "income" 
        ? (settingsData.incomeSourceTags || [])
        : (settingsData.expenseSourceTags || []);
      
      // Check if tag already exists (case-insensitive)
      const tagExists = currentTags.some(
        (existingTag: string) => existingTag.toLowerCase() === finalTag.toLowerCase()
      );
      
      if (!tagExists) {
        const updatedTags = [...currentTags, finalTag];
        const updateBody: any = {
          irsMileageDeduction: settingsData.irsMileageDeduction || 0.70,
        };
        
        if (transactionType === "income") {
          updateBody.incomeSourceTags = updatedTags;
          updateBody.expenseSourceTags = settingsData.expenseSourceTags || [];
        } else {
          updateBody.incomeSourceTags = settingsData.incomeSourceTags || [];
          updateBody.expenseSourceTags = updatedTags;
        }
        
        updateSettings.mutate(updateBody);
      }
    };

    if (transactionId) {
      updateTransaction.mutate(
        { id: transactionId, ...requestBody },
        {
          onSuccess: () => {
            const finalTag = customTag || formData.tag;
            if (finalTag && finalTag.trim()) {
              const currentTags = transactionType === "income" ? incomeSourceTags : expenseSourceTags;
              const isCustomTag = !currentTags.includes(finalTag.trim());
              if (isCustomTag) {
                saveCustomTag(finalTag.trim());
              }
            }
            onSuccess();
            onClose();
          },
        }
      );
    } else {
      createTransaction.mutate(requestBody, {
        onSuccess: () => {
          const finalTag = customTag || formData.tag;
          if (finalTag && finalTag.trim()) {
            const currentTags = transactionType === "income" ? incomeSourceTags : expenseSourceTags;
            const isCustomTag = !currentTags.includes(finalTag.trim());
            if (isCustomTag) {
              saveCustomTag(finalTag.trim());
            }
          }
          onSuccess();
          onClose();
        },
      });
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
              {incomeSourceTags.map((tag: string) => (
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
              aria-label="Or enter custom income source"
            />
          </div>
        )}

        {transactionType === "expense" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expense Source (optional)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {expenseSourceTags.map((tag: string) => (
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
              aria-label="Or enter custom expense source"
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

        {/* Linked Customer/Order Info - Only show when editing and transaction is income */}
        {transactionId && transactionData && transactionType === "income" && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Linked Information
            </div>
            {transactionData.linkedOcrExport && (
              <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Linked Customer</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      👤 {transactionData.linkedOcrExport.customerName}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {transactionData.linkedOcrExport.customerAddress}
                    </div>
                    {transactionData.linkedOcrExport.appName && (
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        App: {transactionData.linkedOcrExport.appName}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const encodedAddress = encodeURIComponent(transactionData.linkedOcrExport.customerAddress);
                        router.push(`/ocr-data?address=${encodedAddress}`);
                        onClose();
                      }}
                      className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!transactionId || !transactionData.linkedOcrExport) return;
                        try {
                          const response = await fetch("/api/link", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              transactionId,
                              ocrExportId: transactionData.linkedOcrExport.id,
                              action: "unlink",
                            }),
                          });
                          if (response.ok) {
                            queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
                          }
                        } catch (error) {
                          console.error("Failed to unlink customer:", error);
                        }
                      }}
                      className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                    >
                      Unlink
                    </button>
                  </div>
                </div>
              </div>
            )}
            {transactionData.linkedDeliveryOrder && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Linked Delivery Order</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      📦 {transactionData.linkedDeliveryOrder.restaurantName}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {transactionData.linkedDeliveryOrder.appName} • {transactionData.linkedDeliveryOrder.miles?.toFixed(1) || "0"} mi • ${transactionData.linkedDeliveryOrder.money?.toFixed(2) || "0.00"}
                    </div>
                    {transactionData.linkedDeliveryOrder.miles && transactionData.linkedDeliveryOrder.money && (
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Ratio: ${(transactionData.linkedDeliveryOrder.money / transactionData.linkedDeliveryOrder.miles).toFixed(2)}/mi
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/delivery-orders?orderId=${transactionData.linkedDeliveryOrder.id}`);
                        onClose();
                      }}
                      className="px-3 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!transactionId || !transactionData.linkedDeliveryOrder) return;
                        try {
                          const response = await fetch("/api/link", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              transactionId,
                              deliveryOrderId: transactionData.linkedDeliveryOrder.id,
                              action: "unlink",
                            }),
                          });
                          if (response.ok) {
                            queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
                          }
                        } catch (error) {
                          console.error("Failed to unlink order:", error);
                        }
                      }}
                      className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                    >
                      Unlink
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!transactionData.linkedOcrExport && !transactionData.linkedDeliveryOrder && (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg mb-3">
                No linked customer or order
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLinkCustomerModal(true)}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Link Customer
              </button>
              <button
                type="button"
                onClick={() => setShowLinkOrderModal(true)}
                className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
              >
                Link Order
              </button>
            </div>
          </div>
        )}

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
            disabled={createTransaction.isPending || updateTransaction.isPending}
          >
            {(createTransaction.isPending || updateTransaction.isPending) ? "Saving..." : transactionId ? "Update" : "Add"}
          </Button>
        </div>
      </form>

      <LinkCustomerModal
        isOpen={showLinkCustomerModal}
        onClose={() => setShowLinkCustomerModal(false)}
        transactionId={transactionId || null}
        userId={session?.user?.id}
        onLink={() => {
          // Refetch transaction data to show updated links
          if (transactionId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
          }
        }}
      />

      <LinkOrderModal
        isOpen={showLinkOrderModal}
        onClose={() => setShowLinkOrderModal(false)}
        transactionId={transactionId || null}
        userId={session?.user?.id}
        onLink={() => {
          // Refetch transaction data to show updated links
          if (transactionId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
          }
        }}
      />
    </Modal>
  );
}

