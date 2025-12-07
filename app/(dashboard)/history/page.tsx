"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { format, isToday, isYesterday } from "date-fns";
import { Sparkles, MapPin, User, Car, Package, Check, Utensils, Pencil, Trash2, ShoppingBag, ArrowUpCircle, ArrowDownCircle, XCircle, Search, X } from "lucide-react";
import { formatAddress } from "@/lib/address-formatter";
import Layout from "@/components/Layout";
import AddTransactionModal from "@/components/AddTransactionModal";
import AddOrderToTransactionModal from "@/components/AddOrderToTransactionModal";
import EditCustomerEntriesModal from "@/components/EditCustomerEntriesModal";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import LinkOrderModal from "@/components/LinkOrderModal";
import ShareOrderModal from "@/components/ShareOrderModal";
import DeliveryConfirmationModal from "@/components/DeliveryConfirmationModal";
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
  stepLog?: Array<{
    fromStep?: string | null;
    toStep: string;
    time: Date | string;
  }>;
  linkedOcrExports?: LinkedCustomer[];
  linkedDeliveryOrders?: LinkedOrder[];
  routeSegments?: Array<{
    fromLat: number;
    fromLon: number;
    toLat: number;
    toLon: number;
    distanceMiles?: number;
    durationText?: string;
    durationSeconds?: number;
    type: 'user-to-restaurant' | 'restaurant-to-restaurant' | 'restaurant-to-customer' | 'customer-to-customer';
    fromIndex: number;
    toIndex: number;
    orderId?: string;
    calculatedAt?: Date | string;
    segmentHash: string;
  }>;
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

interface RouteSegment {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distanceMiles?: number;
  durationText?: string;
  durationSeconds?: number;
  loading?: boolean;
  error?: boolean;
  type: 'user-to-restaurant' | 'restaurant-to-restaurant' | 'restaurant-to-customer' | 'customer-to-customer';
  fromIndex: number;
  toIndex: number;
  orderId?: string; // For user-to-restaurant segments, track which order
  segmentHash?: string;
  calculatedAt?: Date | string;
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
 * Create a hash for a route segment based on its coordinates
 * Used to detect if addresses have changed
 */
const createSegmentHash = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  type: string,
  fromIndex: number,
  toIndex: number
): string => {
  // Round coordinates to 6 decimal places (same as server-side cache precision)
  const roundedFromLat = Math.round(fromLat * 1000000) / 1000000;
  const roundedFromLon = Math.round(fromLon * 1000000) / 1000000;
  const roundedToLat = Math.round(toLat * 1000000) / 1000000;
  const roundedToLon = Math.round(toLon * 1000000) / 1000000;
  
  // Create hash string from coordinates and segment metadata
  const hashString = `${roundedFromLat},${roundedFromLon}|${roundedToLat},${roundedToLon}|${type}|${fromIndex}|${toIndex}`;
  
  // Simple hash function (matches server-side implementation)
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    const char = hashString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(36);
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
  
  const [streetViewUrl, setStreetViewUrl] = useState<string | null>(null);

  // Fetch Street View URL when needed
  useEffect(() => {
    if (showStreetView && (customerAddress || (customerLat !== undefined && customerLon !== undefined))) {
      const params = new URLSearchParams({
        width: "600",
        height: "300",
      });
      
      if (customerLat !== undefined && customerLon !== undefined) {
        params.append("lat", customerLat.toString());
        params.append("lon", customerLon.toString());
      } else if (customerAddress) {
        params.append("address", customerAddress);
      }
      
      fetch(`/api/streetview?${params.toString()}`)
        .then((res) => res.json())
        .then((result) => {
          if (result.url) {
            setStreetViewUrl(result.url);
          } else {
            setStreetViewUrl(null);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch Street View URL:", err);
          setStreetViewUrl(null);
        });
    } else {
      setStreetViewUrl(null);
    }
  }, [showStreetView, customerAddress, customerLat, customerLon]);

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
  const { isPrivacyModeEnabled } = usePrivacyMode();
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
  const [deliveryConfirmation, setDeliveryConfirmation] = useState<{ transactionId: string; customerAddress: string; customerName?: string } | null>(null);
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false);
  const [showStreetViewForTransaction, setShowStreetViewForTransaction] = useState<string | null>(null);
  const [editingAdditionalRestaurant, setEditingAdditionalRestaurant] = useState<{ orderId: string; restaurantIndex: number; restaurant: AdditionalRestaurant } | null>(null);
  const [routeSegments, setRouteSegments] = useState<Record<string, RouteSegment[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  
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

  // Search filter function
  const matchesSearch = (transaction: Transaction, query: string): boolean => {
    if (!query.trim()) return true;
    
    const searchLower = query.toLowerCase().trim();
    
    // Search by amount (exact match or partial string match)
    const amountStr = transaction.amount.toString();
    if (amountStr.includes(searchLower) || formatCurrency(transaction.amount).toLowerCase().includes(searchLower)) {
      return true;
    }
    
    // Search by app name (tag)
    if (transaction.tag && transaction.tag.toLowerCase().includes(searchLower)) {
      return true;
    }
    
    // Search by restaurant name
    if (transaction.linkedDeliveryOrders) {
      for (const order of transaction.linkedDeliveryOrders) {
        if (order.restaurantName && order.restaurantName.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Also check additional restaurants
        if (order.additionalRestaurants) {
          for (const restaurant of order.additionalRestaurants) {
            if (restaurant.name && restaurant.name.toLowerCase().includes(searchLower)) {
              return true;
            }
          }
        }
      }
    }
    
    // Search by customer name
    if (transaction.linkedOcrExports) {
      for (const customer of transaction.linkedOcrExports) {
        if (customer.customerName && customer.customerName.toLowerCase().includes(searchLower)) {
          return true;
        }
      }
    }
    
    // Search by app name from linked orders
    if (transaction.linkedDeliveryOrders) {
      for (const order of transaction.linkedDeliveryOrders) {
        if (order.appName && order.appName.toLowerCase().includes(searchLower)) {
          return true;
        }
      }
    }
    
    // Search by app name from linked customers
    if (transaction.linkedOcrExports) {
      for (const customer of transaction.linkedOcrExports) {
        if (customer.appName && customer.appName.toLowerCase().includes(searchLower)) {
          return true;
        }
      }
    }
    
    return false;
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

  // Calculate route segments for a transaction
  const calculateRouteSegments = async (transaction: Transaction) => {
    if (!transaction.linkedDeliveryOrders || transaction.linkedDeliveryOrders.length === 0) {
      return;
    }

    const transactionId = transaction._id;
    const segments: RouteSegment[] = [];

    // Get all restaurants (main + additional) with their indices
    const allRestaurants: Array<{ lat?: number; lon?: number; name: string; orderIndex: number; restaurantIndex: number }> = [];
    transaction.linkedDeliveryOrders.forEach((order, orderIdx) => {
      // Check for both null and undefined, and ensure they're valid numbers
      if (
        order.restaurantLat != null &&
        order.restaurantLon != null &&
        !isNaN(order.restaurantLat) &&
        !isNaN(order.restaurantLon)
      ) {
        allRestaurants.push({
          lat: order.restaurantLat,
          lon: order.restaurantLon,
          name: order.restaurantName,
          orderIndex: orderIdx,
          restaurantIndex: -1, // -1 means main restaurant
        });
      }
      // Add additional restaurants
      if (order.additionalRestaurants) {
        order.additionalRestaurants.forEach((restaurant, restaurantIdx) => {
          if (
            restaurant.lat != null &&
            restaurant.lon != null &&
            !isNaN(restaurant.lat) &&
            !isNaN(restaurant.lon)
          ) {
            allRestaurants.push({
              lat: restaurant.lat,
              lon: restaurant.lon,
              name: restaurant.name,
              orderIndex: orderIdx,
              restaurantIndex: restaurantIdx,
            });
          }
        });
      }
    });

    // Get all customers
    const allCustomers = transaction.linkedOcrExports || [];

    // Get persisted segments from transaction
    const persistedSegments = transaction.routeSegments || [];
    const persistedSegmentsMap = new Map(
      persistedSegments.map(seg => [seg.segmentHash, seg])
    );

    // Calculate segment from user location to first restaurant
    if (allRestaurants.length > 0) {
      const firstRestaurant = allRestaurants[0];
      // Find the order that corresponds to the first restaurant
      const firstOrder = transaction.linkedDeliveryOrders[firstRestaurant.orderIndex];
      if (
        firstOrder.userLatitude != null &&
        firstOrder.userLongitude != null &&
        firstRestaurant.lat != null &&
        firstRestaurant.lon != null &&
        !isNaN(firstOrder.userLatitude) &&
        !isNaN(firstOrder.userLongitude) &&
        !isNaN(firstRestaurant.lat) &&
        !isNaN(firstRestaurant.lon)
      ) {
        const segmentHash = createSegmentHash(
          firstOrder.userLatitude,
          firstOrder.userLongitude,
          firstRestaurant.lat,
          firstRestaurant.lon,
          'user-to-restaurant',
          -1,
          0
        );
        const persisted = persistedSegmentsMap.get(segmentHash);
        segments.push({
          fromLat: firstOrder.userLatitude,
          fromLon: firstOrder.userLongitude,
          toLat: firstRestaurant.lat,
          toLon: firstRestaurant.lon,
          loading: !persisted,
          distanceMiles: persisted?.distanceMiles,
          durationText: persisted?.durationText,
          durationSeconds: persisted?.durationSeconds,
          type: 'user-to-restaurant',
          fromIndex: -1, // -1 indicates user location
          toIndex: 0,
          orderId: firstOrder.id,
          segmentHash,
          calculatedAt: persisted?.calculatedAt,
        });
      }
    }

    // Calculate segments between restaurants
    // Process each order explicitly to ensure correct segment calculation:
    // 1. Main restaurant → first additional restaurant (if exists)
    // 2. Between additional restaurants within the same order
    // 3. Last additional restaurant → next order's main restaurant (if there's a next order)
    // 4. Last additional restaurant → first customer (if this is the last order)
    
    // Group restaurants by order to process them explicitly
    const restaurantsByOrder: Array<Array<typeof allRestaurants[0]>> = [];
    let currentOrderIndex = -1;
    let currentOrderRestaurants: Array<typeof allRestaurants[0]> = [];
    
    allRestaurants.forEach((restaurant) => {
      if (restaurant.orderIndex !== currentOrderIndex) {
        // New order - save previous order's restaurants and start new group
        if (currentOrderRestaurants.length > 0) {
          restaurantsByOrder.push(currentOrderRestaurants);
        }
        currentOrderRestaurants = [restaurant];
        currentOrderIndex = restaurant.orderIndex;
      } else {
        // Same order - add to current group
        currentOrderRestaurants.push(restaurant);
      }
    });
    // Don't forget the last order
    if (currentOrderRestaurants.length > 0) {
      restaurantsByOrder.push(currentOrderRestaurants);
    }
    
    // Calculate segments within each order and between orders
    let globalRestaurantIndex = 0;
    for (let orderIdx = 0; orderIdx < restaurantsByOrder.length; orderIdx++) {
      const orderRestaurants = restaurantsByOrder[orderIdx];
      
      // Calculate segments within this order
      // Main restaurant → first additional restaurant (if exists)
      // Then between additional restaurants
      for (let i = 0; i < orderRestaurants.length - 1; i++) {
        const from = orderRestaurants[i];
        const to = orderRestaurants[i + 1];
        if (
          from.lat != null &&
          from.lon != null &&
          to.lat != null &&
          to.lon != null &&
          !isNaN(from.lat) &&
          !isNaN(from.lon) &&
          !isNaN(to.lat) &&
          !isNaN(to.lon)
        ) {
          const fromGlobalIndex = globalRestaurantIndex + i;
          const toGlobalIndex = globalRestaurantIndex + i + 1;
          const segmentHash = createSegmentHash(
            from.lat,
            from.lon,
            to.lat,
            to.lon,
            'restaurant-to-restaurant',
            fromGlobalIndex,
            toGlobalIndex
          );
          const persisted = persistedSegmentsMap.get(segmentHash);
          segments.push({
            fromLat: from.lat,
            fromLon: from.lon,
            toLat: to.lat,
            toLon: to.lon,
            loading: !persisted,
            distanceMiles: persisted?.distanceMiles,
            durationText: persisted?.durationText,
            durationSeconds: persisted?.durationSeconds,
            type: 'restaurant-to-restaurant',
            fromIndex: fromGlobalIndex,
            toIndex: toGlobalIndex,
            segmentHash,
            calculatedAt: persisted?.calculatedAt,
          });
        }
      }
      
      // Calculate segment from last restaurant of this order to:
      // - Next order's main restaurant (if there's a next order)
      // - OR first customer (if this is the last order)
      const lastRestaurantInOrder = orderRestaurants[orderRestaurants.length - 1];
      const lastRestaurantGlobalIndex = globalRestaurantIndex + orderRestaurants.length - 1;
      
      if (orderIdx < restaurantsByOrder.length - 1) {
        // There's a next order - calculate segment to next order's main restaurant
        const nextOrderRestaurants = restaurantsByOrder[orderIdx + 1];
        if (nextOrderRestaurants.length > 0) {
          const nextOrderMainRestaurant = nextOrderRestaurants[0];
          if (
            lastRestaurantInOrder.lat != null &&
            lastRestaurantInOrder.lon != null &&
            nextOrderMainRestaurant.lat != null &&
            nextOrderMainRestaurant.lon != null &&
            !isNaN(lastRestaurantInOrder.lat) &&
            !isNaN(lastRestaurantInOrder.lon) &&
            !isNaN(nextOrderMainRestaurant.lat) &&
            !isNaN(nextOrderMainRestaurant.lon)
          ) {
            const nextOrderMainGlobalIndex = globalRestaurantIndex + orderRestaurants.length;
            const segmentHash = createSegmentHash(
              lastRestaurantInOrder.lat,
              lastRestaurantInOrder.lon,
              nextOrderMainRestaurant.lat,
              nextOrderMainRestaurant.lon,
              'restaurant-to-restaurant',
              lastRestaurantGlobalIndex,
              nextOrderMainGlobalIndex
            );
            const persisted = persistedSegmentsMap.get(segmentHash);
            segments.push({
              fromLat: lastRestaurantInOrder.lat,
              fromLon: lastRestaurantInOrder.lon,
              toLat: nextOrderMainRestaurant.lat,
              toLon: nextOrderMainRestaurant.lon,
              loading: !persisted,
              distanceMiles: persisted?.distanceMiles,
              durationText: persisted?.durationText,
              durationSeconds: persisted?.durationSeconds,
              type: 'restaurant-to-restaurant',
              fromIndex: lastRestaurantGlobalIndex,
              toIndex: nextOrderMainGlobalIndex,
              segmentHash,
              calculatedAt: persisted?.calculatedAt,
            });
          }
        }
      } else {
        // This is the last order - calculate segment from last restaurant to first customer
        if (allCustomers.length > 0) {
          const firstCustomer = allCustomers[0];
          if (
            lastRestaurantInOrder.lat != null &&
            lastRestaurantInOrder.lon != null &&
            firstCustomer.lat != null &&
            firstCustomer.lon != null &&
            !isNaN(lastRestaurantInOrder.lat) &&
            !isNaN(lastRestaurantInOrder.lon) &&
            !isNaN(firstCustomer.lat) &&
            !isNaN(firstCustomer.lon)
          ) {
            const segmentHash = createSegmentHash(
              lastRestaurantInOrder.lat,
              lastRestaurantInOrder.lon,
              firstCustomer.lat,
              firstCustomer.lon,
              'restaurant-to-customer',
              lastRestaurantGlobalIndex,
              0
            );
            const persisted = persistedSegmentsMap.get(segmentHash);
            segments.push({
              fromLat: lastRestaurantInOrder.lat,
              fromLon: lastRestaurantInOrder.lon,
              toLat: firstCustomer.lat,
              toLon: firstCustomer.lon,
              loading: !persisted,
              distanceMiles: persisted?.distanceMiles,
              durationText: persisted?.durationText,
              durationSeconds: persisted?.durationSeconds,
              type: 'restaurant-to-customer',
              fromIndex: lastRestaurantGlobalIndex,
              toIndex: 0,
              segmentHash,
              calculatedAt: persisted?.calculatedAt,
            });
          }
        }
      }
      
      // Update global index for next order
      globalRestaurantIndex += orderRestaurants.length;
    }

    // Calculate segments between customers
    for (let i = 0; i < allCustomers.length - 1; i++) {
      const from = allCustomers[i];
      const to = allCustomers[i + 1];
      if (
        from.lat != null &&
        from.lon != null &&
        to.lat != null &&
        to.lon != null &&
        !isNaN(from.lat) &&
        !isNaN(from.lon) &&
        !isNaN(to.lat) &&
        !isNaN(to.lon)
      ) {
        const segmentHash = createSegmentHash(
          from.lat,
          from.lon,
          to.lat,
          to.lon,
          'customer-to-customer',
          i,
          i + 1
        );
        const persisted = persistedSegmentsMap.get(segmentHash);
        segments.push({
          fromLat: from.lat,
          fromLon: from.lon,
          toLat: to.lat,
          toLon: to.lon,
          loading: !persisted,
          distanceMiles: persisted?.distanceMiles,
          durationText: persisted?.durationText,
          durationSeconds: persisted?.durationSeconds,
          type: 'customer-to-customer',
          fromIndex: i,
          toIndex: i + 1,
          segmentHash,
          calculatedAt: persisted?.calculatedAt,
        });
      }
    }

    // Set initial state (with persisted data if available)
    setRouteSegments((prev) => ({
      ...prev,
      [transactionId]: segments,
    }));

    // Find segments that need calculation (missing or changed)
    const segmentsToCalculate = segments.filter(segment => {
      // Skip if already has distance data
      if (segment.distanceMiles != null && segment.durationText) {
        return false;
      }
      // Skip if invalid coordinates
      if (
        segment.fromLat == null ||
        segment.fromLon == null ||
        segment.toLat == null ||
        segment.toLon == null ||
        isNaN(segment.fromLat) ||
        isNaN(segment.fromLon) ||
        isNaN(segment.toLat) ||
        isNaN(segment.toLon)
      ) {
        return false;
      }
      return true;
    });

    // If no segments need calculation, we're done
    if (segmentsToCalculate.length === 0) {
      return;
    }

    // Calculate missing segments
    const calculatedSegments = await Promise.all(
      segmentsToCalculate.map(async (segment) => {
        try {
          const response = await fetch(
            `/api/distance-matrix?originLat=${segment.fromLat}&originLon=${segment.fromLon}&destinationLat=${segment.toLat}&destinationLon=${segment.toLon}`
          );
          if (!response.ok) {
            throw new Error("Failed to fetch distance");
          }
          const data = await response.json();
          return {
            ...segment,
            distanceMiles: data.distanceMiles,
            durationText: data.durationText,
            durationSeconds: data.durationSeconds,
            loading: false,
            error: false,
            calculatedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error("Error calculating route segment:", error);
          return {
            ...segment,
            loading: false,
            error: true,
          };
        }
      })
    );

    // Merge calculated segments back into full segments array
    const calculatedSegmentsMap = new Map(
      calculatedSegments.map(seg => [seg.segmentHash, seg])
    );
    const updatedSegments = segments.map(segment => {
      const calculated = calculatedSegmentsMap.get(segment.segmentHash);
      return calculated || segment;
    });

    // Update state with calculated segments
    setRouteSegments((prev) => ({
      ...prev,
      [transactionId]: updatedSegments,
    }));

    // Persist calculated segments to transaction
    const segmentsToPersist = calculatedSegments.filter(seg => !seg.error && seg.distanceMiles != null);
    if (segmentsToPersist.length > 0) {
      try {
        const response = await fetch(`/api/transactions/${transactionId}/route-segments`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            routeSegments: segmentsToPersist.map(seg => ({
              fromLat: seg.fromLat,
              fromLon: seg.fromLon,
              toLat: seg.toLat,
              toLon: seg.toLon,
              distanceMiles: seg.distanceMiles,
              durationText: seg.durationText,
              durationSeconds: seg.durationSeconds,
              type: seg.type,
              fromIndex: seg.fromIndex,
              toIndex: seg.toIndex,
              orderId: seg.orderId,
              segmentHash: seg.segmentHash,
              calculatedAt: seg.calculatedAt || new Date().toISOString(),
            })),
          }),
        });
        
        if (response.ok) {
          // Invalidate transactions query to refetch with new segments
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        } else {
          console.error("Failed to persist route segments:", await response.text());
        }
      } catch (error) {
        console.error("Error persisting route segments:", error);
        // Don't throw - this is not critical for display
      }
    }
  };

  // Load persisted route segments and calculate missing ones when transactions load
  useEffect(() => {
    if (transactions.length > 0) {
      transactions.forEach((transaction: Transaction) => {
        if (
          transaction.type === "income" &&
          transaction.linkedDeliveryOrders &&
          transaction.linkedDeliveryOrders.length > 0
        ) {
          const transactionId = transaction._id;
          
          // Skip if we already have segments loaded
          if (routeSegments[transactionId]) {
            return;
          }

          // If transaction has persisted routeSegments (not empty array), use them directly
          // Check for both undefined/null and empty array
          const persistedSegments = transaction.routeSegments;
          const hasPersistedSegments = persistedSegments && 
            Array.isArray(persistedSegments) && 
            persistedSegments.length > 0;
          
          if (hasPersistedSegments && persistedSegments) {
            // Convert persisted segments to RouteSegment format
            const persistedRouteSegments: RouteSegment[] = persistedSegments.map(seg => ({
              fromLat: seg.fromLat,
              fromLon: seg.fromLon,
              toLat: seg.toLat,
              toLon: seg.toLon,
              distanceMiles: seg.distanceMiles,
              durationText: seg.durationText,
              durationSeconds: seg.durationSeconds,
              type: seg.type,
              fromIndex: seg.fromIndex,
              toIndex: seg.toIndex,
              orderId: seg.orderId,
              segmentHash: seg.segmentHash,
              calculatedAt: seg.calculatedAt,
              loading: false,
              error: false,
            }));

            // Set persisted segments
            setRouteSegments((prev) => ({
              ...prev,
              [transactionId]: persistedRouteSegments,
            }));

            // Check if ALL segments have complete distance data
            // If any are missing, we'll need to calculate them
            const allSegmentsComplete = persistedRouteSegments.every(
              seg => seg.distanceMiles != null && seg.durationText != null && seg.durationText.length > 0
            );

            // Only calculate if there are incomplete segments
            // calculateRouteSegments will only calculate the missing ones
            if (!allSegmentsComplete) {
              calculateRouteSegments(transaction);
            }
            // If all segments are complete, we're done - no API calls needed
          } else {
            // No persisted segments, calculate all
            calculateRouteSegments(transaction);
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

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

  // Apply search filter to transactions
  const filteredTransactions = searchQuery.trim()
    ? transactions.filter((transaction: Transaction) => matchesSearch(transaction, searchQuery))
    : transactions;

  const groupedTransactions = filteredTransactions.reduce((acc: Record<string, Transaction[]>, transaction: Transaction) => {
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
      <div className="mb-6 space-y-4">
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
        
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by restaurant, customer, app, or amount..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1); // Reset to page 1 when search changes
            }}
            className="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
          />
          {searchQuery && (
            <button
              onClick={() => {
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
                                // Calculate total segment miles
                                const segments = routeSegments[transaction._id] || [];
                                const totalSegmentMiles = segments
                                  .filter(seg => seg.distanceMiles != null && !seg.error)
                                  .reduce((sum, seg) => sum + (seg.distanceMiles || 0), 0);
                                
                                // Use consistent rounding for both
                                const roundedOfferMiles = Math.round(offerMiles * 10) / 10;
                                const roundedSegmentMiles = totalSegmentMiles > 0 ? Math.round(totalSegmentMiles * 10) / 10 : 0;
                                
                                return (
                                  <>
                                    <div>
                                      {roundedOfferMiles.toFixed(1)}mi
                                      {offerMiles > 0 && (
                                        <span className="ml-1">
                                          (${(transaction.linkedDeliveryOrders[0].money / offerMiles).toFixed(2)}/mi)
                                        </span>
                                      )}
                                    </div>
                                    {roundedSegmentMiles > 0 && (
                                      <div className="text-[10px] text-gray-500 dark:text-gray-500">
                                        est. {roundedSegmentMiles.toFixed(1)}mi (${(transaction.linkedDeliveryOrders[0].money / roundedSegmentMiles).toFixed(2)}/mi)
                                      </div>
                                    )}
                                  </>
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
                                            // First, try to share the address
                                            if (navigator.share) {
                                              try {
                                                await navigator.share({ text: formattedAddress });
                                              } catch (err) {
                                                // User cancelled or error occurred - continue to modal anyway
                                                console.log("Share cancelled or failed:", err);
                                              }
                                            } else {
                                              // Fallback: copy to clipboard
                                              try {
                                                await navigator.clipboard.writeText(formattedAddress);
                                              } catch (err) {
                                                console.error("Failed to copy address:", err);
                                              }
                                            }
                                            // Then open the modal
                                            setDeliveryConfirmation({
                                              transactionId: transaction._id,
                                              customerAddress: customerAddress,
                                              customerName: customer.customerName,
                                            });
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
                                {/* Route segment from user to restaurant */}
                                {order.userAddress && 
                                 transaction.linkedDeliveryOrders && 
                                 transaction.linkedDeliveryOrders.length > 0 &&
                                 transaction.linkedDeliveryOrders[0].id === order.id &&
                                 routeSegments[transaction._id] && (() => {
                                   const segment = routeSegments[transaction._id].find(
                                     (s) => s.type === 'user-to-restaurant' && s.orderId === order.id
                                   );
                                   
                                   if (!segment) return null;
                                   
                                   // Only show separator if loading, error, or has data
                                   if (!segment.loading && !segment.error && (segment.distanceMiles === undefined || !segment.durationText)) {
                                     return null;
                                   }
                                   
                                   return (
                                     <div className="relative py-1">
                                       <div className="absolute inset-0 flex items-center">
                                         <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                                       </div>
                                       <div className="relative flex justify-center">
                                         {segment.loading ? (
                                           <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                             Calculating...
                                           </span>
                                         ) : segment.error ? (
                                           <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                             Error
                                           </span>
                                         ) : segment.distanceMiles !== undefined && segment.durationText ? (
                                           <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 dark:text-gray-400">
                                             {segment.distanceMiles.toFixed(1)} mi • {segment.durationText}
                                           </span>
                                         ) : null}
                                       </div>
                                     </div>
                                   );
                                 })()}
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
                        
                        {/* Route segments between restaurants */}
                        {isIncome && transaction.linkedDeliveryOrders && transaction.linkedDeliveryOrders.length > 0 && routeSegments[transaction._id] && (
                          <div className="space-y-1">
                            {routeSegments[transaction._id]
                              .filter((segment) => segment.type === 'restaurant-to-restaurant')
                              .map((segment, idx) => {
                                // Only show separator if loading, error, or has data
                                if (!segment.loading && !segment.error && (segment.distanceMiles === undefined || !segment.durationText)) {
                                  return null;
                                }
                                
                                return (
                                  <div key={idx} className="relative py-1">
                                    <div className="absolute inset-0 flex items-center">
                                      <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                                    </div>
                                    <div className="relative flex justify-center">
                                      {segment.loading ? (
                                        <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                          Calculating...
                                        </span>
                                      ) : segment.error ? (
                                        <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                          Error
                                        </span>
                                      ) : segment.distanceMiles !== undefined && segment.durationText ? (
                                        <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 dark:text-gray-400">
                                          {segment.distanceMiles.toFixed(1)} mi • {segment.durationText}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                        {/* Route segment between last restaurant and first customer */}
                        {isIncome && 
                         transaction.linkedDeliveryOrders && 
                         transaction.linkedDeliveryOrders.length > 0 &&
                         transaction.linkedOcrExports && 
                         transaction.linkedOcrExports.length > 0 &&
                         routeSegments[transaction._id] && (() => {
                           const segment = routeSegments[transaction._id].find((s) => s.type === 'restaurant-to-customer');
                           
                           if (!segment) return null;
                           
                           // Only show separator if loading, error, or has data
                           if (!segment.loading && !segment.error && (segment.distanceMiles === undefined || !segment.durationText)) {
                             return null;
                           }
                           
                           return (
                             <div className="relative py-1">
                               <div className="absolute inset-0 flex items-center">
                                 <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                               </div>
                               <div className="relative flex justify-center">
                                 {segment.loading ? (
                                   <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                     Calculating...
                                   </span>
                                 ) : segment.error ? (
                                   <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                     Error
                                   </span>
                                 ) : segment.distanceMiles !== undefined && segment.durationText ? (
                                   <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 dark:text-gray-400">
                                     {segment.distanceMiles.toFixed(1)} mi • {segment.durationText}
                                   </span>
                                 ) : null}
                               </div>
                             </div>
                           );
                         })()}
                        
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
                                {/* Route segment between customers */}
                                {customerIdx < transaction.linkedOcrExports!.length - 1 && routeSegments[transaction._id] && (() => {
                                  const segment = routeSegments[transaction._id].find(
                                    (s) => s.type === 'customer-to-customer' && s.fromIndex === customerIdx
                                  );
                                  
                                  if (!segment) return null;
                                  
                                  // Only show separator if loading, error, or has data
                                  if (!segment.loading && !segment.error && (segment.distanceMiles === undefined || !segment.durationText)) {
                                    return null;
                                  }
                                  
                                  return (
                                    <div className="relative py-1">
                                      <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                                      </div>
                                      <div className="relative flex justify-center">
                                        {segment.loading ? (
                                          <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                            Calculating...
                                          </span>
                                        ) : segment.error ? (
                                          <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400 dark:text-gray-500">
                                            Error
                                          </span>
                                        ) : segment.distanceMiles !== undefined && segment.durationText ? (
                                          <span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 dark:text-gray-400">
                                            {segment.distanceMiles.toFixed(1)} mi • {segment.durationText}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })()}
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
            // Clear route segments for the updated transaction so they recalculate
            if (editingTransaction) {
              setRouteSegments((prev) => {
                const updated = { ...prev };
                delete updated[editingTransaction];
                return updated;
              });
            }
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
          // Clear all route segments since customer coordinates may have changed
          // This affects all transactions using this customer
          setRouteSegments({});
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
          // Clear all route segments since order/restaurant coordinates may have changed
          // This affects all transactions using this order
          setRouteSegments({});
          // Refresh transactions to get updated order data
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }}
      />

      <LinkCustomerModal
        isOpen={linkingCustomerTransactionId !== null}
        onClose={() => setLinkingCustomerTransactionId(null)}
        transactionId={linkingCustomerTransactionId}
        userId={session?.user?.id}
        onLink={() => {
          // Clear route segments for this transaction so they recalculate with new customer data
          if (linkingCustomerTransactionId) {
            setRouteSegments((prev) => {
              const updated = { ...prev };
              delete updated[linkingCustomerTransactionId];
              return updated;
            });
          }
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
          // Clear route segments for this transaction so they recalculate with new order data
          if (linkingOrderTransactionId) {
            setRouteSegments((prev) => {
              const updated = { ...prev };
              delete updated[linkingOrderTransactionId];
              return updated;
            });
          }
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
    </Layout>
  );
}


