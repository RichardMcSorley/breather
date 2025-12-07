"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import LinkCustomerModal from "./LinkCustomerModal";
import LinkOrderModal from "./LinkOrderModal";
import ScreenshotModal from "./ScreenshotModal";
import EditCustomerEntriesModal from "./EditCustomerEntriesModal";
import EditDeliveryOrderModal from "./EditDeliveryOrderModal";
import TransactionLinkedInfo from "./TransactionLinkedInfo";
import { useTransaction, useSettings, useCreateTransaction, useUpdateTransaction, useUpdateSettings, queryKeys } from "@/hooks/useQueries";
import { getCurrentESTAsUTC } from "@/lib/date-utils";

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles?: number;
  money: number;
  milesToMoneyRatio?: number;
  restaurantName: string;
  time: string;
  processedAt: string;
}

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
  selectedOrder?: DeliveryOrder | null;
}

const DEFAULT_INCOME_SOURCE_TAGS = ["Uber Driver", "Dasher", "GH Drivers", "Shopper", "Roadie", "ProxyPics"];
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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
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
  selectedOrder,
}: AddTransactionModalProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: transactionData } = useTransaction(transactionId);
  const { data: settingsData } = useSettings();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const updateSettings = useUpdateSettings();
  const [showLinkCustomerModal, setShowLinkCustomerModal] = useState(false);
  const [showLinkOrderModal, setShowLinkOrderModal] = useState(false);
  const [showCustomerScreenshot, setShowCustomerScreenshot] = useState(false);
  const [showOrderScreenshot, setShowOrderScreenshot] = useState(false);
  const [editingCustomerAddress, setEditingCustomerAddress] = useState<string | null>(null);
  const [editingCustomerEntryId, setEditingCustomerEntryId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  
  const [transactionType, setTransactionType] = useState<"income" | "expense">(initialType || type);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  // Initialize with EST date/time to match API expectations
  // Use function initializer to call getCurrentESTAsUTC only once on mount
  const [formData, setFormData] = useState(() => {
    const estNow = getCurrentESTAsUTC();
    return {
      amount: initialAmount?.toString() || "",
      date: estNow.estDateString,
      time: estNow.timeString,
      notes: initialNotes || "",
      tag: "",
      isBill: initialIsBill || false,
      dueDate: "",
    };
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
      // Only show date/time and income source after data is loaded
      setDataLoaded(true);
    } else if (!transactionId) {
      // When opening for new transaction, check if we have a selected order
      if (selectedOrder) {
        // Convert UTC processedAt to EST date/time (like quick transaction API does)
        // Create a date object from the UTC timestamp, then convert to EST
        const utcDate = new Date(selectedOrder.processedAt);
        const utcTimestamp = utcDate.getTime();
        
        // EST is UTC-5, so subtract 5 hours in milliseconds
        const EST_OFFSET_MS = 5 * 60 * 60 * 1000;
        const estTimestamp = utcTimestamp - EST_OFFSET_MS;
        const estDate = new Date(estTimestamp);
        
        // Extract EST date components from the adjusted timestamp
        // Note: getUTCFullYear/getUTCMonth/getUTCDate are used because estTimestamp
        // is still a UTC timestamp, just shifted by 5 hours
        const estYear = estDate.getUTCFullYear();
        const estMonth = estDate.getUTCMonth();
        const estDay = estDate.getUTCDate();
        const estHour = estDate.getUTCHours();
        const estMinute = estDate.getUTCMinutes();
        
        // Format EST date as YYYY-MM-DD
        const formattedDate = `${estYear}-${String(estMonth + 1).padStart(2, '0')}-${String(estDay).padStart(2, '0')}`;
        
        // Use order's time if available, otherwise use EST time from processedAt
        let orderTime = selectedOrder.time || "";
        if (!orderTime) {
          orderTime = `${String(estHour).padStart(2, '0')}:${String(estMinute).padStart(2, '0')}`;
        }
        
        setFormData({
          amount: selectedOrder.money.toString(),
          date: formattedDate,
          time: orderTime,
          notes: "",
          tag: selectedOrder.appName,
          isBill: false,
          dueDate: "",
        });
        setSelectedOrderId(selectedOrder.id);
        setCustomTag("");
        setDataLoaded(true);
      } else {
        // When opening for new transaction, ensure date is set to today in EST
        const estNow = getCurrentESTAsUTC();
        setFormData({
          amount: initialAmount?.toString() || "",
          date: estNow.estDateString,
          time: estNow.timeString,
          notes: initialNotes || "",
          tag: "",
          isBill: initialIsBill || false,
          dueDate: "",
        });
        setCustomTag("");
        setDataLoaded(true);
      }
    }
  }, [transactionId, transactionData, type, initialAmount, initialNotes, initialIsBill, selectedOrder]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes - use EST date/time
      const estNow = getCurrentESTAsUTC();
      setFormData({
        amount: initialAmount?.toString() || "",
        date: estNow.estDateString,
        time: estNow.timeString,
        notes: initialNotes || "",
        tag: "",
        isBill: initialIsBill || false,
        dueDate: "",
      });
      setCustomTag("");
      setSelectedOrderId("");
      setDataLoaded(false);
    }
  }, [isOpen, initialAmount, initialNotes, initialIsBill, transactionId, selectedOrder]);

  // Reset order selection when transaction type changes
  useEffect(() => {
    if (transactionType !== "income") {
      setSelectedOrderId("");
    }
  }, [transactionType]);

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
        onSuccess: async (data) => {
          const finalTag = customTag || formData.tag;
          if (finalTag && finalTag.trim()) {
            const currentTags = transactionType === "income" ? incomeSourceTags : expenseSourceTags;
            const isCustomTag = !currentTags.includes(finalTag.trim());
            if (isCustomTag) {
              saveCustomTag(finalTag.trim());
            }
          }
          
          // Link the order if one was selected
          if (selectedOrderId && data?._id) {
            try {
              const linkResponse = await fetch("/api/link", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  transactionId: data._id,
                  deliveryOrderId: selectedOrderId,
                  action: "link",
                }),
              });
              
              if (!linkResponse.ok) {
                console.error("Failed to link order:", await linkResponse.text());
              } else {
                // Invalidate transaction queries to refresh linked order data
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                queryClient.invalidateQueries({ queryKey: queryKeys.transaction(data._id) });
              }
            } catch (error) {
              console.error("Error linking order:", error);
            }
          }
          
          onSuccess();
          onClose();
        },
      });
    }
  };

  return (
    <div>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={transactionId ? "Edit Transaction" : transactionType === "income" ? "Income" : "Expense"}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
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

        {selectedOrder && !transactionId && transactionType === "income" && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg mb-4">
            <div className="text-sm font-medium text-purple-900 dark:text-purple-300 mb-1">
              Order Selected
            </div>
            <div className="text-xs text-purple-700 dark:text-purple-400">
              {selectedOrder.restaurantName} • {selectedOrder.appName} • {formatCurrency(selectedOrder.money)}{selectedOrder.miles !== undefined ? ` • ${selectedOrder.miles.toFixed(1)} mi` : ""}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
            TRANSACTION *
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount ($) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              ref={amountInputRef}
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Time *
              </label>
              <input
                type="text"
                required
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2:30 PM"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              App Name
            </label>
            <select
              value={customTag || formData.tag}
              onChange={(e) => {
                if (expenseSourceTags.includes(e.target.value) || incomeSourceTags.includes(e.target.value)) {
                  setFormData({ ...formData, tag: e.target.value });
                  setCustomTag("");
                } else {
                  setCustomTag(e.target.value);
                  setFormData({ ...formData, tag: "" });
                }
              }}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {transactionType === "expense" ? (
                <>
                  {expenseSourceTags.map((tag: string) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </>
              ) : (
                <>
                  {incomeSourceTags.map((tag: string) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </>
              )}
            </select>
            {transactionType === "expense" && (
              <input
                type="text"
                value={customTag}
                onChange={(e) => {
                  setCustomTag(e.target.value);
                  if (e.target.value) {
                    setFormData({ ...formData, tag: "" });
                  }
                }}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                placeholder="Or enter custom expense source"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes"
              rows={2}
            />
          </div>
        </div>

        {transactionType === "income" && transactionId && (
          <TransactionLinkedInfo
            transactionId={transactionId}
            transactionData={transactionData}
            transactionType={transactionType}
            onClose={onClose}
            onShowLinkCustomerModal={() => setShowLinkCustomerModal(true)}
            onShowLinkOrderModal={() => setShowLinkOrderModal(true)}
            onEditCustomer={(address, entryId) => {
              setEditingCustomerAddress(address);
              setEditingCustomerEntryId(entryId || null);
            }}
            onEditOrder={(orderId) => {
              setEditingOrderId(orderId);
            }}
          />
        )}

        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createTransaction.isPending || updateTransaction.isPending}
            className="flex-1 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {(createTransaction.isPending || updateTransaction.isPending) ? "Saving..." : transactionId ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </Modal>

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

    <ScreenshotModal
      isOpen={showCustomerScreenshot}
      onClose={() => setShowCustomerScreenshot(false)}
      screenshot={transactionData?.linkedOcrExport?.screenshot}
      title={`Customer Screenshot - ${transactionData?.linkedOcrExport?.customerName || ""}`}
    />

    <ScreenshotModal
      isOpen={showOrderScreenshot}
      onClose={() => setShowOrderScreenshot(false)}
      screenshot={transactionData?.linkedDeliveryOrder?.screenshot}
      title={`Order Screenshot - ${transactionData?.linkedDeliveryOrder?.restaurantName || ""}`}
    />

    <EditCustomerEntriesModal
      isOpen={editingCustomerAddress !== null}
      onClose={() => {
        setEditingCustomerAddress(null);
        setEditingCustomerEntryId(null);
      }}
      address={editingCustomerAddress}
      entryId={editingCustomerEntryId}
      userId={session?.user?.id}
      onUpdate={() => {
        // Optionally refresh transaction data if needed
        if (transactionId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
        }
      }}
    />

    <EditDeliveryOrderModal
      isOpen={editingOrderId !== null}
      onClose={() => setEditingOrderId(null)}
      orderId={editingOrderId}
      userId={session?.user?.id}
      onUpdate={() => {
        // Optionally refresh transaction data if needed
        if (transactionId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
        }
      }}
    />
    </div>
  );
}

