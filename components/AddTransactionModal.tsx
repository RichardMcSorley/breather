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
import { useTransaction, useSettings, useCreateTransaction, useUpdateTransaction, useUpdateSettings, useDeliveryOrders, queryKeys } from "@/hooks/useQueries";

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
  
  // Fetch delivery orders when modal is open, creating new income transaction
  const shouldFetchOrders = isOpen && !transactionId && transactionType === "income";
  const { data: deliveryOrdersData } = useQuery({
    queryKey: queryKeys.deliveryOrders(session?.user?.id, 20),
    queryFn: async () => {
      if (!session?.user?.id) {
        return { orders: [] };
      }
      const params = new URLSearchParams({
        userId: session.user.id,
        limit: "20",
      });
      const res = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch delivery orders");
      }
      const data = await res.json();
      return { orders: data.orders || [] };
    },
    enabled: shouldFetchOrders && !!session?.user?.id,
  });
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
      // Only show date/time and income source after data is loaded
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
      setSelectedOrderId("");
      setDataLoaded(false);
    }
  }, [isOpen, initialAmount, initialNotes, initialIsBill, transactionId]);

  // Reset order selection when transaction type changes
  useEffect(() => {
    setSelectedOrderId("");
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

  // Handle order selection
  const handleOrderSelect = (orderId: string) => {
    if (!orderId || !deliveryOrdersData?.orders) return;
    
    const selectedOrder = deliveryOrdersData.orders.find((order: any) => order.id === orderId);
    if (!selectedOrder) return;

    // Format date from processedAt
    const orderDate = new Date(selectedOrder.processedAt);
    const formattedDate = formatLocalDate(orderDate);
    
    // Use order time if available, otherwise use processedAt time
    let orderTime = selectedOrder.time || "";
    if (!orderTime) {
      orderTime = orderDate.toTimeString().slice(0, 5);
    }

    // Populate form fields (but NOT notes)
    setFormData({
      ...formData,
      amount: selectedOrder.money.toString(),
      date: formattedDate,
      time: orderTime,
      notes: "", // Don't fill notes
      tag: selectedOrder.appName,
    });
    setCustomTag("");
    // Keep selectedOrderId stored so we can link it after transaction creation
  };

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

        {/* Order Selection - Only show when creating new income transaction */}
        {!transactionId && transactionType === "income" && deliveryOrdersData?.orders && deliveryOrdersData.orders.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Recent Order (optional)
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => {
                setSelectedOrderId(e.target.value);
                handleOrderSelect(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Select an order to fill info --</option>
              {deliveryOrdersData.orders.map((order: any) => {
                const orderDate = new Date(order.processedAt);
                const formattedDate = formatLocalDate(orderDate);
                const formattedAmount = new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(order.money);
                return (
                  <option key={order.id} value={order.id}>
                    {order.restaurantName} - {formattedAmount} ({order.appName}) - {formattedDate}
                  </option>
                );
              })}
            </select>
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

