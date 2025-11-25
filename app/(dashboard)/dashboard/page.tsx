"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AddTransactionModal from "@/components/AddTransactionModal";

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
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [upcomingPayments, setUpcomingPayments] = useState<PaymentPlanEntry[]>([]);
  const [paidPayments, setPaidPayments] = useState<Record<string, number>>({});

  useEffect(() => {
    if (session?.user?.id) {
      fetchSummary();
      loadTodayPayments();
    }
  }, [session]);

  const loadTodayPayments = async () => {
    try {
      // Get saved payment plan config
      const savedConfig = localStorage.getItem("bills_payment_plan_config");
      if (!savedConfig) return;

      const config = JSON.parse(savedConfig);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Fetch payment plan
      const res = await fetch("/api/bills/payment-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: config.startDate,
          dailyPayment: parseFloat(config.dailyPayment),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Filter for payments up to and including today (compare as strings in YYYY-MM-DD format)
        const upcomingEntries = data.paymentPlan.filter(
          (entry: PaymentPlanEntry) => entry.date <= todayStr
        );
        setUpcomingPayments(upcomingEntries);

        // Fetch paid payments for all dates up to today
        const paymentsRes = await fetch("/api/bills/payments");
        if (paymentsRes.ok) {
          const paymentsData = await paymentsRes.json();
          const paidMap: Record<string, number> = {};
          paymentsData.payments.forEach((payment: any) => {
            const billId = payment.billId?._id || payment.billId?.toString() || payment.billId;
            if (billId && payment.paymentDate) {
              // Only include payments up to today (compare as strings)
              if (payment.paymentDate <= todayStr) {
                const key = `${billId}-${payment.paymentDate}`;
                paidMap[key] = (paidMap[key] || 0) + payment.amount;
              }
            }
          });
          setPaidPayments(paidMap);
        }
      }
    } catch (error) {
      console.error("Error loading upcoming payments:", error);
    }
  };

  const fetchSummary = async () => {
    try {
      // Get user's local date to ensure timezone-correct calculations
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const res = await fetch(`/api/summary?localDate=${localDate}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const errorData = await res.json();
        if (res.status === 503) {
          console.error("Database connection error:", errorData.error);
        }
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const handleAddTransaction = (type: "income" | "expense") => {
    setTransactionType(type);
    setShowAddModal(true);
  };

  const handleTransactionAdded = () => {
    setShowAddModal(false);
    fetchSummary();
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
      <div className="grid grid-cols-1 gap-4 mb-6">
        {summary && (
          <>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Today&apos;s Earnings</h2>
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
                  <div className="text-xs text-gray-500 dark:text-gray-500">Income before expenses and mileage</div>
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
                  <div className="text-xs text-gray-500 dark:text-gray-500">After expenses and mileage</div>
                </div>
              </div>
            </Card>

            {upcomingPayments.length > 0 && (() => {
              // Filter to only show unpaid bills
              const unpaidEntries = upcomingPayments.filter((entry) => {
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
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((entry, idx) => {
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
                          unpaidEntries.reduce((sum, entry) => {
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

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="primary"
          className="w-full h-20 flex items-center justify-center text-3xl"
          onClick={() => handleAddTransaction("income")}
        >
          +
        </Button>
        <Button
          variant="danger"
          className="w-full h-20 flex items-center justify-center text-3xl"
          onClick={() => handleAddTransaction("expense")}
        >
          −
        </Button>
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

