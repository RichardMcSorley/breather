"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import AddTransactionModal from "@/components/AddTransactionModal";
import HeatMap from "@/components/HeatMap";
import AppHeatMap from "@/components/AppHeatMap";
import { useSummary, usePaymentPlan, useBillPayments } from "@/hooks/useQueries";
import { Utensils } from "lucide-react";

interface Summary {
  grossTotal: number;
  freeCash: number;
  irsMileageRate: number;
  mileageMilesLast30: number;
  mileageSavings: number;
  dailyBurnRate?: number;
  netDailyCashFlow?: number;
  netDailyCashFlowWithAllExpenses?: number;
  daysToBreakEven?: number;
  totalBillsDue?: number;
  unpaidBills?: number;
  daysUntilLastBill?: number;
  todayIncome?: number;
  todayExpenses?: number;
  todayNet?: number;
  todayMileageMiles?: number;
  todayMileageSavings?: number;
  earningsPerMile?: number | null;
  earningsPerHour?: number | null;
  incomeBreakdown?: Array<{ source: string; amount: number }>;
}

interface PaymentPlanEntry {
  date: string;
  bill: string;
  billId: string;
  payment: number;
  remainingBalance: number;
  dueDate?: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [showAddModal, setShowAddModal] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  
  // Date navigation state
  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [viewMode, setViewMode] = useState<"day" | "month" | "year">("day");

  // Get payment plan config from localStorage
  const paymentPlanConfig = useMemo(() => {
    if (typeof window === "undefined") return null;
    const savedConfig = localStorage.getItem("bills_payment_plan_config");
    if (!savedConfig) return null;
    try {
      return JSON.parse(savedConfig);
    } catch {
      return null;
    }
  }, []);

  // Queries
  const { data: summary, isLoading: summaryLoading } = useSummary(selectedDate, viewMode);
  const { data: paymentPlanData } = usePaymentPlan(
    paymentPlanConfig?.startDate || "",
    parseFloat(paymentPlanConfig?.dailyPayment || "0"),
    viewMode === "day" && !!paymentPlanConfig
  );
  const { data: paymentsData } = useBillPayments();

  // Analytics for best restaurant recommendation
  const [bestRestaurantForCurrentHour, setBestRestaurantForCurrentHour] = useState<{
    restaurantName: string;
    medianRatio: number;
    volume: number;
    hour: number;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchBestRestaurantForCurrentHour();
    }
  }, [userId]);

  const fetchBestRestaurantForCurrentHour = async () => {
    if (!userId) return;

    try {
      setAnalyticsLoading(true);
      const currentHour = new Date().getHours();
      const currentDayOfWeek = new Date().getDay(); // 0 = Sunday, 6 = Saturday
      
      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("hour", currentHour.toString());
      params.append("dayOfWeek", currentDayOfWeek.toString());
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      params.append("timezone", userTimezone);

      const response = await fetch(`/api/delivery-orders/best-restaurant-now?${params.toString()}`);
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = `Failed to fetch best restaurant (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        console.error("Best restaurant API error:", errorMessage, "Status:", response.status);
        setBestRestaurantForCurrentHour(null);
        return;
      }

      const data = await response.json();
      
      if (data.bestRestaurant) {
        setBestRestaurantForCurrentHour({
          restaurantName: data.bestRestaurant.restaurantName,
          medianRatio: data.bestRestaurant.medianRatio,
          volume: data.bestRestaurant.volume,
          hour: data.bestRestaurant.hour,
        });
      } else {
        setBestRestaurantForCurrentHour(null);
      }
    } catch (err) {
      console.error("Error fetching best restaurant:", err);
      setBestRestaurantForCurrentHour(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Calculate paid payments map
  const paidPayments = useMemo(() => {
    if (!paymentsData?.payments) return {};
    const paidMap: Record<string, number> = {};
    paymentsData.payments.forEach((payment: any) => {
      const billId = payment.billId?._id || payment.billId?.toString() || payment.billId;
      if (billId && payment.paymentDate) {
        const key = `${billId}-${payment.paymentDate}`;
        paidMap[key] = (paidMap[key] || 0) + payment.amount;
      }
    });
    return paidMap;
  }, [paymentsData]);

  // Calculate upcoming payments
  const upcomingPayments = useMemo(() => {
    if (!paymentPlanData?.paymentPlan || viewMode !== "day") return [];
    
    const selectedDateStr = selectedDate;
    const selectedDateEntries = paymentPlanData.paymentPlan.filter(
      (entry: PaymentPlanEntry) => entry.date === selectedDateStr
    );
    const selectedDateAllPaid = selectedDateEntries.length > 0 && selectedDateEntries.every((entry: PaymentPlanEntry) => {
      const paymentKey = `${entry.billId}-${entry.date}`;
      const paidAmount = paidPayments[paymentKey] || 0;
      return paidAmount >= entry.payment;
    });

    if (selectedDateAllPaid) {
      // Find the next unpaid date
      const allEntries = paymentPlanData.paymentPlan.filter(
        (entry: PaymentPlanEntry) => entry.date > selectedDateStr
      );
      const datesWithUnpaid = new Set<string>();
      allEntries.forEach((entry: PaymentPlanEntry) => {
        const paymentKey = `${entry.billId}-${entry.date}`;
        const paidAmount = paidPayments[paymentKey] || 0;
        if (paidAmount < entry.payment) {
          datesWithUnpaid.add(entry.date);
        }
      });
      
      if (datesWithUnpaid.size > 0) {
        const nextUnpaidDate = Array.from(datesWithUnpaid).sort()[0];
        return paymentPlanData.paymentPlan.filter(
          (entry: PaymentPlanEntry) => entry.date === nextUnpaidDate
        );
      }
      return [];
    } else {
      // Show unpaid entries up to and including selected date
      return paymentPlanData.paymentPlan.filter(
        (entry: PaymentPlanEntry) => {
          if (entry.date > selectedDateStr) return false;
          const paymentKey = `${entry.billId}-${entry.date}`;
          const paidAmount = paidPayments[paymentKey] || 0;
          return paidAmount < entry.payment;
        }
      );
    }
  }, [paymentPlanData, paidPayments, selectedDate, viewMode]);

  const loading = summaryLoading;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);

  const formatMiles = (miles: number) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(miles);

  const formatDate = (dateString: string) => {
    // Parse YYYY-MM-DD as local date to avoid timezone issues
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entryDate = new Date(date);
    entryDate.setHours(0, 0, 0, 0);
    
    if (entryDate.getTime() === today.getTime()) {
      return "Today";
    }
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (entryDate.getTime() === yesterday.getTime()) {
      return "Yesterday";
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  };


  const navigateDate = (direction: "prev" | "next") => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const currentDate = new Date(year, month - 1, day);
    const newDate = new Date(currentDate);
    
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
    } else if (viewMode === "month") {
      newDate.setMonth(newDate.getMonth() + (direction === "next" ? 1 : -1));
    } else if (viewMode === "year") {
      newDate.setFullYear(newDate.getFullYear() + (direction === "next" ? 1 : -1));
    }
    
    const newDateString = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;
    setSelectedDate(newDateString);
  };
  
  const isDateBeyondToday = () => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const selected = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selected.setHours(0, 0, 0, 0);
    
    if (viewMode === "day") {
      return selected > today;
    } else if (viewMode === "month") {
      const selectedMonth = new Date(year, month - 1, 1);
      const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return selectedMonth > todayMonth;
    } else if (viewMode === "year") {
      return year > today.getFullYear();
    }
    return false;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };
  
  const getDisplayText = () => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (viewMode === "day") {
      const selectedDateObj = new Date(date);
      selectedDateObj.setHours(0, 0, 0, 0);
      
      if (selectedDateObj.getTime() === today.getTime()) {
        return "Today";
      }
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (selectedDateObj.getTime() === yesterday.getTime()) {
        return "Yesterday";
      }
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
      });
    } else if (viewMode === "month") {
      return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } else if (viewMode === "year") {
      return year.toString();
    }
    return "";
  };

  const handleAddTransaction = (type: "income" | "expense") => {
    setTransactionType(type);
    setShowAddModal(true);
  };

  const handleTransactionAdded = () => {
    setShowAddModal(false);
  };

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
      {/* Income and Expense Buttons */}
      <div className="flex gap-2 mb-4 justify-end">
        <button
          onClick={() => handleAddTransaction("income")}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 min-h-[44px]"
        >
          + Income
        </button>
        <button
          onClick={() => handleAddTransaction("expense")}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 min-h-[44px]"
        >
          + Expense
        </button>
      </div>

      {/* Best Restaurant Recommendation */}
      <Card className="p-6 mb-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Utensils className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Best Restaurant Right Now
            </h3>
            {analyticsLoading ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Based on your historical data for this hour ({new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
                  <span>Loading recommendation...</span>
                </div>
              </>
            ) : bestRestaurantForCurrentHour ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {bestRestaurantForCurrentHour.hour === new Date().getHours() ? (
                    <>Based on your historical data for this hour ({new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})
                    </>
                  ) : (
                    <>Based on your historical data for {bestRestaurantForCurrentHour.hour === 0 ? "12:00 AM" : bestRestaurantForCurrentHour.hour === 12 ? "12:00 PM" : bestRestaurantForCurrentHour.hour < 12 ? `${bestRestaurantForCurrentHour.hour}:00 AM` : `${bestRestaurantForCurrentHour.hour - 12}:00 PM`} (nearest hour with data)
                    </>
                  )}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-gray-900 dark:text-white">
                      {bestRestaurantForCurrentHour.restaurantName}
                    </span>
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(bestRestaurantForCurrentHour.medianRatio)}/mi
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {bestRestaurantForCurrentHour.volume} order{bestRestaurantForCurrentHour.volume !== 1 ? "s" : ""} at this hour historically
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Based on your historical data for this hour ({new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})
                </p>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  No historical data available. Check back after you've completed some orders!
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Date Navigation */}
      <Card className="p-4 mb-4">
        <div className="space-y-3">
          {/* View Mode Selector - Centered above date picker */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                setViewMode("day");
                // Set to today's date when switching to day view
                setSelectedDate(getTodayDateString());
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "day"
                  ? "bg-green-600 dark:bg-green-700 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => {
                setViewMode("month");
                // Set to current month (first of the month) when switching to month view
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                setSelectedDate(`${year}-${month}-01`);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-green-600 dark:bg-green-700 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => {
                setViewMode("year");
                // Set to current year (January 1st) when switching to year view
                const today = new Date();
                const year = today.getFullYear();
                setSelectedDate(`${year}-01-01`);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "year"
                  ? "bg-green-600 dark:bg-green-700 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Year
            </button>
          </div>
          
          {/* Date Navigation Controls */}
          <div className="flex items-center justify-between gap-3">
            {/* Left button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate("prev")}
              className="min-w-[44px] h-10 flex items-center justify-center"
              aria-label={`Previous ${viewMode}`}
            >
              ←
            </Button>
            
            {/* Center: Date picker */}
            <div className="flex-1 flex justify-center">
              <div className="w-[180px]">
                {viewMode === "day" ? (
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="w-full h-10 text-center"
                    style={{ textAlign: "center" }}
                    aria-label="Select date"
                  />
                ) : viewMode === "month" ? (
                  <Input
                    type="month"
                    value={`${selectedDate.split("-")[0]}-${selectedDate.split("-")[1]}`}
                    onChange={(e) => {
                      const [year, month] = e.target.value.split("-");
                      setSelectedDate(`${year}-${month}-01`);
                    }}
                    className="w-full h-10 text-center"
                    aria-label="Select month"
                  />
                ) : (
                  <Input
                    type="number"
                    value={selectedDate.split("-")[0]}
                    onChange={(e) => {
                      const year = e.target.value;
                      setSelectedDate(`${year}-01-01`);
                    }}
                    min="2000"
                    max={new Date().getFullYear() + 10}
                    className="w-full h-10 text-center"
                    placeholder="Year"
                    aria-label="Select year"
                  />
                )}
              </div>
            </div>
            
            {/* Right button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!isDateBeyondToday()) {
                  navigateDate("next");
                }
              }}
              disabled={isDateBeyondToday()}
              className="min-w-[44px] h-10 flex items-center justify-center"
              aria-label={`Next ${viewMode}`}
            >
              →
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 mb-6">
        {summary && (
          <>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Earnings
                </h2>
              </div>

              <div className="space-y-4 mt-4">
                {/* Gross Profit */}
                <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Gross Profit</span>
                    <span className="text-2xl font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(summary.todayIncome ?? 0)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Income before expenses and mileage</div>
                </div>

                {/* Breakdown */}
                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                  <div className="flex justify-between items-center">
                    <span>Income</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(summary.todayIncome ?? 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Expenses</span>
                    <span className="font-medium text-red-600 dark:text-red-400">- {formatCurrency(summary.todayExpenses ?? 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Mileage ({summary?.irsMileageRate?.toFixed(2) ?? "0.00"}/mi)</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      - {formatCurrency(summary.todayMileageSavings ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Net Profit */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Net Profit</span>
                    <span
                      className={`text-2xl font-bold ${
                        ((summary.todayIncome ?? 0) - (summary.todayExpenses ?? 0) - (summary.todayMileageSavings ?? 0)) >= 0 
                          ? "text-green-600 dark:text-green-400" 
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatCurrency(
                        (summary.todayIncome ?? 0) - (summary.todayExpenses ?? 0) - (summary.todayMileageSavings ?? 0)
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">After expenses and mileage</div>
                </div>

                {/* Efficiency Metrics */}
                {(summary.earningsPerMile !== null && summary.earningsPerMile !== undefined) ||
                 (summary.earningsPerHour !== null && summary.earningsPerHour !== undefined) ? (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Efficiency Metrics</div>
                    <div className="flex justify-between items-center">
                      {summary.earningsPerMile !== null && summary.earningsPerMile !== undefined && (
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {formatCurrency(summary.earningsPerMile)}/mile
                        </span>
                      )}
                      {summary.earningsPerHour !== null && summary.earningsPerHour !== undefined && (
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {formatCurrency(summary.earningsPerHour)}/hour
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* Income Breakdown by Source */}
            {summary.incomeBreakdown && summary.incomeBreakdown.length > 0 && (
              <Card className="p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                  Income by Source
                </h2>

                <div className="space-y-3">
                  {summary.incomeBreakdown.map((item: { source: string; amount: number }) => {
                    const total = summary.incomeBreakdown.reduce((sum: number, i: { source: string; amount: number }) => sum + i.amount, 0);
                    const percentage = (item.amount / total) * 100;
                    return (
                      <div key={item.source} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400"></div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {item.source}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 dark:bg-green-400 transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t-2 border-gray-300 dark:border-gray-600">
                  <span className="text-base font-bold text-gray-900 dark:text-white">
                    Total
                  </span>
                  <span className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">
                    {formatCurrency(
                      summary.incomeBreakdown.reduce((sum: number, item: { source: string; amount: number }) => sum + item.amount, 0)
                    )}
                  </span>
                </div>
              </Card>
            )}

            {upcomingPayments.length > 0 && (() => {
              // Filter to only show unpaid bills
              const unpaidEntries = upcomingPayments.filter((entry: PaymentPlanEntry) => {
                const paymentKey = `${entry.billId}-${entry.date}`;
                const paidAmount = paidPayments[paymentKey] || 0;
                return paidAmount < entry.payment;
              });

              if (unpaidEntries.length === 0) return null;

              return (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bills Due</h2>
                    <Link href="/bills">
                      <Button variant="outline" className="text-sm">
                        View Plan
                      </Button>
                    </Link>
                  </div>

                  <div className="space-y-3 mt-4">
                    {unpaidEntries
                      .sort((a: PaymentPlanEntry, b: PaymentPlanEntry) => a.date.localeCompare(b.date))
                      .map((entry: PaymentPlanEntry, idx: number) => {
                        const paymentKey = `${entry.billId}-${entry.date}`;
                        const paidAmount = paidPayments[paymentKey] || 0;
                        const remainingToPay = Math.max(0, entry.payment - paidAmount);
                        const isPaid = paidAmount >= entry.payment;
                        const progressPercent = entry.payment > 0 ? (paidAmount / entry.payment) * 100 : 0;

                        return (
                          <div
                            key={`${entry.date}-${entry.billId}-${idx}`}
                            className={`p-3 rounded-lg border ${
                              isPaid
                                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 dark:text-white">
                                  {entry.bill}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                  {formatDate(entry.date)} • Remaining: {formatCurrency(entry.remainingBalance)}
                                </div>
                              </div>
                              <div className="text-right">
                                {isPaid ? (
                                  <>
                                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                      {formatCurrency(entry.payment)}
                                    </div>
                                    <div className="text-xs text-green-600 dark:text-green-400">
                                      ✓ Paid
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                                      {formatCurrency(remainingToPay)}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      of {formatCurrency(entry.payment)}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  isPaid
                                    ? "bg-green-600 dark:bg-green-500"
                                    : "bg-blue-600 dark:bg-blue-500"
                                }`}
                                style={{ width: `${Math.min(100, progressPercent)}%` }}
                              />
                            </div>
                            {paidAmount > 0 && !isPaid && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                Paid: {formatCurrency(paidAmount)} of {formatCurrency(entry.payment)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="font-semibold text-gray-900 dark:text-white">Total Due</span>
                      <span className="font-bold text-lg text-gray-900 dark:text-white">
                        {formatCurrency(
                          unpaidEntries.reduce((sum: number, entry: PaymentPlanEntry) => {
                            const paymentKey = `${entry.billId}-${entry.date}`;
                            const paidAmount = paidPayments[paymentKey] || 0;
                            const remainingToPay = Math.max(0, entry.payment - paidAmount);
                            return sum + remainingToPay;
                          }, 0)
                        )}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })()}
          </>
        )}
      </div>

      {/* Heat Maps */}
      <div className="mb-6 space-y-6">
        <HeatMap localDate={selectedDate} viewMode={viewMode} />
        <AppHeatMap localDate={selectedDate} viewMode={viewMode} />
      </div>

      {showAddModal && (
        <AddTransactionModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          type={transactionType}
          onSuccess={handleTransactionAdded}
        />
      )}
    </Layout>
  );
}

