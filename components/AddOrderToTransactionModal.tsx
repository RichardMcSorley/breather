"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Modal from "./ui/Modal";
import { format, isToday, isYesterday } from "date-fns";
import { queryKeys } from "@/hooks/useQueries";

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
  linkedTransactions?: Array<{
    _id: string;
    amount: number;
    date: string;
    tag: string;
    notes?: string;
  }>;
}

interface AddOrderToTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder: (order: DeliveryOrder) => void;
}

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

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    if (isToday(date)) {
      return "Today";
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "MMM d, yyyy");
    }
  } catch {
    return dateString;
  }
};

const formatTime = (dateString: string, timeString?: string) => {
  try {
    const date = new Date(dateString);
    if (timeString) {
      const [hours, minutes] = timeString.split(":").map(Number);
      date.setHours(hours, minutes);
    }
    return format(date, "h:mm a");
  } catch {
    return timeString || "";
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

// App name to color mapping
const getAppTagColor = (appName: string) => {
  const appColors: Record<string, { bg: string; text: string }> = {
    "Uber Driver": { bg: "bg-black dark:bg-gray-800", text: "text-white dark:text-gray-100" },
    "Dasher": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
    "GH Drivers": { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
    "Shopper": { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  };

  return appColors[appName] || { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-500 dark:text-gray-400" };
};

export default function AddOrderToTransactionModal({
  isOpen,
  onClose,
  onSelectOrder,
}: AddOrderToTransactionModalProps) {
  const { data: session } = useSession();
  
  const { data: deliveryOrdersData, isLoading } = useQuery({
    queryKey: queryKeys.deliveryOrders(session?.user?.id, 50),
    queryFn: async () => {
      if (!session?.user?.id) {
        return { orders: [] };
      }
      const params = new URLSearchParams({
        userId: session.user.id,
        limit: "50",
      });
      const res = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch delivery orders");
      }
      const data = await res.json();
      return { orders: data.orders || [] };
    },
    enabled: isOpen && !!session?.user?.id,
  });

  const orders = deliveryOrdersData?.orders || [];

  const handleOrderClick = (order: DeliveryOrder) => {
    onSelectOrder(order);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Order to Add Transaction">
      {isLoading && orders.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {orders.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No delivery orders found.
        </div>
      )}

      {orders.length > 0 && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {orders.map((order) => {
            const appColor = getAppTagColor(order.appName);
            const isLinked = order.linkedTransactions && order.linkedTransactions.length > 0;
            const orderDate = formatDate(order.processedAt);
            const orderTime = formatTime(order.processedAt, order.time);
            
            return (
              <button
                key={order.id}
                onClick={() => handleOrderClick(order)}
                className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-white text-base">
                        {order.restaurantName}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${appColor.bg} ${appColor.text}`}>
                        {order.appName}
                      </span>
                      {isLinked && (
                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          ✓ Linked
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(order.money)}
                        </span>
                        <span>•</span>
                        <span>{order.miles.toFixed(1)} mi</span>
                        <span>•</span>
                        <span>${order.milesToMoneyRatio.toFixed(2)}/mi</span>
                      </div>
                      
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        {orderDate} {orderTime && `at ${orderTime}`}
                      </div>
                      
                      {isLinked && order.linkedTransactions && (
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Linked to {order.linkedTransactions.length} transaction{order.linkedTransactions.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Click to add</div>
                      <div className="text-lg">→</div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
