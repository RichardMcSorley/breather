"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");

  useEffect(() => {
    if (session?.user?.id) {
      fetchSummary();
    }
  }, [session]);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/summary");
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="grid grid-cols-1 gap-4 mb-6">
        {summary && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">TODAY&apos;S EARNINGS</h2>
              <span
                className={`text-3xl font-semibold ${
                  (summary.todayNet ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(summary.todayNet ?? 0)}
              </span>
            </div>

            <div className="border-t pt-4 mb-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-900">GROSS TOTAL</span>
                <span className="font-semibold text-gray-900">{formatCurrency(summary.grossTotal ?? 0)}</span>
              </div>

              <div className="flex justify-between items-center text-red-600">
                <span>- TODAY MILEAGE</span>
                <span>{summary ? `${formatMiles(summary.todayMileageMiles ?? 0)} mi` : "0 mi"}</span>
              </div>

              <div className="flex justify-between items-center text-red-600">
                <span>- MILEAGE ({summary?.irsMileageRate?.toFixed(2) ?? "0.00"}/mi)</span>
                <span>{formatCurrency(summary.todayMileageSavings ?? 0)}</span>
              </div>
            </div>

            <div className="space-y-3 text-gray-700">
              <div className="flex justify-between items-center">
                <span>Income</span>
                <span className="font-medium">{formatCurrency(summary.todayIncome ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center text-red-600">
                <span>Expenses</span>
                <span>- {formatCurrency(summary.todayExpenses ?? 0)}</span>
              </div>
            </div>

            <div className="text-xs text-gray-500 mt-4">
              Bills are excluded from today&apos;s totals.
            </div>

            <div className="border-t pt-3 mt-4">
              <div className="flex justify-between items-center font-bold">
                <span className="text-gray-900">FREE CASH</span>
                <span className={(summary.freeCash ?? 0) >= 0 ? "text-green-600" : "text-red-600"}>
                  {formatCurrency(summary.freeCash ?? 0)}
                </span>
              </div>
            </div>
          </Card>
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

