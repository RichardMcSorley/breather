"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { format, isToday, isYesterday } from "date-fns";
import { Sparkles, MapPin, User, Car, Package, Check, Utensils, Pencil, Trash2, ShoppingBag, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { formatAddress } from "@/lib/address-formatter";
import { getStreetViewUrl } from "@/lib/streetview-helper";
import Layout from "@/components/Layout";
import AddTransactionModal from "@/components/AddTransactionModal";
import AddOrderToTransactionModal from "@/components/AddOrderToTransactionModal";
import EditCustomerEntriesModal from "@/components/EditCustomerEntriesModal";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import LinkOrderModal from "@/components/LinkOrderModal";
import ShareOrderModal from "@/components/ShareOrderModal";
import { useTransactions, useDeleteTransaction, queryKeys } from "@/hooks/useQueries";
import { useQueryClient, useQuery } from "@tanstack/react-query";

interface LinkedCustomer {
  id: string;
  customerName: string;
  customerAddress: string;
  appName?: string;
  entryId: string;
  lat?: number;
  lon?: number;
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
  step?: string;
  active?: boolean;
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
  stepLog?: Array<{
    fromStep?: string | null;
    toStep: string;
    time: Date | string;
  }>;
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

/**
 * CompletionLog component to display step transitions
 */
interface CompletionLogProps {
  stepLog?: Array<{
    fromStep?: string | null;
    toStep: string;
    time: Date | string;
  }>;
  currentStep?: string;
  actionButton?: React.ReactNode;
  actionButtonColor?: string;
  transactionDate?: string;
  transactionTime?: string;
  transactionId?: string;
  linkedDeliveryOrders?: LinkedOrder[];
  linkedOcrExports?: LinkedCustomer[];
  onStageClick?: (step: string) => void;
  showStreetView?: boolean;
}

const CompletionLog = ({ stepLog, currentStep, actionButton, actionButtonColor, transactionDate, transactionTime, transactionId, linkedDeliveryOrders, linkedOcrExports, onStageClick, showStreetView }: CompletionLogProps) => {
  if (!stepLog || stepLog.length === 0) {
    return null;
  }

  // Get customer address for Street View if available
  const customerAddress = linkedOcrExports && linkedOcrExports.length > 0 ? linkedOcrExports[0].customerAddress : null;
  const customerLat = linkedOcrExports && linkedOcrExports.length > 0 ? linkedOcrExports[0].lat : undefined;
  const customerLon = linkedOcrExports && linkedOcrExports.length > 0 ? linkedOcrExports[0].lon : undefined;
  const streetViewUrl = showStreetView && (customerAddress || (customerLat !== undefined && customerLon !== undefined))
    ? getStreetViewUrl(customerAddress || undefined, customerLat, customerLon, 600, 300)
    : null;

  // Get button color classes based on step
  const getButtonColorClasses = (step?: string): string => {
    const colorMap: Record<string, string> = {
      CREATED: "bg-purple-600 border-purple-600 hover:bg-purple-700",
      NAV_TO_RESTERAUNT: "bg-purple-600 border-purple-600 hover:bg-purple-700",
      LINK_CUSTOMER: "bg-blue-600 border-blue-600 hover:bg-blue-700",
      NAV_TO_CUSTOMER: "bg-blue-600 border-blue-600 hover:bg-blue-700",
      DELIVERING: "bg-green-600 border-green-600 hover:bg-green-700",
    };
    return colorMap[step || ""] || "bg-purple-600 border-purple-600 hover:bg-purple-700";
  };

  const buttonClasses = getButtonColorClasses(actionButtonColor);

  const formatDuration = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      const parts: string[] = [`${hours}h`];
      if (remainingMinutes > 0) {
        parts.push(`${remainingMinutes}m`);
      }
      if (remainingSeconds > 0 && remainingMinutes === 0) {
        parts.push(`${remainingSeconds}s`);
      }
      return parts.join(" ");
    }
    
    if (minutes > 0) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    return `${seconds}s`;
  };

  const getStepColorClasses = (step: string): { bg: string; border: string } => {
    // Match button colors: gray-500 for CREATED and DONE, purple-600 for NAV_TO_RESTERAUNT, blue-600 for LINK_CUSTOMER/NAV_TO_CUSTOMER, green-600 for DELIVERING
    const stepColors: Record<string, { bg: string; border: string }> = {
      CREATED: { bg: "bg-gray-500", border: "border-gray-500" },
      NAV_TO_RESTERAUNT: { bg: "bg-purple-600", border: "border-purple-600" },
      LINK_CUSTOMER: { bg: "bg-blue-600", border: "border-blue-600" },
      NAV_TO_CUSTOMER: { bg: "bg-blue-600", border: "border-blue-600" },
      DELIVERING: { bg: "bg-green-600", border: "border-green-600" },
      DONE: { bg: "bg-gray-500", border: "border-gray-500" },
    };
    return stepColors[step] || { bg: "bg-gray-500", border: "border-gray-500" };
  };

  const getGradientColors = (fromStep: string, toStep: string): string => {
    // Map step colors to match button colors: purple-600, blue-600, green-600
    // Use explicit gradient classes that Tailwind can recognize
    const gradientMap: Record<string, string> = {
      "CREATED-LINK_RESTAURANT": "from-gray-500 to-purple-600",
      "CREATED-NAV_TO_RESTERAUNT": "from-gray-500 to-purple-600",
      "NAV_TO_RESTERAUNT-LINK_CUSTOMER": "from-purple-600 to-blue-600",
      "LINK_CUSTOMER-NAV_TO_CUSTOMER": "from-blue-600 to-blue-600",
      "NAV_TO_CUSTOMER-DELIVERING": "from-blue-600 to-green-600",
      "DELIVERING-DONE": "from-green-600 to-gray-500",
      // Fallback combinations
      // "CREATED-LINK_CUSTOMER": "from-purple-600 to-blue-600",
      // "CREATED-NAV_TO_CUSTOMER": "from-purple-600 to-blue-600",
      // "CREATED-DELIVERING": "from-purple-600 to-green-600",
      // "CREATED-DONE": "from-purple-600 to-green-600",
      // "NAV_TO_RESTERAUNT-NAV_TO_CUSTOMER": "from-purple-600 to-blue-600",
      // "NAV_TO_RESTERAUNT-DELIVERING": "from-purple-600 to-green-600",
      // "NAV_TO_RESTERAUNT-DONE": "from-purple-600 to-green-600",
      // "LINK_CUSTOMER-DELIVERING": "from-blue-600 to-green-600",
      // "LINK_CUSTOMER-DONE": "from-blue-600 to-green-600",
      // "NAV_TO_CUSTOMER-DONE": "from-blue-600 to-green-600",
    };
    
    const key = `${fromStep}-${toStep}`;
    return gradientMap[key] || "from-gray-500 to-gray-500";
  };

  // Calculate total completion time from first stepLog entry to last stepLog entry
  let totalCompletionTime = "";
  if (stepLog.length > 0) {
    try {
      // Use the first step log entry as the starting point
      const firstLog = stepLog[0];
      const firstTime = typeof firstLog.time === "string" ? new Date(firstLog.time) : firstLog.time;
      const firstTimeMs = firstTime instanceof Date ? firstTime.getTime() : new Date(firstTime).getTime();
      
      // Use the last step log entry as the end point
      const lastLog = stepLog[stepLog.length - 1];
      const lastTime = typeof lastLog.time === "string" ? new Date(lastLog.time) : lastLog.time;
      const lastTimeMs = lastTime instanceof Date ? lastTime.getTime() : new Date(lastTime).getTime();
      
      if (!isNaN(firstTimeMs) && !isNaN(lastTimeMs)) {
        const totalTime = lastTimeMs - firstTimeMs;
        totalCompletionTime = formatDuration(Math.max(0, totalTime));
      }
    } catch (error) {
      // Ignore date parsing errors
    }
  }

  // Format transaction time for display
  let formattedTransactionTime = "";
  if (transactionDate && transactionTime) {
    try {
      const transactionDateObj = buildLocalDateFromParts(transactionDate, transactionTime);
      formattedTransactionTime = format(transactionDateObj, "h:mm a");
    } catch (error) {
      // Ignore date parsing errors
    }
  }

  // Format end time from last step log entry
  let formattedEndTime = "";
  if (stepLog.length > 0) {
    try {
      const lastLog = stepLog[stepLog.length - 1];
      const endTime = typeof lastLog.time === "string" ? new Date(lastLog.time) : lastLog.time;
      if (endTime instanceof Date && !isNaN(endTime.getTime())) {
        formattedEndTime = format(endTime, "h:mm a");
      }
    } catch (error) {
      // Ignore date parsing errors
    }
  }

  return (
    <div className="flex flex-col w-full pb-1">
      {/* Total completion time label */}
      {totalCompletionTime && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
          {formattedTransactionTime && (
            <span>{formattedTransactionTime}</span>
          )}
          <span>Completed in {totalCompletionTime}</span>
          {formattedEndTime && (
            <span>{formattedEndTime}</span>
          )}
        </div>
      )}
      {/* Street View Image */}
      {streetViewUrl && (
        <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <img
            src={streetViewUrl}
            alt={`Street view of ${customerAddress || 'customer address'}`}
            className="w-full h-auto"
            onError={(e) => {
              // Hide image if it fails to load (e.g., no Street View available or API key missing)
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="flex items-center w-full justify-between">
      {stepLog.map((log, index) => {
          const stepColors = getStepColorClasses(log.toStep);
          const isLast = index === stepLog.length - 1;
          const isCurrentStep = log.toStep === currentStep;
          
          // Calculate time difference for the line AFTER this step
          // The line shows the time it took to get from this step to the next step
          let timeDiffText = "0s";
          if (!isLast) {
            try {
              const nextLog = stepLog[index + 1];
              const currentTime = typeof log.time === "string" ? new Date(log.time) : log.time;
              const nextTime = typeof nextLog.time === "string" 
                ? new Date(nextLog.time) 
                : nextLog.time;
              
              const currentTimeMs = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime();
              const nextTimeMs = nextTime instanceof Date ? nextTime.getTime() : new Date(nextTime).getTime();
              
              if (!isNaN(currentTimeMs) && !isNaN(nextTimeMs)) {
                const timeDiff = nextTimeMs - currentTimeMs;
                timeDiffText = formatDuration(Math.max(0, timeDiff));
              }
            } catch (error) {
              // Ignore date parsing errors, keep "0s"
            }
          }
          
          // Get gradient for the line segment (from current step to next step)
          // If there's an action button and this is the last step, gradient should go to purple (action button color)
          const nextStep = !isLast ? stepLog[index + 1].toStep : (actionButton ? "ACTION" : log.toStep);
          const gradientClass = actionButton && isLast 
            ? getGradientColors(log.toStep, "NAV_TO_RESTERAUNT") // Use purple gradient for action button
            : getGradientColors(log.toStep, nextStep);
          
          return (
            <div key={index} className={`flex items-center ${isLast && !actionButton ? 'flex-shrink-0' : 'flex-1'}`}>
              {/* Step badge */}
              <div className="flex flex-col items-center flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onStageClick) {
                      onStageClick(log.toStep);
                    }
                  }}
                  disabled={!onStageClick}
                  className={`w-6 h-6 rounded-full ${stepColors.bg} border ${stepColors.border} flex items-center justify-center text-white text-xs transition-all ${
                    isCurrentStep ? "ring-1 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ring-gray-400 dark:ring-gray-500" : ""
                  } ${
                    onStageClick 
                      ? "cursor-pointer hover:scale-110 hover:shadow-md active:scale-95" 
                      : "cursor-default"
                  }`}
                  title={onStageClick ? `Share ${formatStepName(log.toStep)} address` : undefined}
                >
                  {getStepIcon(log.toStep)}
                </button>
              </div>
              
              {/* Connecting line with time above */}
              {(!isLast || actionButton) && (
                <div className="relative flex items-center flex-1 mx-1 min-h-[2px]">
                  {/* Time duration above line */}
                  {!isLast && (
                    <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap z-10">
                      {timeDiffText}
                    </div>
                  )}
                  {/* Gradient line */}
                  <div className={`h-[2px] w-full bg-gradient-to-r ${gradientClass} flex-1`} />
                </div>
              )}
            </div>
          );
        })}
      
      {/* Action button as next step in timeline */}
      {actionButton && (
        <div className="flex items-center flex-shrink-0">
          <div className="flex flex-col items-center">
            <div className={`rounded-full ${buttonClasses} flex items-center justify-center text-white text-sm font-medium transition-colors min-h-[44px] min-w-[44px] whitespace-nowrap relative overflow-hidden`}>
              <div className="absolute inset-0">
                {actionButton}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default function HistoryPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
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
  const [showStreetViewForTransaction, setShowStreetViewForTransaction] = useState<string | null>(null);
  
  const { data, isLoading: loading } = useTransactions("all", "all", page, limit);
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
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setEditingTransaction(null);
              setSelectedOrderForTransaction(null);
              setShowAddModal(true);
              setTransactionType("income");
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 min-h-[44px] flex items-center gap-2"
          >
            <ArrowUpCircle className="w-5 h-5" />
            Income
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
      </div>

      <div className="space-y-6">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No transactions found. Add your first transaction!
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
                            <div className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
                              {transaction.linkedDeliveryOrders[0].miles.toFixed(1)}mi
                              {transaction.linkedDeliveryOrders[0].miles > 0 && (
                                <span className="ml-1">
                                  (${(transaction.linkedDeliveryOrders[0].money / transaction.linkedDeliveryOrders[0].miles).toFixed(2)}/mi)
                                </span>
                              )}
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
                      
                      {/* Completion Log */}
                      {transaction.stepLog && transaction.stepLog.length > 0 && (
                        <div className="mb-2">
                          <CompletionLog 
                            stepLog={transaction.stepLog} 
                            currentStep={transaction.step}
                            actionButtonColor={transaction.step}
                            transactionDate={transaction.date}
                            transactionTime={transaction.time}
                            transactionId={transaction._id}
                            linkedDeliveryOrders={transaction.linkedDeliveryOrders}
                            linkedOcrExports={transaction.linkedOcrExports}
                            showStreetView={showStreetViewForTransaction === transaction._id && (transaction.step === "NAV_TO_CUSTOMER" || transaction.step === "DELIVERING")}
                            onStageClick={async (step: string) => {
                              let addressToShare: string | null = null;
                              
                              // Determine which address to share based on the stage
                              if (step === "NAV_TO_RESTERAUNT" && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0) {
                                const restaurantAddress = transaction.linkedDeliveryOrders[0].restaurantAddress;
                                if (restaurantAddress) {
                                  addressToShare = formatAddress(restaurantAddress);
                                }
                              } else if (step === "NAV_TO_CUSTOMER" && transaction.linkedOcrExports && transaction.linkedOcrExports.length > 0) {
                                const customerAddress = transaction.linkedOcrExports[0].customerAddress;
                                if (customerAddress) {
                                  addressToShare = formatAddress(customerAddress);
                                }
                              }
                              
                              // Open share sheet if we have an address
                              if (addressToShare) {
                                if (navigator.share) {
                                  try {
                                    await navigator.share({ text: addressToShare });
                                  } catch (err) {
                                    // User cancelled or error occurred - silently fail
                                    console.log("Share cancelled or failed:", err);
                                  }
                                } else {
                                  // Fallback: copy to clipboard
                                  try {
                                    await navigator.clipboard.writeText(addressToShare);
                                    alert("Address copied to clipboard");
                                  } catch (err) {
                                    console.error("Failed to copy address:", err);
                                  }
                                }
                              }
                            }}
                            actionButton={
                              isIncome && transaction.active === true && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0 ? (
                                transaction.step === "CREATED" ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLinkingRestaurantOrder(transaction.linkedDeliveryOrders![0]);
                                    }}
                                    className="absolute inset-0 w-full h-full flex items-center justify-center text-sm font-medium px-4 py-2"
                                  >
                                    Link
                                  </button>
                                ) : transaction.step === "NAV_TO_RESTERAUNT" ? (
                                  (() => {
                                    const order = transaction.linkedDeliveryOrders![0];
                                    const restaurantAddress = order.restaurantAddress;
                                    if (restaurantAddress) {
                                      const formattedAddress = formatAddress(restaurantAddress);
                                      return (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (navigator.share) {
                                              try {
                                                await navigator.share({ text: formattedAddress });
                                                await fetch(`/api/transactions/${transaction._id}`, {
                                                  method: "PUT",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ step: "LINK_CUSTOMER" }),
                                                });
                                                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                              } catch (err) {
                                                console.log("Share cancelled or failed:", err);
                                              }
                                            } else {
                                              try {
                                                await navigator.clipboard.writeText(formattedAddress);
                                                alert("Address copied to clipboard");
                                                await fetch(`/api/transactions/${transaction._id}`, {
                                                  method: "PUT",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ step: "LINK_CUSTOMER" }),
                                                });
                                                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                              } catch (err) {
                                                console.error("Failed to copy address:", err);
                                              }
                                            }
                                          }}
                                          className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                        >
                                          Nav
                                        </button>
                                      );
                                    } else {
                                      return (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                              await fetch(`/api/transactions/${transaction._id}`, {
                                                method: "PUT",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ step: "LINK_CUSTOMER" }),
                                              });
                                              queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                            } catch (err) {
                                              console.error("Error skipping step:", err);
                                              alert("Failed to skip step");
                                            }
                                          }}
                                          className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                        >
                                          Skip
                                        </button>
                                      );
                                    }
                                  })()
                                ) : transaction.step === "LINK_CUSTOMER" ? (
                                  (() => {
                                    // If customer is already linked, allow skipping to next step
                                    if (transaction.linkedOcrExports && transaction.linkedOcrExports.length > 0) {
                                      return (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                              await fetch(`/api/transactions/${transaction._id}`, {
                                                method: "PUT",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ step: "NAV_TO_CUSTOMER" }),
                                              });
                                              queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                            } catch (err) {
                                              console.error("Error transitioning step:", err);
                                              alert("Failed to transition step");
                                            }
                                          }}
                                          className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                        >
                                          Skip
                                        </button>
                                      );
                                    }
                                    // Otherwise, show link button
                                    return (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setLinkingCustomerTransactionId(transaction._id);
                                        }}
                                        className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                      >
                                        Link
                                      </button>
                                    );
                                  })()
                                ) : transaction.step === "NAV_TO_CUSTOMER" && transaction.linkedOcrExports && transaction.linkedOcrExports.length > 0 ? (
                                  (() => {
                                    const customer = transaction.linkedOcrExports![0];
                                    const customerAddress = customer.customerAddress;
                                    if (customerAddress) {
                                      const formattedAddress = formatAddress(customerAddress);
                                      return (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            // Show Street View when Nav is clicked
                                            setShowStreetViewForTransaction(transaction._id);
                                            if (navigator.share) {
                                              try {
                                                await navigator.share({ text: formattedAddress });
                                                await fetch(`/api/transactions/${transaction._id}`, {
                                                  method: "PUT",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ step: "DELIVERING" }),
                                                });
                                                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                              } catch (err) {
                                                console.log("Share cancelled or failed:", err);
                                              }
                                            } else {
                                              try {
                                                await navigator.clipboard.writeText(formattedAddress);
                                                alert("Address copied to clipboard");
                                                await fetch(`/api/transactions/${transaction._id}`, {
                                                  method: "PUT",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ step: "DELIVERING" }),
                                                });
                                                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                              } catch (err) {
                                                console.error("Failed to copy address:", err);
                                              }
                                            }
                                          }}
                                          className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                        >
                                          Nav
                                        </button>
                                      );
                                    } else {
                                      return (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                              await fetch(`/api/transactions/${transaction._id}`, {
                                                method: "PUT",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ step: "DELIVERING" }),
                                              });
                                              queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                            } catch (err) {
                                              console.error("Error skipping step:", err);
                                              alert("Failed to skip step");
                                            }
                                          }}
                                          className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                        >
                                          Skip
                                        </button>
                                      );
                                    }
                                  })()
                                ) : transaction.step === "NAV_TO_CUSTOMER" ? (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await fetch(`/api/transactions/${transaction._id}`, {
                                          method: "PUT",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ step: "DELIVERING" }),
                                        });
                                        queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                      } catch (err) {
                                        console.error("Error skipping step:", err);
                                        alert("Failed to skip step");
                                      }
                                    }}
                                    className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                  >
                                    Skip
                                  </button>
                                ) : transaction.step === "DELIVERING" ? (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      // Hide Street View when Done is clicked
                                      setShowStreetViewForTransaction(null);
                                      try {
                                        await fetch(`/api/transactions/${transaction._id}`, {
                                          method: "PUT",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ step: "DONE", active: false }),
                                        });
                                        queryClient.invalidateQueries({ queryKey: ["transactions"] });
                                      } catch (err) {
                                        console.error("Error updating transaction:", err);
                                        alert("Failed to mark as done");
                                      }
                                    }}
                                    className="absolute inset-0 w-full h-full flex items-center justify-center text-xs font-medium px-4 py-2"
                                  >
                                    Done
                                  </button>
                                ) : null
                              ) : null
                            }
                          />
                        </div>
                      )}
                      
                      {/* Restaurant Info */}
                      <div className="mb-1">
                        {isIncome && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {transaction.linkedDeliveryOrders.map((order) => (
                              <button
                                key={order.id}
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
                                      <span>{formatAddress(order.restaurantAddress)}</span>
                                    </>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!isIncome && transaction.notes && (
                          <div className="text-sm text-gray-600 dark:text-gray-300 break-words">
                            {transaction.notes}
                          </div>
                        )}
                      </div>
                      
                      {/* Customer and Edit/Delete at Bottom */}
                      <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-200 dark:border-gray-700 gap-2">
                        <div className="flex-1 min-w-0">
                          {isIncome && transaction.linkedOcrExports && transaction.linkedOcrExports.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {transaction.linkedOcrExports.map((customer) => (
                                <button
                                  key={customer.id}
                                  onClick={() => {
                                    setEditingCustomerAddress(customer.customerAddress);
                                    setEditingCustomerEntryId(customer.entryId || null);
                                  }}
                                  className="text-sm text-gray-900 dark:text-white hover:underline flex items-center gap-1 text-left break-words"
                                >
                                  <span className="flex-shrink-0"><User className="w-4 h-4" /></span>
                                  <span className="truncate">
                                    {customer.customerName}
                                    {customer.customerAddress && (
                                      <>
                                        <span className="mx-1 text-gray-400 dark:text-gray-500">•</span>
                                        <span>{formatAddress(customer.customerAddress)}</span>
                                      </>
                                    )}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setEditingTransaction(transaction._id)}
                            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                            title="Edit"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(transaction._id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
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
          setShowAddOrderModal(false);
          handleCreateTransactionFromOrder(order as SelectedDeliveryOrder);
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
    </Layout>
  );
}


