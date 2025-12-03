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
  miles: number;
  money: number;
  milesToMoneyRatio: number;
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

        {selectedOrder && !transactionId && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg mb-4">
            <div className="text-sm font-medium text-purple-900 dark:text-purple-300 mb-1">
              Order Selected
            </div>
            <div className="text-xs text-purple-700 dark:text-purple-400">
              {selectedOrder.restaurantName} • {selectedOrder.appName} • {formatCurrency(selectedOrder.money)} • {selectedOrder.miles.toFixed(1)} mi
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

