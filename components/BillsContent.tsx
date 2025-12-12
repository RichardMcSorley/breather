"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { 
  useBills, 
  useBillPayments, 
  usePaymentPlan,
  useCreateBill,
  useUpdateBill,
  useDeleteBill,
  useCreateBillPayment,
  useUpdateBillPayment,
  useDeleteBillPayment,
  useDeleteAllBillPayments
} from "@/hooks/useQueries";

interface Bill {
  _id: string;
  name: string;
  amount: number;
  dueDate: number;
  company?: string;
  category?: string;
  notes?: string;
  isActive: boolean;
  useInPlan: boolean;
  lastAmount: number;
}

interface PaymentPlanEntry {
  date: string;
  bill: string;
  billId: string;
  payment: number;
  remainingBalance: number;
  dueDate?: string;
}

// Helper function to get today's date in user's local timezone (YYYY-MM-DD format)
const getTodayLocalDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function BillsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentPlanModal, setShowPaymentPlanModal] = useState(false);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedPlanEntry, setSelectedPlanEntry] = useState<PaymentPlanEntry | null>(null);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [viewMode, setViewMode] = useState<"bills" | "plan">("bills");
  const [hidePaidEntries, setHidePaidEntries] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bills_hide_paid_entries");
      return saved === "true";
    }
    return false;
  });
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    dueDate: "",
    company: "",
    category: "",
    notes: "",
    isActive: true,
    useInPlan: true,
  });
  const [markPaidData, setMarkPaidData] = useState({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Get payment plan config from localStorage
  const [paymentPlanConfig, setPaymentPlanConfig] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const savedConfig = localStorage.getItem("bills_payment_plan_config");
        if (savedConfig) {
          return JSON.parse(savedConfig);
        }
      } catch {
        // Ignore parse errors
      }
    }
    return {
      startDate: getTodayLocalDate(),
      dailyPayment: "100",
    };
  });

  // Queries
  const { data: billsData, isLoading: loading } = useBills();
  const { data: paymentsData } = useBillPayments();
  // Enable payment plan query if we have a valid config (regardless of viewMode)
  // This ensures the plan persists across page refreshes
  const hasValidConfig = !!paymentPlanConfig.startDate && !!paymentPlanConfig.dailyPayment && parseFloat(paymentPlanConfig.dailyPayment) > 0;
  const { data: paymentPlanData } = usePaymentPlan(
    paymentPlanConfig.startDate,
    parseFloat(paymentPlanConfig.dailyPayment),
    hasValidConfig
  );

  const bills = billsData?.bills || [];
  const paymentPlan = paymentPlanData?.paymentPlan || [];
  const groupedPaymentPlan = paymentPlanData?.groupedByDate || {};

  // Mutations
  const createBill = useCreateBill();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();
  const createBillPayment = useCreateBillPayment();
  const updateBillPayment = useUpdateBillPayment();
  const deleteBillPayment = useDeleteBillPayment();
  const deleteAllBillPayments = useDeleteAllBillPayments();

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

  const allPayments = paymentsData?.payments || [];
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  
  // Track if we've already done the initial auto-switch to plan view
  const hasAutoSwitchedRef = useRef(false);

  // Auto-switch to plan view once on initial load if we have a saved config and plan data
  useEffect(() => {
    // Only auto-switch once, and only if we haven't already done it
    if (hasAutoSwitchedRef.current) return;
    
    // Don't run if modal is open - user might be editing the config
    if (showPaymentPlanModal) return;
    
    if (bills.length > 0 && !loading && paymentPlan.length > 0 && viewMode === "bills") {
      // If we have a saved config and plan data exists, switch to plan view
      const savedConfig = localStorage.getItem("bills_payment_plan_config");
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          if (config.startDate && config.dailyPayment) {
            // Only auto-switch if we actually have plan data
            setViewMode("plan");
            hasAutoSwitchedRef.current = true;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [bills.length, loading, paymentPlan.length, viewMode, showPaymentPlanModal]);

  const savePaymentPlanConfig = (config: { startDate: string; dailyPayment: string }) => {
    try {
      localStorage.setItem("bills_payment_plan_config", JSON.stringify(config));
      setPaymentPlanConfig(config);
    } catch (error) {
      console.error("Error saving payment plan config:", error);
    }
  };


  const handleAddBill = () => {
    setFormData({
      name: "",
      amount: "",
      dueDate: "",
      company: "",
      category: "",
      notes: "",
      isActive: true,
      useInPlan: true,
    });
    setShowAddModal(true);
  };

  const handleEditBill = (bill: Bill) => {
    setEditingBill(bill);
    setFormData({
      name: bill.name,
      amount: bill.amount.toString(),
      dueDate: bill.dueDate.toString(),
      company: bill.company || "",
      category: bill.category || "",
      notes: bill.notes || "",
      isActive: bill.isActive,
      useInPlan: bill.useInPlan ?? true,
    });
    setShowEditModal(true);
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = !!editingBill;

    const requestBody: any = {
      name: formData.name,
      amount: parseFloat(formData.amount),
      dueDate: parseInt(formData.dueDate),
      isActive: true, // Always active since we removed the UI control
      useInPlan: formData.useInPlan,
    };
    
    // Include optional fields - send empty string if empty, not undefined
    if (formData.company !== undefined) {
      requestBody.company = formData.company.trim() || "";
    }
    if (formData.category !== undefined) {
      requestBody.category = formData.category.trim() || "";
    }
    if (formData.notes !== undefined) {
      requestBody.notes = formData.notes.trim() || "";
    }

    if (isEditing && editingBill) {
      updateBill.mutate(
        { id: editingBill._id, ...requestBody },
        {
          onSuccess: () => {
            setShowAddModal(false);
            setShowEditModal(false);
            setEditingBill(null);
          },
        }
      );
    } else {
      createBill.mutate(requestBody, {
        onSuccess: () => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingBill(null);
        },
      });
    }
  };

  const handleToggleUseInPlan = (bill: Bill) => {
    const currentValue = bill.useInPlan ?? true;
    updateBill.mutate({
      id: bill._id,
      useInPlan: !currentValue,
    });
  };

  const handleDeleteBill = (id: string) => {
    if (!confirm("Are you sure you want to delete this bill?")) {
      return;
    }
    deleteBill.mutate(id);
  };

  const handleGeneratePaymentPlan = () => {
    // Warn user if they have existing payments
    if (paymentPlan.length > 0) {
      const hasPayments = Object.keys(paidPayments).length > 0;
      if (hasPayments) {
        const confirmed = confirm(
          "Generating a new plan will reset all progress and delete all existing payment records. This cannot be undone. Continue?"
        );
        if (!confirmed) {
          return;
        }
        
        // Clear all existing payments
        deleteAllBillPayments.mutate(undefined, {
          onSuccess: () => {
            savePaymentPlanConfig(paymentPlanConfig);
            // Invalidate payment plan queries to refresh the plan list
            queryClient.invalidateQueries({ queryKey: ["paymentPlan"] });
            setViewMode("plan");
            setShowPaymentPlanModal(false);
          },
        });
        return;
      }
    }
    
    // Save config before generating
    savePaymentPlanConfig(paymentPlanConfig);
    // Invalidate payment plan queries to refresh the plan list
    queryClient.invalidateQueries({ queryKey: ["paymentPlan"] });
    setViewMode("plan");
    setShowPaymentPlanModal(false);
  };

  const handleMarkPaid = (bill: Bill) => {
    setSelectedBill(bill);
    setSelectedPlanEntry(null);
    setMarkPaidData({
      amount: bill.amount.toString(),
      paymentDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setShowMarkPaidModal(true);
  };

  const handlePayFromPlan = (entry: PaymentPlanEntry) => {
    // Find the bill by ID
    const bill = bills.find((b: Bill) => b._id === entry.billId);
    if (bill) {
      setSelectedBill(bill);
      setSelectedPlanEntry(entry);
      setEditingPayment(null);
      setMarkPaidData({
        amount: entry.payment.toString(),
        paymentDate: entry.date,
        notes: "",
      });
      setShowMarkPaidModal(true);
    }
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    const paymentData = {
      billId: selectedBill._id,
      amount: parseFloat(markPaidData.amount),
      paymentDate: markPaidData.paymentDate,
      notes: markPaidData.notes || undefined,
    };

    if (editingPayment) {
      updateBillPayment.mutate(
        { id: editingPayment._id, ...paymentData },
        {
          onSuccess: () => {
            setShowMarkPaidModal(false);
            setSelectedBill(null);
            setSelectedPlanEntry(null);
            setEditingPayment(null);
          },
        }
      );
    } else {
      createBillPayment.mutate(paymentData, {
        onSuccess: () => {
          setShowMarkPaidModal(false);
          setSelectedBill(null);
          setSelectedPlanEntry(null);
          setEditingPayment(null);
        },
      });
    }
  };

  const handleEditPayment = (payment: any) => {
    const billId = payment.billId?._id || payment.billId?.toString() || payment.billId;
    const bill = bills.find((b: Bill) => b._id === billId);
    if (bill) {
      setSelectedBill(bill);
      setEditingPayment(payment);
      setSelectedPlanEntry(null);
      setMarkPaidData({
        amount: payment.amount.toString(),
        paymentDate: payment.paymentDate,
        notes: payment.notes || "",
      });
      setShowMarkPaidModal(true);
    }
  };

  const handleDeletePayment = (paymentId: string) => {
    if (!confirm("Are you sure you want to delete this payment?")) {
      return;
    }
    deleteBillPayment.mutate(paymentId);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    // Parse YYYY-MM-DD as local date to avoid timezone issues
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 space-y-2">
        {/* First row: + Add Bill on the right */}
        <div className="flex justify-end gap-2">
          <Button variant="primary" onClick={handleAddBill} className="text-sm px-3 py-2">
            + Add Bill
          </Button>
        </div>
        
        {/* Second row: Generate Plan and View Bills on left, Show All on right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {bills.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPaymentPlanConfig({
                      ...paymentPlanConfig,
                      startDate: getTodayLocalDate(),
                    });
                    setShowPaymentPlanModal(true);
                  }}
                  className="text-sm px-3 py-2"
                >
                  Generate Plan
                </Button>
                {paymentPlan.length > 0 && (
                  <Button 
                    variant={viewMode === "plan" ? "primary" : "outline"}
                    onClick={() => setViewMode(viewMode === "bills" ? "plan" : "bills")}
                    className="text-sm px-3 py-2"
                  >
                    {viewMode === "bills" ? "View Plan" : "View Bills"}
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {viewMode === "plan" && paymentPlan.length > 0 && (
              <button
                onClick={() => {
                  const newValue = !hidePaidEntries;
                  setHidePaidEntries(newValue);
                  localStorage.setItem("bills_hide_paid_entries", newValue.toString());
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium min-h-[44px] ${
                  hidePaidEntries
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {hidePaidEntries ? "Show All" : "Hide Paid"}
              </button>
            )}
          </div>
        </div>
      </div>

      {viewMode === "bills" ? (
        <Card className="overflow-hidden">
          {bills.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No bills found. Add your first recurring bill!
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[640px]">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Use
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Bill Name
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                      Company
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden md:table-cell">
                      Category
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">
                      Notes
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {bills.map((bill: Bill) => (
                    <tr
                      key={bill._id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bill.useInPlan ?? true}
                            onChange={() => handleToggleUseInPlan(bill)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            title="Use in payment plan"
                          />
                        </label>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                        <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                          {bill.name}
                        </div>
                        {bill.company && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 sm:hidden mt-0.5">
                            {bill.company}
                          </div>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap hidden sm:table-cell">
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {bill.company || "-"}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          Day {bill.dueDate}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                        <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                          {formatCurrency(bill.lastAmount)}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap hidden md:table-cell">
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {bill.category || "-"}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 hidden lg:table-cell">
                        <div className="text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                          {bill.notes || "-"}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => handleEditBill(bill)}
                            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBill(bill._id)}
                            className="p-1.5 sm:p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.keys(groupedPaymentPlan).length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No payment plan generated. Click &quot;Generate Plan&quot; to create one.
            </div>
          ) : (
            <>
              {Object.entries(groupedPaymentPlan)
              .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
              .map(([date, entries]) => {
                const typedEntries = entries as PaymentPlanEntry[];
                // Filter out fully paid entries only if hidePaidEntries filter is active
                const filteredEntries = hidePaidEntries
                  ? typedEntries.filter((entry: PaymentPlanEntry) => {
                      const paymentKey = `${entry.billId}-${entry.date}`;
                      const paidAmount = paidPayments[paymentKey] || 0;
                      return paidAmount < entry.payment;
                    })
                  : typedEntries;

                // Don't render the card if all entries are filtered out
                if (filteredEntries.length === 0) {
                  return null;
                }

                return (
                <Card key={date} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      {formatDate(date)}
                    </h3>
                    {filteredEntries.length > 0 && filteredEntries[0].dueDate && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Due: {formatDate(filteredEntries[0].dueDate)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {filteredEntries.map((entry: PaymentPlanEntry, idx: number) => {
                      const paymentKey = `${entry.billId}-${entry.date}`;
                      const paidAmount = paidPayments[paymentKey] || 0;
                      const remainingToPay = Math.max(0, entry.payment - paidAmount);
                      const isPaid = paidAmount >= entry.payment;
                      const progressPercent = entry.payment > 0 ? (paidAmount / entry.payment) * 100 : 0;
                      
                      // Get individual payments for this entry
                      const entryPayments = allPayments.filter((payment: any) => {
                        const billId = payment.billId?._id || payment.billId?.toString() || payment.billId;
                        return billId === entry.billId && payment.paymentDate === entry.date;
                      });
                      
                      return (
                        <div
                          key={`${entry.date}-${entry.billId}-${idx}`}
                          className={`py-3 border-b border-gray-200 dark:border-gray-700 last:border-0 ${
                            isPaid ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {entry.bill}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                Remaining: {formatCurrency(entry.remainingBalance)}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {isPaid ? (
                                <div className="text-right">
                                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                    {formatCurrency(entry.payment)}
                                  </div>
                                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                    ✓ Paid
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                                      {formatCurrency(remainingToPay)}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      of {formatCurrency(entry.payment)}
                                    </div>
                                  </div>
                                  <Button
                                    variant="primary"
                                    onClick={() => handlePayFromPlan(entry)}
                                    className="min-h-[44px]"
                                  >
                                    Pay
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
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
                          {/* Show individual payments with edit/delete */}
                          {entryPayments.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                Payments:
                              </div>
                              <div className="space-y-2">
                                {entryPayments.map((payment: any) => (
                                  <div
                                    key={payment._id}
                                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded p-2"
                                  >
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(payment.amount)}
                                      </div>
                                      {payment.notes && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          {payment.notes}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleEditPayment(payment)}
                                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                        title="Edit payment"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeletePayment(payment._id)}
                                        className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                        title="Delete payment"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
                );
              })
              .filter(Boolean)}
            </>
          )}
        </div>
      )}

      {showAddModal && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add Recurring Bill"
        >
          <form onSubmit={handleSaveBill} className="space-y-4">
            <Input
              label="Bill Name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Car Loan, Rent"
            />
            <Input
              label="Company"
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="e.g., Bridgecrest, Rocket Mortgage"
            />
            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
            />
            <Input
              label="Due Date (Day of Month)"
              type="number"
              min="1"
              max="31"
              required
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              placeholder="1-31"
            />
            <Input
              label="Category (optional)"
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Utilities, Housing"
            />
            <Input
              label="Notes (optional)"
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any notes..."
            />
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                Add Bill
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showEditModal && editingBill && (
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingBill(null);
          }}
          title="Edit Bill"
        >
          <form onSubmit={handleSaveBill} className="space-y-4">
            <Input
              label="Bill Name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <Input
              label="Company"
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            />
            <Input
              label="Due Date (Day of Month)"
              type="number"
              min="1"
              max="31"
              required
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            />
            <Input
              label="Category (optional)"
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
            <Input
              label="Notes (optional)"
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingBill(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                Update Bill
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showPaymentPlanModal && (
        <Modal
          isOpen={showPaymentPlanModal}
          onClose={() => setShowPaymentPlanModal(false)}
          title="Generate Payment Plan"
        >
          <form onSubmit={(e) => { e.preventDefault(); handleGeneratePaymentPlan(); }} className="space-y-4">
            <Input
              label="Start Date"
              type="date"
              required
              value={paymentPlanConfig.startDate}
              onChange={(e) =>
                setPaymentPlanConfig({ ...paymentPlanConfig, startDate: e.target.value })
              }
            />
            <Input
              label="Daily Payment Amount ($)"
              type="number"
              step="0.01"
              required
              value={paymentPlanConfig.dailyPayment}
              onChange={(e) =>
                setPaymentPlanConfig({ ...paymentPlanConfig, dailyPayment: e.target.value })
              }
              placeholder="100.00"
            />
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowPaymentPlanModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                Generate Plan
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showMarkPaidModal && selectedBill && (
        <Modal
          isOpen={showMarkPaidModal}
          onClose={() => {
            setShowMarkPaidModal(false);
            setSelectedBill(null);
            setSelectedPlanEntry(null);
            setEditingPayment(null);
          }}
          title={editingPayment ? `Edit Payment` : selectedPlanEntry ? `Pay ${selectedBill.name}` : `Mark ${selectedBill.name} as Paid`}
        >
          <form onSubmit={handleSavePayment} className="space-y-4">
            <Input
              label="Payment Amount ($)"
              type="number"
              step="0.01"
              required
              value={markPaidData.amount}
              onChange={(e) =>
                setMarkPaidData({ ...markPaidData, amount: e.target.value })
              }
            />
            {selectedPlanEntry && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Planned amount: {formatCurrency(selectedPlanEntry.payment)}
              </div>
            )}
            <Input
              label="Payment Date"
              type="date"
              required
              value={markPaidData.paymentDate}
              onChange={(e) =>
                setMarkPaidData({ ...markPaidData, paymentDate: e.target.value })
              }
            />
            <Input
              label="Notes (optional)"
              type="text"
              value={markPaidData.notes}
              onChange={(e) =>
                setMarkPaidData({ ...markPaidData, notes: e.target.value })
              }
              placeholder="Add any notes..."
            />
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowMarkPaidModal(false);
                  setSelectedBill(null);
                  setSelectedPlanEntry(null);
                  setEditingPayment(null);
                }}
              >
                Cancel
              </Button>
            <Button type="submit" variant="primary" className="flex-1">
              {editingPayment ? "Update Payment" : "Record Payment"}
            </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
