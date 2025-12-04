"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { format, isToday, isYesterday } from "date-fns";
import Layout from "@/components/Layout";
import AddTransactionModal from "@/components/AddTransactionModal";
import AddOrderToTransactionModal from "@/components/AddOrderToTransactionModal";
import EditCustomerEntriesModal from "@/components/EditCustomerEntriesModal";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import LinkOrderModal from "@/components/LinkOrderModal";
import ShareOrderModal from "@/components/ShareOrderModal";
import { useTransactions, useDeleteTransaction, queryKeys } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";

interface LinkedCustomer {
  id: string;
  customerName: string;
  customerAddress: string;
  appName?: string;
  entryId: string;
}

interface LinkedOrder {
  id: string;
  restaurantName: string;
  restaurantAddress?: string;
  appName: string;
  miles: number;
  money: number;
  entryId: string;
  userLatitude?: number;
  userLongitude?: number;
  userAddress?: string;
}

interface Transaction {
  _id: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  time: string;
  notes?: string;
  tag?: string;
  isBill: boolean;
  isBalanceAdjustment?: boolean; // Kept for filtering out existing balance adjustments
  dueDate?: string;
  linkedOcrExports?: LinkedCustomer[];
  linkedDeliveryOrders?: LinkedOrder[];
}

interface SelectedDeliveryOrder {
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

/**
 * Parses a date string (YYYY-MM-DD) and time string (HH:MM) as LOCAL time.
 * The time string represents the user's local time, not UTC.
 */
const buildLocalDateFromParts = (dateString: string, timeString?: string) => {
  if (!dateString) return new Date();
  const baseDate = dateString.split("T")[0] || dateString;
  const [year, month, day] = baseDate.split("-").map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    const fallback = new Date(dateString);
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  }
  const [hour, minute] = (timeString?.split(":").map(Number) ?? [0, 0]).map((value) =>
    Number.isNaN(value) ? 0 : value
  );
  
  // Parse as LOCAL date/time - the time string is already in the user's local timezone
  // Create a local Date object directly without UTC conversion
  return new Date(year, month - 1, day, hour, minute);
};

export default function HistoryPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 50;
  const [editingCustomerAddress, setEditingCustomerAddress] = useState<string | null>(null);
  const [editingCustomerEntryId, setEditingCustomerEntryId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [linkingCustomerTransactionId, setLinkingCustomerTransactionId] = useState<string | null>(null);
  const [linkingOrderTransactionId, setLinkingOrderTransactionId] = useState<string | null>(null);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [selectedOrderForTransaction, setSelectedOrderForTransaction] = useState<SelectedDeliveryOrder | null>(null);
  const [sharingOrder, setSharingOrder] = useState<{ orderId?: string; restaurantName: string; orderDetails?: { miles?: number; money?: number; milesToMoneyRatio?: number; appName?: string }; userLatitude?: number; userLongitude?: number; userAddress?: string } | null>(null);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filterType, filterTag]);
  
  const { data, isLoading: loading } = useTransactions(filterType, filterTag, page, limit);
  const deleteTransaction = useDeleteTransaction();
  
  const transactions = data?.transactions || [];
  const pagination = data?.pagination;

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) {
      return;
    }
    deleteTransaction.mutate(id);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string, timeString?: string) => {
    const date = buildLocalDateFromParts(dateString, timeString);
    if (isToday(date)) {
      return "Today";
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "MMM d, yyyy");
    }
  };

  const formatTime = (dateString: string, timeString: string) => {
    const date = buildLocalDateFromParts(dateString, timeString);
    return format(date, "h:mm a");
  };

  const handleShareAddress = async (address: string, customerName?: string) => {
    const shareText = customerName ? `${customerName}, ${address}` : address;
    
    if (navigator.share) {
      try {
        await navigator.share({
          text: shareText,
        });
      } catch (err) {
        // User cancelled or error occurred - silently fail
        console.log("Share cancelled or failed:", err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        alert("Address copied to clipboard");
      } catch (err) {
        console.error("Failed to copy address:", err);
      }
    }
  };

  const handleShareRestaurant = (order: LinkedOrder) => {
    const ratio = order.miles > 0 ? order.money / order.miles : undefined;
    setSharingOrder({
      orderId: order.id,
      restaurantName: order.restaurantName,
      orderDetails: {
        miles: order.miles,
        money: order.money,
        milesToMoneyRatio: ratio,
        appName: order.appName,
      },
      userLatitude: order.userLatitude,
      userLongitude: order.userLongitude,
      userAddress: order.userAddress,
    });
  };

  const handleShareRestaurantAddress = async (address: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          text: address,
        });
      } catch (err) {
        // User cancelled or error occurred - silently fail
        console.log("Share cancelled or failed:", err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(address);
        alert("Address copied to clipboard");
      } catch (err) {
        console.error("Failed to copy address:", err);
      }
    }
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

  // Get app initials
  const getAppInitials = (appName: string): string => {
    const initials: Record<string, string> = {
      "Uber Driver": "UB",
      "Dasher": "DD",
      "GH Drivers": "GH",
      "Shopper": "IC",
    };

    if (initials[appName]) {
      return initials[appName];
    }

    // Fallback: use first two letters
    return appName.substring(0, 2).toUpperCase();
  };

  // Get icon color for app (for the circle background)
  const getAppIconColor = (appName: string) => {
    const iconColors: Record<string, { bg: string; text: string }> = {
      "Uber Driver": { bg: "bg-black dark:bg-gray-900", text: "text-white" },
      "Dasher": { bg: "bg-red-500 dark:bg-red-600", text: "text-white" },
      "GH Drivers": { bg: "bg-orange-500 dark:bg-orange-600", text: "text-white" },
      "Shopper": { bg: "bg-purple-500 dark:bg-purple-600", text: "text-white" },
    };

    return iconColors[appName] || { bg: "bg-gray-500 dark:bg-gray-600", text: "text-white" };
  };

  const groupedTransactions = transactions.reduce((acc: Record<string, Transaction[]>, transaction: Transaction) => {
    const dateKey = formatDate(transaction.date, transaction.time);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const allTags = Array.from(
    new Set(transactions.filter((t: Transaction) => t.tag).map((t: Transaction) => t.tag))
  ) as string[];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Logs</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowAddOrderModal(true);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 min-h-[44px]"
            >
              + order
            </button>
            <button
              onClick={() => {
                setEditingTransaction(null);
                setSelectedOrderForTransaction(null);
                setShowAddModal(true);
                setTransactionType("income");
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 min-h-[44px]"
            >
              + Income
            </button>
            <button
              onClick={() => {
                setEditingTransaction(null);
                setSelectedOrderForTransaction(null);
                setShowAddModal(true);
                setTransactionType("expense");
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 min-h-[44px]"
            >
              + Expense
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "all"
                ? "bg-green-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType("income")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "income"
                ? "bg-green-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Income
          </button>
          <button
            onClick={() => setFilterType("expense")}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
              filterType === "expense"
                ? "bg-red-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Expense
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              onClick={() => setFilterTag("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
                filterTag === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              All Sources
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[44px] ${
                  filterTag === tag
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No transactions found. Add your first transaction!
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([dateKey, dateTransactions]) => {
            const typedTransactions = dateTransactions as Transaction[];
            return (
            <div key={dateKey}>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{dateKey}</h3>
              <div className="space-y-2">
                {typedTransactions.map((transaction: Transaction) => {
                  const isIncome = transaction.type === "income";
                  // Use transaction tag as app name
                  const appName = transaction.tag;
                  
                  return (
                    <div
                      key={transaction._id}
                      className={`rounded-lg p-4 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                        isIncome 
                          ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {appName ? (
                          (() => {
                            const iconColor = getAppIconColor(appName);
                            const initials = getAppInitials(appName);
                            return (
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor.bg} ${iconColor.text}`}
                              >
                                <span className="text-xs font-bold">{initials}</span>
                              </div>
                            );
                          })()
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              isIncome 
                                ? "bg-green-100 dark:bg-green-900/30" 
                                : "bg-red-100 dark:bg-red-900/30"
                            }`}
                          >
                            <span className="text-xl">📊</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {appName && (
                              (() => {
                                const appColor = getAppTagColor(appName);
                                return (
                                  <span className={`text-xs px-2 py-1 rounded ${appColor.bg} ${appColor.text}`}>
                                    {appName}
                                  </span>
                                );
                              })()
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatTime(transaction.date, transaction.time)}
                            </span>
                          </div>
                          {transaction.notes ? (
                            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1 truncate">
                              {transaction.notes}
                            </div>
                          ) : null}
                          {isIncome && ((transaction.linkedOcrExports && transaction.linkedOcrExports.length > 0) || (transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0)) && (
                            <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                              {transaction.linkedDeliveryOrders?.map((order) => (
                                <div key={order.id} className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingOrderId(order.id);
                                    }}
                                    className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 hover:underline flex items-center gap-1 text-left"
                                  >
                                    📦 {order.restaurantName} - ${order.money.toFixed(2)} / {order.miles.toFixed(1)}mi {order.miles > 0 && `($${(order.money / order.miles).toFixed(2)}/mi)`}
                                  </button>
                                  {order.restaurantAddress ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleShareRestaurantAddress(order.restaurantAddress!);
                                      }}
                                      className="p-1 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                      title="Share Restaurant Address"
                                    >
                                      📤
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleShareRestaurant(order);
                                      }}
                                      className="p-1 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                      title="Search Restaurant Address"
                                    >
                                      🔍
                                    </button>
                                  )}
                                </div>
                              ))}
                              {transaction.linkedOcrExports?.map((customer) => (
                                <div key={customer.id} className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingCustomerAddress(customer.customerAddress);
                                      setEditingCustomerEntryId(customer.entryId || null);
                                    }}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-left"
                                  >
                                    👤 {customer.customerName} {customer.customerAddress}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleShareAddress(customer.customerAddress, customer.customerName);
                                    }}
                                    className="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    title="Share Address"
                                  >
                                    📤
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:ml-4">
                        <div
                          className={`text-lg font-bold ${
                            isIncome 
                              ? "text-green-600 dark:text-green-400" 
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </div>
                        <div className="flex items-center gap-2">
                        {isIncome && (
                          <>
                            <button
                              onClick={() => setLinkingCustomerTransactionId(transaction._id)}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                              title="Link Customer"
                            >
                              👤
                            </button>
                            <button
                              onClick={() => setLinkingOrderTransactionId(transaction._id)}
                              className="p-2 text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                              title="Link Order"
                            >
                              📦
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setEditingTransaction(transaction._id)}
                          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(transaction._id)}
                          className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Delete"
                        >
                          🗑️
                        </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
            <span className="hidden sm:inline">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of {pagination.total} transactions
            </span>
            <span className="sm:hidden">
              Page {page} of {pagination.totalPages}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                page === 1
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium ${
                      page === pageNum
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === pagination.totalPages}
              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                page === pagination.totalPages
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <AddOrderToTransactionModal
        isOpen={showAddOrderModal}
        onClose={() => setShowAddOrderModal(false)}
        onSelectOrder={(order) => {
          setSelectedOrderForTransaction(order);
          setShowAddOrderModal(false);
          setShowAddModal(true);
          setTransactionType("income");
        }}
      />

      {(showAddModal || editingTransaction) && (
        <AddTransactionModal
          isOpen={showAddModal || !!editingTransaction}
          onClose={() => {
            setShowAddModal(false);
            setEditingTransaction(null);
            setSelectedOrderForTransaction(null);
          }}
          type={editingTransaction ? (transactions.find((t: Transaction) => t._id === editingTransaction)?.type || "income") : transactionType}
          onSuccess={() => {
            setShowAddModal(false);
            setEditingTransaction(null);
            setSelectedOrderForTransaction(null);
          }}
          transactionId={editingTransaction || undefined}
          selectedOrder={selectedOrderForTransaction}
        />
      )}

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
          // Optionally refresh transactions if needed
        }}
      />

      <EditDeliveryOrderModal
        isOpen={editingOrderId !== null}
        onClose={() => setEditingOrderId(null)}
        orderId={editingOrderId}
        userId={session?.user?.id}
        onUpdate={() => {
          // Optionally refresh transactions if needed
        }}
      />

      <LinkCustomerModal
        isOpen={linkingCustomerTransactionId !== null}
        onClose={() => setLinkingCustomerTransactionId(null)}
        transactionId={linkingCustomerTransactionId}
        userId={session?.user?.id}
        onLink={() => {
          // Refresh transactions to show updated links
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          setLinkingCustomerTransactionId(null);
        }}
      />

      <LinkOrderModal
        isOpen={linkingOrderTransactionId !== null}
        onClose={() => setLinkingOrderTransactionId(null)}
        transactionId={linkingOrderTransactionId}
        userId={session?.user?.id}
        onLink={() => {
          // Refresh transactions to show updated links
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          setLinkingOrderTransactionId(null);
        }}
      />

      <ShareOrderModal
        isOpen={sharingOrder !== null}
        onClose={() => setSharingOrder(null)}
        restaurantName={sharingOrder?.restaurantName || ""}
        orderId={sharingOrder?.orderId}
        orderDetails={sharingOrder?.orderDetails}
        userLatitude={sharingOrder?.userLatitude}
        userLongitude={sharingOrder?.userLongitude}
        userAddress={sharingOrder?.userAddress}
        onAddressSaved={() => {
          // Refresh transactions to show updated restaurant address
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }}
      />
    </Layout>
  );
}


