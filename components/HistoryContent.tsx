"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { format, isToday, isYesterday } from "date-fns";
import { Sparkles, MapPin, User, Car, Package, Check, Utensils, Pencil, Trash2, ShoppingBag, ArrowUpCircle, ArrowDownCircle, XCircle, Search, X, Plus } from "lucide-react";
import { formatAddress } from "@/lib/address-formatter";
import AddTransactionModal from "@/components/AddTransactionModal";
import AddOrderToTransactionModal from "@/components/AddOrderToTransactionModal";
import EditCustomerEntriesModal from "@/components/EditCustomerEntriesModal";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import LinkOrderModal from "@/components/LinkOrderModal";
import ShareOrderModal from "@/components/ShareOrderModal";
import SearchAddressModal from "@/components/SearchAddressModal";
import DeliveryConfirmationModal from "@/components/DeliveryConfirmationModal";
import CreateTransactionWithOrderAndCustomerModal from "@/components/CreateTransactionWithOrderAndCustomerModal";
import { useTransactions, useDeleteTransaction, useUpdateTransaction, queryKeys } from "@/hooks/useQueries";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePrivacyMode } from "@/components/PrivacyModeProvider";

interface LinkedCustomer {
  id: string;
  customerName: string;
  customerAddress: string;
  appName?: string;
  entryId: string;
  lat?: number;
  lon?: number;
}

interface AdditionalRestaurant {
  name: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lon?: number;
  userLatitude?: number;
  userLongitude?: number;
  userAddress?: string;
}

interface LinkedOrder {
  id: string;
  restaurantName: string;
  restaurantAddress?: string;
  restaurantLat?: number;
  restaurantLon?: number;
  appName: string;
  miles: number;
  money: number;
  entryId: string;
  userLatitude?: number;
  userLongitude?: number;
  userAddress?: string;
  step?: string;
  active?: boolean;
  additionalRestaurants?: AdditionalRestaurant[];
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
  step?: string;
  active?: boolean;
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

/**
 * Formats step names for display
 */
const formatStepName = (step: string): string => {
  const stepNames: Record<string, string> = {
    CREATED: "Created",
    NAV_TO_RESTERAUNT: "Navigate to Restaurant",
    LINK_CUSTOMER: "Link Customer",
    NAV_TO_CUSTOMER: "Navigate to Customer",
    DELIVERING: "Delivering",
    DONE: "Done",
  };
  return stepNames[step] || step;
};

/**
 * Gets step icon
 */
const getStepIcon = (step: string) => {
  const stepIcons: Record<string, React.ReactNode> = {
    CREATED: <Sparkles className="w-3 h-3" />,
    NAV_TO_RESTERAUNT: <MapPin className="w-3 h-3" />,
    LINK_CUSTOMER: <User className="w-3 h-3" />,
    NAV_TO_CUSTOMER: <Car className="w-3 h-3" />,
    DELIVERING: <Package className="w-3 h-3" />,
    DONE: <Check className="w-3 h-3" />,
  };
  return stepIcons[step] || <span className="w-3 h-3">•</span>;
};

/**
 * Gets step color
 */
const getStepColor = (step: string): { bg: string; text: string; border: string } => {
  const stepColors: Record<string, { bg: string; text: string; border: string }> = {
    CREATED: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-700" },
    NAV_TO_RESTERAUNT: { bg: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-700" },
    LINK_CUSTOMER: { bg: "bg-cyan-50 dark:bg-cyan-900/20", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-700" },
    NAV_TO_CUSTOMER: { bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-700" },
    DELIVERING: { bg: "bg-yellow-50 dark:bg-yellow-900/20", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-200 dark:border-yellow-700" },
    DONE: { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-300", border: "border-green-200 dark:border-green-700" },
  };
  return stepColors[step] || { bg: "bg-gray-50 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", border: "border-gray-200 dark:border-gray-700" };
};


export default function HistoryPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { isPrivacyModeEnabled } = usePrivacyMode();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateAllModal, setShowCreateAllModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [page, setPage] = useState(1);
  const limit = 25;
  const [editingCustomerAddress, setEditingCustomerAddress] = useState<string | null>(null);
  const [editingCustomerEntryId, setEditingCustomerEntryId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [linkingCustomerTransactionId, setLinkingCustomerTransactionId] = useState<string | null>(null);
  const [linkingOrderTransactionId, setLinkingOrderTransactionId] = useState<string | null>(null);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [selectedOrderForTransaction, setSelectedOrderForTransaction] = useState<SelectedDeliveryOrder | null>(null);
  const [sharingOrder, setSharingOrder] = useState<{ orderId?: string; restaurantName: string; orderDetails?: { miles?: number; money?: number; milesToMoneyRatio?: number; appName?: string }; userLatitude?: number; userLongitude?: number; userAddress?: string } | null>(null);
  const [linkingRestaurantOrder, setLinkingRestaurantOrder] = useState<LinkedOrder | null>(null);
  const [linkingAdditionalRestaurant, setLinkingAdditionalRestaurant] = useState<{ orderId: string; restaurantIndex: number } | null>(null);
  const [navigatingRestaurantIndex, setNavigatingRestaurantIndex] = useState<Record<string, number>>({}); // transactionId -> restaurantIndex (-1 = main, 0+ = additional)
  const [deliveryConfirmation, setDeliveryConfirmation] = useState<{ transactionId: string; customerAddress: string; customerName?: string } | null>(null);
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false);
  const [showStreetViewForTransaction, setShowStreetViewForTransaction] = useState<string | null>(null);
  const [editingAdditionalRestaurant, setEditingAdditionalRestaurant] = useState<{ orderId: string; restaurantIndex: number; restaurant: AdditionalRestaurant } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  
  const { data, isLoading: loading } = useTransactions("all", "all", page, limit, searchQuery);
  // Fetch all transactions for date totals calculation
  const { data: dateTotalsData } = useQuery({
    queryKey: ["dateTotals"],
    queryFn: async () => {
      const res = await fetch("/api/transactions/date-totals");
      if (!res.ok) {
        throw new Error("Failed to fetch date totals");
      }
      return res.json();
    },
  });
  const deleteTransaction = useDeleteTransaction();
  const updateTransaction = useUpdateTransaction();
  
  // Define formatDate before using it
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
  
  let transactions = data?.transactions || [];
  const pagination = data?.pagination;
  
  // Get all transactions for date totals calculation
  const allTransactionsForTotals = dateTotalsData?.transactions || [];
  
  // Group all transactions by date for totals calculation using the same formatDate function
  const allTransactionsByDate = allTransactionsForTotals.reduce((acc: Record<string, { type: string; amount: number }[]>, transaction: { date: string; time: string; type: string; amount: number }) => {
    const dateKey = formatDate(transaction.date, transaction.time);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push({ type: transaction.type, amount: transaction.amount });
    return acc;
  }, {} as Record<string, { type: string; amount: number }[]>);

  // Calculate gross profit (income - expenses)
  const grossProfit = transactions.reduce((total: number, transaction: Transaction) => {
    if (transaction.type === "income") {
      return total + transaction.amount;
    } else {
      return total - transaction.amount;
    }
  }, 0);

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) {
      return;
    }
    deleteTransaction.mutate(id);
  };

  const handleMarkAsNotActive = (id: string) => {
    if (!confirm("Mark this transaction as not active?")) {
      return;
    }
    updateTransaction.mutate({ id, active: false });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };


  const handleShareAddress = async (address: string) => {
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

  const handleCreateTransactionFromOrder = async (order: SelectedDeliveryOrder) => {
    try {
      // Convert UTC processedAt to EST date/time (same logic as AddTransactionModal)
      const utcDate = new Date(order.processedAt);
      const utcTimestamp = utcDate.getTime();
      
      // EST is UTC-5, so subtract 5 hours in milliseconds
      const EST_OFFSET_MS = 5 * 60 * 60 * 1000;
      const estTimestamp = utcTimestamp - EST_OFFSET_MS;
      const estDate = new Date(estTimestamp);
      
      // Extract EST date components
      const estYear = estDate.getUTCFullYear();
      const estMonth = estDate.getUTCMonth();
      const estDay = estDate.getUTCDate();
      const estHour = estDate.getUTCHours();
      const estMinute = estDate.getUTCMinutes();
      
      // Format EST date as YYYY-MM-DD
      const formattedDate = `${estYear}-${String(estMonth + 1).padStart(2, '0')}-${String(estDay).padStart(2, '0')}`;
      
      // Use order's time if available, otherwise use EST time from processedAt
      let orderTime = order.time || "";
      if (!orderTime) {
        orderTime = `${String(estHour).padStart(2, '0')}:${String(estMinute).padStart(2, '0')}`;
      }

      // Create transaction
      const transactionRes = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: order.money,
          type: "income",
          date: formattedDate,
          time: orderTime,
          notes: "",
          tag: order.appName,
          isBill: false,
          step: "CREATED",
          active: true,
        }),
      });

      if (!transactionRes.ok) {
        const errorData = await transactionRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create transaction");
      }

      const transaction = await transactionRes.json();

      // Link the order to the transaction
      if (transaction._id && order.id) {
        const linkRes = await fetch("/api/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: transaction._id,
            deliveryOrderId: order.id,
            action: "link",
          }),
        });

        if (!linkRes.ok) {
          // Transaction was created but linking failed - log error but don't fail completely
          console.error("Failed to link order:", await linkRes.text());
        }
      }

      // Refresh transactions list
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryOrders"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["dateTotals"] });
    } catch (error) {
      console.error("Error creating transaction from order:", error);
      alert(error instanceof Error ? error.message : "Failed to create transaction");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 space-y-4">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setShowCreateAllModal(true);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 min-h-[44px] flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>Income</span>
          </button>
          <button
            onClick={() => {
              setEditingTransaction(null);
              setSelectedOrderForTransaction(null);
              setShowAddModal(true);
              setTransactionType("expense");
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 min-h-[44px] flex items-center gap-2"
          >
            <ArrowDownCircle className="w-5 h-5" />
            Expense
          </button>
          <button
            onClick={() => {
              setShowAddOrderModal(true);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 min-h-[44px] flex items-center gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            Order
          </button>
        </div>
        
        {/* Search Input */}
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by restaurant, customer, app, or amount..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Return") {
                  setSearchQuery(searchInput.trim());
                  setPage(1);
                }
              }}
              className="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Clear search"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setSearchQuery(searchInput.trim());
              setPage(1);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 min-h-[44px] flex items-center gap-2"
            title="Search"
          >
            <Search className="w-5 h-5" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {searchQuery.trim() ? (
              <>No transactions found matching &quot;{searchQuery}&quot;. Try a different search term.</>
            ) : (
              <>No transactions found. Add your first transaction!</>
            )}
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([dateKey, dateTransactions]) => {
            const typedTransactions = dateTransactions as Transaction[];
            // Calculate gross profit for this date group from ALL transactions for this date
            const allTransactionsForDate = allTransactionsByDate[dateKey] || [];
            const dateGrossProfit = allTransactionsForDate.reduce((total: number, transaction: { type: string; amount: number }) => {
              if (transaction.type === "income") {
                return total + transaction.amount;
              } else {
                return total - transaction.amount;
              }
            }, 0);
            return (
            <div key={dateKey}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{dateKey}</h3>
                <div className={`text-sm font-bold ${
                  dateGrossProfit >= 0 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
                }`}>
                  {formatCurrency(dateGrossProfit)}
                </div>
              </div>
              <div className="space-y-2">
                {typedTransactions.map((transaction: Transaction) => {
                  const isIncome = transaction.type === "income";
                  // Use transaction tag as app name
                  const appName = transaction.tag;
                  
                  return (
                    <div
                      key={transaction._id}
                      className={`rounded-lg p-4 pb-4 mb-2 border flex flex-col gap-3 overflow-visible ${
                        isIncome 
                          ? transaction.active === true && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0
                            ? "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 shadow-md"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
                      }`}
                    >
                      {/* App Name, Miles/Money Ratio, and Price at Very Top */}
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {appName && (
                            (() => {
                              const appColor = getAppTagColor(appName);
                              return (
                                <span className={`text-sm px-2 py-1 rounded flex-shrink-0 ${appColor.bg} ${appColor.text}`}>
                                  {appName}
                                </span>
                              );
                            })()
                          )}
                          {isIncome && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0 && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0 flex flex-col">
                              {(() => {
                                const offerMiles = transaction.linkedDeliveryOrders[0].miles;
                                const roundedOfferMiles = Math.round(offerMiles * 10) / 10;
                                
                                return (
                                  <div>
                                    {roundedOfferMiles.toFixed(1)}mi
                                    {offerMiles > 0 && (
                                      <span className="ml-1">
                                        (${(transaction.linkedDeliveryOrders[0].money / offerMiles).toFixed(2)}/mi)
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        <div
                          className={`text-lg font-bold flex-shrink-0 ${
                            isIncome 
                              ? "text-green-600 dark:text-green-400" 
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </div>
                      </div>
                      
                      {/* All Addresses Block */}
                      <div className="mb-1">
                        {isIncome && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {transaction.linkedDeliveryOrders.map((order) => (
                              <div key={order.id} className="flex flex-col gap-1">
                                {/* User Location (where order was accepted) */}
                                {order.userAddress && (
                                  <div className="text-sm text-gray-900 dark:text-white flex items-center gap-1 text-left break-words">
                                    <span className="flex-shrink-0"><MapPin className="w-4 h-4" /></span>
                                    <span className="truncate">
                                      Accepted
                                      <span className="mx-1 text-gray-400 dark:text-gray-500">•</span>
                                      <span>{isPrivacyModeEnabled ? "**** Address Redacted ****" : formatAddress(order.userAddress)}</span>
                                    </span>
                                  </div>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingOrderId(order.id);
                                  }}
                                  className="text-sm text-gray-900 dark:text-white hover:underline flex items-center gap-1 text-left break-words"
                                >
                                  <span className="flex-shrink-0"><Utensils className="w-4 h-4" /></span>
                                  <span className="truncate">
                                    {order.restaurantName}
                                    {order.restaurantAddress && (
                                      <>
                                        <span className="mx-1 text-gray-400 dark:text-gray-500">•</span>
                                        <span>{isPrivacyModeEnabled ? "**** Address Redacted ****" : formatAddress(order.restaurantAddress)}</span>
                                      </>
                                    )}
                                  </span>
                                </button>
                                {/* Additional restaurants */}
                                {order.additionalRestaurants && Array.isArray(order.additionalRestaurants) && order.additionalRestaurants.length > 0 && (
                                  <div className="flex flex-col gap-1 mt-1">
                                    {order.additionalRestaurants.map((restaurant, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => {
                                          setEditingAdditionalRestaurant({
                                            orderId: order.id,
                                            restaurantIndex: idx,
                                            restaurant: restaurant,
                                          });
                                        }}
                                        className="text-sm text-gray-700 dark:text-gray-300 hover:underline flex items-center gap-1 text-left break-words w-full"
                                      >
                                        <span className="flex-shrink-0"><Utensils className="w-3 h-3" /></span>
                                        <span className="break-words">
                                          {restaurant.name}
                                          {restaurant.address && (
                                            <>
                                              <span className="mx-1 text-gray-400 dark:text-gray-500">•</span>
                                              <span>{isPrivacyModeEnabled ? "**** Address Redacted ****" : formatAddress(restaurant.address)}</span>
                                            </>
                                          )}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Customer Addresses */}
                        {isIncome && transaction.linkedOcrExports && transaction.linkedOcrExports.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {transaction.linkedOcrExports.map((customer, customerIdx) => (
                              <div key={customer.id}>
                                <button
                                  onClick={() => {
                                    setEditingCustomerAddress(customer.customerAddress);
                                    setEditingCustomerEntryId(customer.entryId || null);
                                  }}
                                  className="text-sm text-gray-900 dark:text-white hover:underline flex items-center gap-1 text-left w-full min-w-0 overflow-hidden"
                                >
                                  <span className="flex-shrink-0"><User className="w-4 h-4" /></span>
                                  <span className="truncate min-w-0">
                                    {customer.customerName}
                                    {customer.customerAddress && (
                                      <>
                                        <span className="mx-1 text-gray-400 dark:text-gray-500">•</span>
                                        <span>{isPrivacyModeEnabled ? "**** Address Redacted ****" : formatAddress(customer.customerAddress)}</span>
                                      </>
                                    )}
                                  </span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {transaction.notes && (
                          <div className="text-sm text-gray-600 dark:text-gray-300 break-words mt-1">
                            {transaction.notes}
                          </div>
                        )}
                      </div>
                      
                      {/* Edit/Delete Buttons */}
                      <div className="flex items-center gap-2 justify-end pt-2">
                        <button
                          onClick={() => setEditingTransaction(transaction._id)}
                          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                          title="Edit"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        {transaction.active && (
                          <button
                            onClick={() => handleMarkAsNotActive(transaction._id)}
                            className="p-2 text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50"
                            title="Mark as not active"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(transaction._id)}
                          className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
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
          setShowAddOrderModal(false);
          handleCreateTransactionFromOrder(order as SelectedDeliveryOrder);
        }}
      />

      <CreateTransactionWithOrderAndCustomerModal
        isOpen={showCreateAllModal}
        onClose={() => setShowCreateAllModal(false)}
        onSuccess={() => {
          setShowCreateAllModal(false);
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
          // Refresh transactions to get updated customer data
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }}
      />

      <EditDeliveryOrderModal
        isOpen={editingOrderId !== null}
        onClose={() => setEditingOrderId(null)}
        orderId={editingOrderId}
        userId={session?.user?.id}
        onUpdate={() => {
          // Refresh transactions to get updated order data
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }}
      />

      <LinkCustomerModal
        isOpen={linkingCustomerTransactionId !== null}
        onClose={() => {
          setLinkingCustomerTransactionId(null);
        }}
        transactionId={linkingCustomerTransactionId}
        userId={session?.user?.id}
        onLink={async () => {
          if (!linkingCustomerTransactionId) return;
          
          // Refresh transactions to get updated customer data
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
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

      {sharingOrder && (() => {
        // Find the transaction that contains this order
        const transaction = transactions.find((t: Transaction) => 
          t.linkedDeliveryOrders?.some((o) => o.id === sharingOrder.orderId)
        );
        return transaction ? (
          <ShareOrderModal
            isOpen={true}
            onClose={() => setSharingOrder(null)}
            restaurantName={sharingOrder.restaurantName}
            orderId={sharingOrder.orderId}
            transactionId={transaction._id}
            orderDetails={sharingOrder.orderDetails}
            userLatitude={sharingOrder.userLatitude}
            userLongitude={sharingOrder.userLongitude}
            userAddress={sharingOrder.userAddress}
            onAddressSaved={() => {
              // Refresh transactions to show updated restaurant address and step
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
              setSharingOrder(null);
            }}
          />
        ) : null;
      })()}

      {linkingRestaurantOrder && (() => {
        // Find the transaction that contains this order
        const transaction = transactions.find((t: Transaction) => 
          t.linkedDeliveryOrders?.some((o) => o.id === linkingRestaurantOrder.id)
        );
        return transaction ? (
          <ShareOrderModal
            isOpen={true}
            onClose={() => setLinkingRestaurantOrder(null)}
            restaurantName={linkingRestaurantOrder.restaurantName}
            orderId={linkingRestaurantOrder.id}
            transactionId={transaction._id}
            orderDetails={{
              miles: linkingRestaurantOrder.miles,
              money: linkingRestaurantOrder.money,
              milesToMoneyRatio: linkingRestaurantOrder.miles > 0 ? linkingRestaurantOrder.money / linkingRestaurantOrder.miles : 0,
              appName: linkingRestaurantOrder.appName,
            }}
            userLatitude={linkingRestaurantOrder.userLatitude}
            userLongitude={linkingRestaurantOrder.userLongitude}
            userAddress={linkingRestaurantOrder.userAddress}
            shouldUpdateStep={true}
            onAddressSaved={() => {
              // Refresh transactions to show updated restaurant address and step
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
              setLinkingRestaurantOrder(null);
            }}
          />
        ) : null;
      })()}

      {linkingAdditionalRestaurant && (() => {
        // Find the transaction and order that contains this additional restaurant
        const transaction = transactions.find((t: Transaction) => 
          t.linkedDeliveryOrders?.some((o: LinkedOrder) => o.id === linkingAdditionalRestaurant.orderId)
        );
        if (!transaction) return null;
        
        const order = transaction.linkedDeliveryOrders?.find((o: LinkedOrder) => o.id === linkingAdditionalRestaurant.orderId);
        if (!order || !order.additionalRestaurants) return null;
        
        const additionalRestaurant = order.additionalRestaurants[linkingAdditionalRestaurant.restaurantIndex];
        if (!additionalRestaurant) return null;
        
        return (
          <ShareOrderModal
            isOpen={true}
            onClose={() => setLinkingAdditionalRestaurant(null)}
            restaurantName={additionalRestaurant.name}
            orderId={linkingAdditionalRestaurant.orderId}
            transactionId={transaction._id}
            orderDetails={{
              miles: order.miles,
              money: order.money,
              milesToMoneyRatio: order.miles > 0 ? order.money / order.miles : 0,
              appName: order.appName,
            }}
            userLatitude={additionalRestaurant.userLatitude || order.userLatitude}
            userLongitude={additionalRestaurant.userLongitude || order.userLongitude}
            userAddress={additionalRestaurant.userAddress || order.userAddress}
            shouldUpdateStep={false}
            skipSave={true}
            onAddressSaved={async (address?: string, placeId?: string, lat?: number, lon?: number, restaurantName?: string) => {
              try {
                // Update the specific additional restaurant
                const response = await fetch("/api/delivery-orders", {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    id: linkingAdditionalRestaurant.orderId,
                    updateAdditionalRestaurant: {
                      index: linkingAdditionalRestaurant.restaurantIndex,
                      data: {
                        address: address,
                        placeId: placeId,
                        lat: lat,
                        lon: lon,
                        ...(restaurantName && { name: restaurantName }),
                      },
                    },
                  }),
                });

                if (!response.ok) {
                  console.error("Failed to save additional restaurant address");
                  return;
                }

                // Get the updated order from the response
                const responseData = await response.json();
                const updatedAdditionalRestaurants = responseData.order?.additionalRestaurants || [];
                
                // Refresh transactions to show updated restaurant address
                await queryClient.invalidateQueries({ queryKey: ["transactions"] });
                
                // Find the next additional restaurant to link
                const nextUnlinkedIndex = updatedAdditionalRestaurants.findIndex(
                  (restaurant: AdditionalRestaurant, index: number) => 
                    index > linkingAdditionalRestaurant.restaurantIndex
                );
                
                if (nextUnlinkedIndex !== -1) {
                  // Show next additional restaurant - keep modal open by updating state
                  // The modal will re-render with the new restaurant index
                  setLinkingAdditionalRestaurant({
                    orderId: linkingAdditionalRestaurant.orderId,
                    restaurantIndex: nextUnlinkedIndex,
                  });
                } else {
                  // All additional restaurants are linked, close modal
                  setLinkingAdditionalRestaurant(null);
                }
              } catch (err) {
                console.error("Error saving additional restaurant address:", err);
              }
            }}
          />
        );
      })()}

      <DeliveryConfirmationModal
        isOpen={deliveryConfirmation !== null}
        onClose={() => setDeliveryConfirmation(null)}
        customerAddress={deliveryConfirmation?.customerAddress || ""}
        customerName={deliveryConfirmation?.customerName}
        onMarkDelivered={async (notes) => {
          if (!deliveryConfirmation) return;
          
          try {
            setIsMarkingDelivered(true);
            await fetch(`/api/transactions/${deliveryConfirmation.transactionId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ step: "DONE", active: false }),
            });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            setDeliveryConfirmation(null);
          } catch (err) {
            console.error("Error marking as delivered:", err);
            alert("Failed to mark as delivered");
          } finally {
            setIsMarkingDelivered(false);
          }
        }}
        isMarking={isMarkingDelivered}
      />

      {editingAdditionalRestaurant && (() => {
        // Find the order to get its details
        const order = transactions
          .flatMap((t: Transaction) => t.linkedDeliveryOrders || [])
          .find((o: LinkedOrder) => o.id === editingAdditionalRestaurant.orderId);
        
        return order ? (
          <ShareOrderModal
            isOpen={true}
            onClose={() => setEditingAdditionalRestaurant(null)}
            restaurantName={editingAdditionalRestaurant.restaurant.name}
            orderId={editingAdditionalRestaurant.orderId}
            orderDetails={{
              miles: order.miles,
              money: order.money,
              milesToMoneyRatio: order.miles > 0 ? order.money / order.miles : 0,
              appName: order.appName,
            }}
            userLatitude={editingAdditionalRestaurant.restaurant.userLatitude}
            userLongitude={editingAdditionalRestaurant.restaurant.userLongitude}
            userAddress={editingAdditionalRestaurant.restaurant.userAddress}
            skipSave={true}
            onAddressSaved={async (address?: string, placeId?: string, lat?: number, lon?: number, restaurantName?: string) => {
              if (!editingAdditionalRestaurant) return;
              
              try {
                // Fetch the current order to get its additionalRestaurants array
                const orderResponse = await fetch(`/api/delivery-orders?userId=${session?.user?.id}&id=${editingAdditionalRestaurant.orderId}`);
                if (!orderResponse.ok) {
                  throw new Error("Failed to fetch order");
                }
                const orderData = await orderResponse.json();
                const currentOrder = orderData.order;
                
                if (!currentOrder || !currentOrder.additionalRestaurants) {
                  throw new Error("Order or additional restaurants not found");
                }
                
                // Update the specific additional restaurant
                const updatedRestaurants = [...currentOrder.additionalRestaurants];
                updatedRestaurants[editingAdditionalRestaurant.restaurantIndex] = {
                  ...updatedRestaurants[editingAdditionalRestaurant.restaurantIndex],
                  name: restaurantName || updatedRestaurants[editingAdditionalRestaurant.restaurantIndex].name,
                  address: address || updatedRestaurants[editingAdditionalRestaurant.restaurantIndex].address,
                  placeId: placeId || updatedRestaurants[editingAdditionalRestaurant.restaurantIndex].placeId,
                  lat: lat !== undefined ? lat : updatedRestaurants[editingAdditionalRestaurant.restaurantIndex].lat,
                  lon: lon !== undefined ? lon : updatedRestaurants[editingAdditionalRestaurant.restaurantIndex].lon,
                };
                
                // Save the updated additional restaurants array
                const saveResponse = await fetch("/api/delivery-orders", {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    id: editingAdditionalRestaurant.orderId,
                    updateAdditionalRestaurant: {
                      index: editingAdditionalRestaurant.restaurantIndex,
                      data: updatedRestaurants[editingAdditionalRestaurant.restaurantIndex],
                    },
                  }),
                });
                
                if (!saveResponse.ok) {
                  const errorData = await saveResponse.json();
                  throw new Error(errorData.error || "Failed to update restaurant");
                }
                
                // Refresh transactions to show updated data
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                setEditingAdditionalRestaurant(null);
              } catch (err) {
                console.error("Error updating additional restaurant:", err);
                alert(err instanceof Error ? err.message : "Failed to update restaurant");
              }
            }}
          />
        ) : null;
      })()}
    </>
  );
}


