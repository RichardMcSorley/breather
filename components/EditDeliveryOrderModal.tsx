"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { format } from "date-fns";

interface LinkedTransaction {
  _id: string;
  amount: number;
  date: string;
  time: string;
  tag?: string;
  notes?: string;
}

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  time: string;
  screenshot?: string;
  processedAt: string;
  createdAt: string;
  linkedTransactions?: LinkedTransaction[];
}

interface EditDeliveryOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  userId?: string;
  onUpdate?: () => void;
}

export default function EditDeliveryOrderModal({
  isOpen,
  onClose,
  orderId,
  userId,
  onUpdate,
}: EditDeliveryOrderModalProps) {
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formValues, setFormValues] = useState({
    appName: "",
    miles: "",
    money: "",
    restaurantName: "",
    time: "",
  });

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrder();
    } else {
      setOrder(null);
      setError(null);
    }
  }, [isOpen, orderId, userId]);

  const fetchOrder = async () => {
    if (!orderId || !userId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch all orders and find the one we need
      const response = await fetch(`/api/delivery-orders?userId=${userId}&limit=100`);
      if (!response.ok) {
        throw new Error("Failed to fetch order");
      }

      const data = await response.json();
      const foundOrder = data.orders.find((o: DeliveryOrder) => o.id === orderId);
      
      if (!foundOrder) {
        throw new Error("Order not found");
      }

      setOrder(foundOrder);
      setFormValues({
        appName: foundOrder.appName,
        miles: foundOrder.miles.toString(),
        money: foundOrder.money.toString(),
        restaurantName: foundOrder.restaurantName,
        time: foundOrder.time,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!orderId) return;

    try {
      setSaving(true);
      setError(null);

      const miles = parseFloat(formValues.miles);
      const money = parseFloat(formValues.money);

      if (isNaN(miles) || miles <= 0) {
        throw new Error("Miles must be a positive number");
      }
      if (isNaN(money) || money <= 0) {
        throw new Error("Money must be a positive number");
      }

      const response = await fetch("/api/delivery-orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: orderId,
          appName: formValues.appName,
          miles,
          money,
          restaurantName: formValues.restaurantName,
          time: formValues.time,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update order");
      }

      onUpdate?.();
      onClose();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch {
      return dateString;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Delivery Order">
      {loading && !order && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {order && !loading && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Processed: {formatDate(order.processedAt)}
          </div>

          {/* Screenshot Display */}
          {order.screenshot && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Screenshot
              </label>
              <div className="rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <img
                  src={`data:image/png;base64,${order.screenshot}`}
                  alt="Order screenshot"
                  className="w-full h-auto max-h-[400px] object-contain"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              App Name
            </label>
            <input
              type="text"
              value={formValues.appName}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  appName: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Restaurant Name
            </label>
            <input
              type="text"
              value={formValues.restaurantName}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  restaurantName: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Miles
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formValues.miles}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    miles: e.target.value,
                  }))
                }
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Money ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formValues.money}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    money: e.target.value,
                  }))
                }
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {formValues.miles && formValues.money && (
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Ratio: ${(parseFloat(formValues.money) / parseFloat(formValues.miles)).toFixed(2)}/mi
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Time
            </label>
            <input
              type="text"
              value={formValues.time}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  time: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              placeholder="e.g., 2:30 PM"
            />
          </div>

          {/* Linked Transactions */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Linked Income Transactions
            </div>
            {order.linkedTransactions && order.linkedTransactions.length > 0 ? (
              <div className="space-y-2">
                {order.linkedTransactions.map((transaction) => (
                  <div
                    key={transaction._id}
                    className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        ${transaction.amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {format(new Date(transaction.date), "MMM d, yyyy")} at {transaction.time}
                      </div>
                    </div>
                    {transaction.tag && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {transaction.tag}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                No linked transactions
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

