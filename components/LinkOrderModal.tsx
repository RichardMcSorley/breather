"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";

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

interface LinkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId?: string | null;
  ocrExportId?: string | null;
  userId?: string;
  onLink?: () => void;
}

export default function LinkOrderModal({
  isOpen,
  onClose,
  transactionId,
  ocrExportId,
  userId,
  onLink,
}: LinkOrderModalProps) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchOrders();
    } else {
      setOrders([]);
      setError(null);
    }
  }, [isOpen, userId, transactionId]);

  const fetchOrders = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams({
        userId,
        limit: "100",
      });

      // If transactionId is provided, fetch transaction data and add filters
      if (transactionId) {
        const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
        if (transactionResponse.ok) {
          const transactionData = await transactionResponse.json();
          
          // Add filtering parameters
          if (transactionData.amount) {
            params.append("filterAmount", transactionData.amount.toString());
          }
          if (transactionData.tag) {
            params.append("filterAppName", transactionData.tag);
          }
          if (transactionData.date && transactionData.time) {
            // Combine date and time to create a datetime string
            const transactionDateTime = `${transactionData.date}T${transactionData.time}`;
            params.append("filterDateTime", transactionDateTime);
          }
        }
      }

      const response = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch delivery orders");
      }

      const data = await response.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (orderId: string) => {
    try {
      setLinkingId(orderId);
      setError(null);

      const body: any = {
        deliveryOrderId: orderId,
        action: "link",
      };

      if (transactionId) {
        body.transactionId = transactionId;
      }
      if (ocrExportId) {
        body.ocrExportId = ocrExportId;
      }

      const response = await fetch("/api/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link order");
      }

      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link order");
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
    <Modal isOpen={isOpen} onClose={onClose} title="Link Delivery Order">
      {loading && orders.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {orders.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No delivery orders found.
        </div>
      )}

      {orders.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {orders.map((order) => (
            <div
              key={order.id}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {order.restaurantName}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {order.appName}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {formatDate(order.processedAt)} • {order.miles.toFixed(1)} mi • {formatCurrency(order.money)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Ratio: ${order.milesToMoneyRatio.toFixed(2)}/mi
                </div>
              </div>
              <button
                onClick={() => handleLink(order.id)}
                disabled={linkingId === order.id}
                className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed ml-4"
              >
                {linkingId === order.id ? "Linking..." : "Link"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

