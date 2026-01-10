"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Pencil, Trash2, ChevronDown, ChevronRight, Plus, TrendingUp, Receipt, Wallet, Calendar, Target, Clock, Settings2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  useIOUs,
  useIOUPayments,
  useIOUSummary,
  useCreateIOU,
  useUpdateIOU,
  useDeleteIOU,
  useCreateIOUPayment,
  useUpdateIOUPayment,
  useDeleteIOUPayment,
  useDailyRateAgreements,
  useCreateDailyRateAgreement,
  useUpdateDailyRateAgreement,
  useDeleteDailyRateAgreement,
} from "@/hooks/useQueries";
import { IOUResponse, IOUPaymentResponse, IOUSummary, DailyRateAgreementResponse, DailyRateAgreementStatus, DailyRateDay } from "@/lib/types";

const getTodayLocalDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
};

// Generate a consistent color for a person based on their name
const getPersonColor = (name: string): { bg: string; text: string; gradient: string } => {
  const colors = [
    { bg: "bg-emerald-500", text: "text-emerald-500", gradient: "from-emerald-500 to-teal-400" },
    { bg: "bg-blue-500", text: "text-blue-500", gradient: "from-blue-500 to-cyan-400" },
    { bg: "bg-violet-500", text: "text-violet-500", gradient: "from-violet-500 to-purple-400" },
    { bg: "bg-amber-500", text: "text-amber-500", gradient: "from-amber-500 to-orange-400" },
    { bg: "bg-rose-500", text: "text-rose-500", gradient: "from-rose-500 to-pink-400" },
    { bg: "bg-indigo-500", text: "text-indigo-500", gradient: "from-indigo-500 to-blue-400" },
  ];
  const index = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
};

const getInitials = (name: string): string => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export default function IOUsContent() {
  const { data: session } = useSession();
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());
  const [showAddIOUModal, setShowAddIOUModal] = useState(false);
  const [showEditIOUModal, setShowEditIOUModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [showQuickPaymentModal, setShowQuickPaymentModal] = useState(false);
  const [selectedIOU, setSelectedIOU] = useState<IOUResponse | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<IOUPaymentResponse | null>(null);
  const [selectedPersonName, setSelectedPersonName] = useState<string>("");

  const [iouFormData, setIOUFormData] = useState({
    personName: "",
    description: "",
    amount: "",
    date: getTodayLocalDate(),
    notes: "",
  });

  const [paymentFormData, setPaymentFormData] = useState({
    amount: "",
    paymentDate: getTodayLocalDate(),
    notes: "",
    isAgreementPayment: false,
  });

  // Daily Rate Agreement state
  const [showAddAgreementModal, setShowAddAgreementModal] = useState(false);
  const [showEditAgreementModal, setShowEditAgreementModal] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<DailyRateAgreementResponse | null>(null);
  const [agreementFormData, setAgreementFormData] = useState({
    personName: "",
    dailyRate: "",
    startDate: getTodayLocalDate(),
    notes: "",
  });

  // Queries
  const { data: iousData, isLoading: loadingIOUs } = useIOUs();
  const { data: paymentsData } = useIOUPayments();
  const { data: summaryData } = useIOUSummary();
  const { data: agreementsData } = useDailyRateAgreements(true);

  const ious = iousData?.ious || [];
  const payments = paymentsData?.payments || [];
  const summary = summaryData?.summary || [];
  const agreementStatuses = agreementsData?.statuses || [];

  // Mutations
  const createIOU = useCreateIOU();
  const createAgreement = useCreateDailyRateAgreement();
  const updateAgreement = useUpdateDailyRateAgreement();
  const deleteAgreement = useDeleteDailyRateAgreement();
  const updateIOU = useUpdateIOU();
  const deleteIOU = useDeleteIOU();
  const createIOUPayment = useCreateIOUPayment();
  const updateIOUPayment = useUpdateIOUPayment();
  const deleteIOUPayment = useDeleteIOUPayment();

  // Get unique person names for autocomplete (from IOUs and agreements)
  const personNames = useMemo(() => {
    const names = new Set<string>();
    ious.forEach((iou: IOUResponse) => names.add(iou.personName));
    agreementStatuses.forEach((status: DailyRateAgreementStatus) => names.add(status.agreement.personName));
    return Array.from(names).sort();
  }, [ious, agreementStatuses]);

  // Group IOUs by person
  const iousByPerson = useMemo(() => {
    const grouped: Record<string, IOUResponse[]> = {};
    ious.forEach((iou: IOUResponse) => {
      if (!grouped[iou.personName]) {
        grouped[iou.personName] = [];
      }
      grouped[iou.personName].push(iou);
    });
    return grouped;
  }, [ious]);

  // Group regular payments by person (exclude agreement payments)
  const paymentsByPerson = useMemo(() => {
    const grouped: Record<string, IOUPaymentResponse[]> = {};
    payments
      .filter((payment: IOUPaymentResponse) => !payment.isAgreementPayment)
      .forEach((payment: IOUPaymentResponse) => {
        if (!grouped[payment.personName]) {
          grouped[payment.personName] = [];
        }
        grouped[payment.personName].push(payment);
      });
    return grouped;
  }, [payments]);

  // Group agreement payments by person
  const agreementPaymentsByPerson = useMemo(() => {
    const grouped: Record<string, IOUPaymentResponse[]> = {};
    payments
      .filter((payment: IOUPaymentResponse) => payment.isAgreementPayment)
      .forEach((payment: IOUPaymentResponse) => {
        if (!grouped[payment.personName]) {
          grouped[payment.personName] = [];
        }
        grouped[payment.personName].push(payment);
      });
    return grouped;
  }, [payments]);

  const togglePerson = (personName: string) => {
    setExpandedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personName)) {
        next.delete(personName);
      } else {
        next.add(personName);
      }
      return next;
    });
  };

  const toggleAgreement = (agreementId: string) => {
    setExpandedAgreements((prev) => {
      const next = new Set(prev);
      if (next.has(agreementId)) {
        next.delete(agreementId);
      } else {
        next.add(agreementId);
      }
      return next;
    });
  };

  const handleAddIOU = () => {
    setIOUFormData({
      personName: "",
      description: "",
      amount: "",
      date: getTodayLocalDate(),
      notes: "",
    });
    setShowAddIOUModal(true);
  };

  const handleEditIOU = (iou: IOUResponse) => {
    setSelectedIOU(iou);
    setIOUFormData({
      personName: iou.personName,
      description: iou.description,
      amount: iou.amount.toString(),
      date: iou.date,
      notes: iou.notes || "",
    });
    setShowEditIOUModal(true);
  };

  const handleAddPayment = (personName: string, forAgreement: boolean = false) => {
    setSelectedPersonName(personName);
    const personIOUs = iousByPerson[personName] || [];
    if (personIOUs.length > 0) {
      setSelectedIOU(personIOUs[0]);
    }
    setPaymentFormData({
      amount: "",
      paymentDate: getTodayLocalDate(),
      notes: "",
      isAgreementPayment: forAgreement,
    });
    setShowAddPaymentModal(true);
  };

  const handleEditPayment = (payment: IOUPaymentResponse) => {
    setSelectedPayment(payment);
    setPaymentFormData({
      amount: payment.amount.toString(),
      paymentDate: payment.paymentDate,
      notes: payment.notes || "",
      isAgreementPayment: payment.isAgreementPayment || false,
    });
    setShowEditPaymentModal(true);
  };

  const submitIOU = async () => {
    const amount = parseFloat(iouFormData.amount);
    if (!iouFormData.personName || !iouFormData.description || isNaN(amount) || !iouFormData.date) {
      return;
    }

    if (selectedIOU) {
      await updateIOU.mutateAsync({
        id: selectedIOU._id,
        personName: iouFormData.personName,
        description: iouFormData.description,
        amount,
        date: iouFormData.date,
        notes: iouFormData.notes || undefined,
      });
    } else {
      await createIOU.mutateAsync({
        personName: iouFormData.personName,
        description: iouFormData.description,
        amount,
        date: iouFormData.date,
        notes: iouFormData.notes || undefined,
      });
    }

    setShowAddIOUModal(false);
    setShowEditIOUModal(false);
    setSelectedIOU(null);
  };

  const submitPayment = async () => {
    const amount = parseFloat(paymentFormData.amount);
    if (!selectedIOU || isNaN(amount) || !paymentFormData.paymentDate) {
      return;
    }

    if (selectedPayment) {
      await updateIOUPayment.mutateAsync({
        id: selectedPayment._id,
        amount,
        paymentDate: paymentFormData.paymentDate,
        notes: paymentFormData.notes || undefined,
        isAgreementPayment: paymentFormData.isAgreementPayment,
      });
    } else {
      await createIOUPayment.mutateAsync({
        iouId: selectedIOU._id,
        personName: selectedPersonName || selectedIOU.personName,
        amount,
        paymentDate: paymentFormData.paymentDate,
        notes: paymentFormData.notes || undefined,
        isAgreementPayment: paymentFormData.isAgreementPayment,
      });
    }

    setShowAddPaymentModal(false);
    setShowEditPaymentModal(false);
    setSelectedPayment(null);
    setSelectedIOU(null);
  };

  const handleDeleteIOU = async (iou: IOUResponse) => {
    if (confirm(`Delete "${iou.description}" for ${iou.personName}?`)) {
      await deleteIOU.mutateAsync(iou._id);
    }
  };

  const handleDeletePayment = async (payment: IOUPaymentResponse) => {
    if (confirm(`Delete this payment of ${formatCurrency(payment.amount)}?`)) {
      await deleteIOUPayment.mutateAsync(payment._id);
    }
  };

  // Agreement handlers
  const handleAddAgreement = () => {
    setAgreementFormData({
      personName: "",
      dailyRate: "",
      startDate: getTodayLocalDate(),
      notes: "",
    });
    setShowAddAgreementModal(true);
  };

  const handleEditAgreement = (agreement: DailyRateAgreementResponse) => {
    setSelectedAgreement(agreement);
    setAgreementFormData({
      personName: agreement.personName,
      dailyRate: agreement.dailyRate.toString(),
      startDate: agreement.startDate,
      notes: agreement.notes || "",
    });
    setShowEditAgreementModal(true);
  };

  const submitAgreement = async () => {
    const dailyRate = parseFloat(agreementFormData.dailyRate);
    if (!agreementFormData.personName || isNaN(dailyRate) || !agreementFormData.startDate) {
      return;
    }

    if (selectedAgreement) {
      await updateAgreement.mutateAsync({
        id: selectedAgreement._id,
        personName: agreementFormData.personName,
        dailyRate,
        startDate: agreementFormData.startDate,
        notes: agreementFormData.notes || undefined,
      });
    } else {
      await createAgreement.mutateAsync({
        personName: agreementFormData.personName,
        dailyRate,
        startDate: agreementFormData.startDate,
        notes: agreementFormData.notes || undefined,
      });
    }

    setShowAddAgreementModal(false);
    setShowEditAgreementModal(false);
    setSelectedAgreement(null);
  };

  const handleDeleteAgreement = async (agreement: DailyRateAgreementResponse) => {
    if (confirm(`Delete the daily rate agreement for ${agreement.personName}?`)) {
      await deleteAgreement.mutateAsync(agreement._id);
    }
  };

  const submitQuickPayment = async () => {
    const amount = parseFloat(paymentFormData.amount);
    if (!selectedPersonName || isNaN(amount) || !paymentFormData.paymentDate) {
      return;
    }

    // Find an IOU for this person to link the payment to
    const personIOUs = iousByPerson[selectedPersonName] || [];
    let iouId: string;

    if (personIOUs.length > 0) {
      iouId = personIOUs[0]._id;
    } else {
      // Create a placeholder IOU for this person
      const placeholderIOU = await createIOU.mutateAsync({
        personName: selectedPersonName,
        description: "Daily Rate Payments",
        amount: 0,
        date: paymentFormData.paymentDate,
      });
      iouId = placeholderIOU._id;
    }

    await createIOUPayment.mutateAsync({
      iouId,
      personName: selectedPersonName,
      amount,
      paymentDate: paymentFormData.paymentDate,
      notes: paymentFormData.notes || undefined,
      isAgreementPayment: paymentFormData.isAgreementPayment,
    });

    setShowQuickPaymentModal(false);
    setSelectedPersonName("");
  };

  // Calculate total balance across all people (IOUs + Daily Rate Agreements)
  const totalBalance = useMemo(() => {
    const iouBalance = summary.reduce((sum: number, s: IOUSummary) => sum + s.balance, 0);
    const agreementBalance = agreementStatuses.reduce((sum: number, s: DailyRateAgreementStatus) => sum + s.runningBalance, 0);
    return iouBalance + agreementBalance;
  }, [summary, agreementStatuses]);

  const totalPaid = useMemo(() => {
    const iouPaid = summary.reduce((sum: number, s: IOUSummary) => sum + s.totalPaid, 0);
    const agreementPaid = agreementStatuses.reduce((sum: number, s: DailyRateAgreementStatus) => sum + s.totalPaid, 0);
    return iouPaid + agreementPaid;
  }, [summary, agreementStatuses]);

  if (!session) {
    return (
      <div className="bg-white dark:bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50">
        <p className="text-gray-500 dark:text-gray-400">Please sign in to view IOUs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            IOUs
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Track money owed to you
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectedPersonName("");
              setSelectedIOU(null);
              setPaymentFormData({
                amount: "",
                paymentDate: getTodayLocalDate(),
                notes: "",
                isAgreementPayment: true, // Default to agreement payment from header
              });
              setShowQuickPaymentModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 text-gray-700 dark:text-gray-200 font-medium rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 text-emerald-500" />
            Payment
          </button>
          <button
            onClick={handleAddIOU}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/15 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            IOU
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {(summary.length > 0 || agreementStatuses.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {/* Total Owed Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-5 shadow-lg shadow-emerald-500/20 dark:shadow-emerald-500/10">
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-emerald-100 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">Owed to You</span>
              </div>
              <p className="text-3xl font-bold text-white tracking-tight">
                {formatCurrency(totalBalance)}
              </p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute right-3 top-3 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white/70" />
            </div>
          </div>

          {/* Total Collected Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-5 shadow-lg">
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Receipt className="w-4 h-4" />
                <span className="text-sm font-medium">Collected</span>
              </div>
              <p className="text-3xl font-bold text-white tracking-tight">
                {formatCurrency(totalPaid)}
              </p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
          </div>
        </div>
      )}

      {/* Daily Rate Agreements */}
      {agreementStatuses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Daily Rate Tracking
            </h2>
            <button
              onClick={handleAddAgreement}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Add Agreement
            </button>
          </div>

          {agreementStatuses.map((status: DailyRateAgreementStatus) => {
            const personColor = getPersonColor(status.agreement.personName);
            const isAhead = status.daysAhead > 0;
            const isBehind = status.daysAhead < 0;
            const daysLabel = Math.abs(status.daysAhead);

            return (
              <div
                key={status.agreement._id}
                className="relative overflow-hidden bg-gradient-to-br from-violet-500/5 to-purple-500/5 dark:from-violet-500/10 dark:to-purple-500/10 rounded-2xl border border-violet-200 dark:border-violet-800/50"
              >
                {/* Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${personColor.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
                        <span className="text-white font-bold text-xs">
                          {getInitials(status.agreement.personName)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {status.agreement.personName}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatCurrency(status.agreement.dailyRate)}/day · Since {formatDate(status.agreement.startDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditAgreement(status.agreement)}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAgreement(status.agreement)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Running Balance */}
                <div className="px-4 pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                        <Target className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Running Balance</span>
                      </div>
                      <p className={`text-2xl font-bold tabular-nums ${
                        status.runningBalance > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : status.runningBalance < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-600 dark:text-gray-300"
                      }`}>
                        {status.runningBalance > 0 ? "" : status.runningBalance < 0 ? "+" : ""}
                        {formatCurrency(Math.abs(status.runningBalance))}
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        isAhead
                          ? "text-emerald-600 dark:text-emerald-400"
                          : isBehind
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-gray-500 dark:text-gray-400"
                      }`}>
                        {isAhead
                          ? `${daysLabel} day${daysLabel !== 1 ? "s" : ""} ahead`
                          : isBehind
                          ? `${daysLabel} day${daysLabel !== 1 ? "s" : ""} behind`
                          : "On track"}
                      </p>
                    </div>

                    <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">This Month</span>
                      </div>
                      <p className={`text-2xl font-bold tabular-nums ${
                        status.currentMonthBalance > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : status.currentMonthBalance < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-600 dark:text-gray-300"
                      }`}>
                        {status.currentMonthBalance > 0 ? "" : status.currentMonthBalance < 0 ? "+" : ""}
                        {formatCurrency(Math.abs(status.currentMonthBalance))}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        of {formatCurrency(status.currentMonthExpected)} expected
                      </p>
                    </div>
                  </div>
                </div>

                {/* IOU Debt Notice */}
                {status.iouDebt > 0 && (
                  <div className="px-4 pb-3">
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400">
                      <span className="font-medium">{formatCurrency(status.iouDebt)}</span> in IOUs must be paid off before payments count here
                    </div>
                  </div>
                )}

                {/* Stats Row / Toggle */}
                <div className="px-4 pb-2">
                  <button
                    onClick={() => toggleAgreement(status.agreement._id)}
                    className="w-full flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-white/40 dark:bg-gray-800/40 hover:bg-white/60 dark:hover:bg-gray-800/60 rounded-lg p-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{status.daysElapsed} days tracked</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>
                        Expected: <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(status.expectedTotal)}</span>
                      </span>
                      <span>
                        Paid: <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(status.totalPaid)}</span>
                      </span>
                      <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        expandedAgreements.has(status.agreement._id) ? "bg-violet-100 dark:bg-violet-900/30" : ""
                      }`}>
                        {expandedAgreements.has(status.agreement._id) ? (
                          <ChevronDown className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </button>
                </div>

                {/* Agreement Payments */}
                {expandedAgreements.has(status.agreement._id) && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Payments
                      </h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddPayment(status.agreement.personName, true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Payment
                      </button>
                    </div>
                    {(agreementPaymentsByPerson[status.agreement.personName] || []).length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
                        No payments recorded yet
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {(agreementPaymentsByPerson[status.agreement.personName] || []).map((payment: IOUPaymentResponse) => (
                          <div
                            key={payment._id}
                            className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800/30 group"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-violet-700 dark:text-violet-400">
                                +{formatCurrency(payment.amount)}
                              </p>
                              <p className="text-sm text-violet-600/70 dark:text-violet-500/70">
                                {formatDate(payment.paymentDate)}
                                {payment.notes && <span> · {payment.notes}</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 ml-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditPayment(payment);
                                }}
                                className="p-2 text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(payment);
                                }}
                                className="p-2 text-violet-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Daily Breakdown */}
                {expandedAgreements.has(status.agreement._id) && status.dailyBreakdown && (
                  <div className="px-4 pb-4">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Day Breakdown
                    </h4>
                    <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700/50">
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                            <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              <th className="text-left py-2 px-3 font-medium">Day</th>
                              <th className="text-left py-2 px-3 font-medium">Date</th>
                              <th className="text-right py-2 px-3 font-medium">Rate</th>
                              <th className="text-right py-2 px-3 font-medium">Cumulative</th>
                              <th className="text-center py-2 px-3 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {status.dailyBreakdown.map((day: DailyRateDay) => (
                              <tr
                                key={day.date}
                                className={`${
                                  day.isPaid
                                    ? "bg-emerald-50/50 dark:bg-emerald-900/10"
                                    : ""
                                }`}
                              >
                                <td className="py-2 px-3 text-gray-600 dark:text-gray-300 font-medium">
                                  #{day.dayNumber}
                                </td>
                                <td className="py-2 px-3 text-gray-500 dark:text-gray-400">
                                  {formatDate(day.date)}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                                  {formatCurrency(day.expectedAmount)}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300 tabular-nums font-medium">
                                  {formatCurrency(day.cumulativeExpected)}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {day.isPaid ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      Paid
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      Owed
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {status.daysElapsed > 60 && (
                        <div className="text-xs text-center py-2 text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700/50">
                          Showing last 60 days of {status.daysElapsed} total
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Agreement Button (when no agreements exist) */}
      {agreementStatuses.length === 0 && !loadingIOUs && (
        <button
          onClick={handleAddAgreement}
          className="w-full p-4 border-2 border-dashed border-violet-200 dark:border-violet-800/50 rounded-2xl text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">Add Daily Rate Agreement</span>
        </button>
      )}

      {/* Loading State */}
      {loadingIOUs && (
        <div className="bg-white dark:bg-gray-800/50 backdrop-blur rounded-2xl p-8 border border-gray-200 dark:border-gray-700/50">
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading IOUs...</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loadingIOUs && summary.length === 0 && (
        <div className="bg-white dark:bg-gray-800/50 backdrop-blur rounded-2xl p-10 border border-gray-200 dark:border-gray-700/50 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-2xl flex items-center justify-center">
            <Wallet className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No IOUs yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
            Start tracking money owed to you by adding your first IOU.
          </p>
          <button
            onClick={handleAddIOU}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Add Your First IOU
          </button>
        </div>
      )}

      {/* Person Cards */}
      <div className="space-y-3">
        {summary.map((personSummary: IOUSummary) => {
          const isExpanded = expandedPersons.has(personSummary.personName);
          const personIOUs = iousByPerson[personSummary.personName] || [];
          const personPayments = paymentsByPerson[personSummary.personName] || [];
          const progressPercent = personSummary.totalOwed > 0
            ? Math.min(100, (personSummary.totalPaid / personSummary.totalOwed) * 100)
            : 0;
          const personColor = getPersonColor(personSummary.personName);
          const isPaidUp = personSummary.balance <= 0;

          return (
            <div
              key={personSummary.personName}
              className={`bg-white dark:bg-gray-800/50 backdrop-blur rounded-2xl border transition-all duration-200 ${
                isExpanded
                  ? "border-emerald-200 dark:border-emerald-800/50 shadow-lg shadow-emerald-500/5"
                  : "border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600/50"
              }`}
            >
              {/* Person Header */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer"
                onClick={() => togglePerson(personSummary.personName)}
              >
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${personColor.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
                  <span className="text-white font-bold text-sm">
                    {getInitials(personSummary.personName)}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {personSummary.personName}
                    </h3>
                    {isPaidUp && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
                        Settled
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {personSummary.iouCount} item{personSummary.iouCount !== 1 ? "s" : ""}
                    {personSummary.paymentCount > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {" "}· {personSummary.paymentCount} payment{personSummary.paymentCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                </div>

                {/* Balance & Chevron */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={`text-xl font-bold tabular-nums ${
                      personSummary.balance > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : personSummary.balance < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-400 dark:text-gray-500"
                    }`}>
                      {formatCurrency(Math.abs(personSummary.balance))}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {personSummary.balance > 0 ? "owes you" : personSummary.balance < 0 ? "you owe" : "settled"}
                    </p>
                  </div>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    isExpanded ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-gray-100 dark:bg-gray-700/50"
                  }`}>
                    {isExpanded ? (
                      <ChevronDown className={`w-5 h-5 ${isExpanded ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`} />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="px-4 pb-4">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>Paid: <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(personSummary.totalPaid)}</span></span>
                  <span>Total: <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(personSummary.totalOwed)}</span></span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${personColor.gradient} transition-all duration-500 ease-out`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-700/50 pt-4">
                  {/* IOUs Section */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Items Owed
                    </h4>
                    <div className="space-y-2">
                      {personIOUs.map((iou: IOUResponse) => (
                        <div
                          key={iou._id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {iou.description}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {formatDate(iou.date)}
                              {iou.notes && <span className="text-gray-400 dark:text-gray-500"> · {iou.notes}</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-3">
                            <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                              {formatCurrency(iou.amount)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditIOU(iou);
                              }}
                              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteIOU(iou);
                              }}
                              className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payments Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Payments Received
                      </h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddPayment(personSummary.personName);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Payment
                      </button>
                    </div>
                    {personPayments.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6 bg-gray-50 dark:bg-gray-700/20 rounded-xl">
                        No payments recorded yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {personPayments.map((payment: IOUPaymentResponse) => (
                          <div
                            key={payment._id}
                            className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30 group"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                                Payment received
                              </p>
                              <p className="text-sm text-emerald-600/70 dark:text-emerald-500/70">
                                {formatDate(payment.paymentDate)}
                                {payment.notes && <span> · {payment.notes}</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 ml-3">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                +{formatCurrency(payment.amount)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditPayment(payment);
                                }}
                                className="p-2 text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(payment);
                                }}
                                className="p-2 text-emerald-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add IOU Modal */}
      <Modal
        isOpen={showAddIOUModal}
        onClose={() => setShowAddIOUModal(false)}
        title="Add IOU"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowAddIOUModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitIOU}
              disabled={createIOU.isPending}
              className="flex-1"
            >
              {createIOU.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Input
              label="Person Name"
              value={iouFormData.personName}
              onChange={(e) => setIOUFormData({ ...iouFormData, personName: e.target.value })}
              placeholder="Who owes you?"
              list="person-names"
            />
            <datalist id="person-names">
              {personNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <Input
            label="Description"
            value={iouFormData.description}
            onChange={(e) => setIOUFormData({ ...iouFormData, description: e.target.value })}
            placeholder="What is this for?"
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={iouFormData.amount}
            onChange={(e) => setIOUFormData({ ...iouFormData, amount: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Date"
            type="date"
            value={iouFormData.date}
            onChange={(e) => setIOUFormData({ ...iouFormData, date: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={iouFormData.notes}
            onChange={(e) => setIOUFormData({ ...iouFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
        </div>
      </Modal>

      {/* Edit IOU Modal */}
      <Modal
        isOpen={showEditIOUModal}
        onClose={() => {
          setShowEditIOUModal(false);
          setSelectedIOU(null);
        }}
        title="Edit IOU"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditIOUModal(false);
                setSelectedIOU(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitIOU}
              disabled={updateIOU.isPending}
              className="flex-1"
            >
              {updateIOU.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Input
              label="Person Name"
              value={iouFormData.personName}
              onChange={(e) => setIOUFormData({ ...iouFormData, personName: e.target.value })}
              placeholder="Who owes you?"
              list="person-names-edit"
            />
            <datalist id="person-names-edit">
              {personNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <Input
            label="Description"
            value={iouFormData.description}
            onChange={(e) => setIOUFormData({ ...iouFormData, description: e.target.value })}
            placeholder="What is this for?"
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={iouFormData.amount}
            onChange={(e) => setIOUFormData({ ...iouFormData, amount: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Date"
            type="date"
            value={iouFormData.date}
            onChange={(e) => setIOUFormData({ ...iouFormData, date: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={iouFormData.notes}
            onChange={(e) => setIOUFormData({ ...iouFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
        </div>
      </Modal>

      {/* Add Payment Modal */}
      <Modal
        isOpen={showAddPaymentModal}
        onClose={() => {
          setShowAddPaymentModal(false);
          setSelectedIOU(null);
          setSelectedPersonName("");
        }}
        title={`Record Payment from ${selectedPersonName}${paymentFormData.isAgreementPayment ? " (Daily Rate)" : ""}`}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddPaymentModal(false);
                setSelectedIOU(null);
                setSelectedPersonName("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitPayment}
              disabled={createIOUPayment.isPending}
              className="flex-1"
            >
              {createIOUPayment.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {paymentFormData.isAgreementPayment && (
            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800/50">
              <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Daily Rate Payment</p>
              <p className="text-xs text-violet-600/70 dark:text-violet-400/70">This payment will count toward the daily rate agreement</p>
            </div>
          )}
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={paymentFormData.amount}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Payment Date"
            type="date"
            value={paymentFormData.paymentDate}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={paymentFormData.notes}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
        </div>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal
        isOpen={showEditPaymentModal}
        onClose={() => {
          setShowEditPaymentModal(false);
          setSelectedPayment(null);
        }}
        title="Edit Payment"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditPaymentModal(false);
                setSelectedPayment(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitPayment}
              disabled={updateIOUPayment.isPending}
              className="flex-1"
            >
              {updateIOUPayment.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={paymentFormData.amount}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Payment Date"
            type="date"
            value={paymentFormData.paymentDate}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={paymentFormData.notes}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
        </div>
      </Modal>

      {/* Add Agreement Modal */}
      <Modal
        isOpen={showAddAgreementModal}
        onClose={() => setShowAddAgreementModal(false)}
        title="Add Daily Rate Agreement"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowAddAgreementModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitAgreement}
              disabled={createAgreement.isPending}
              className="flex-1"
            >
              {createAgreement.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Input
              label="Person Name"
              value={agreementFormData.personName}
              onChange={(e) => setAgreementFormData({ ...agreementFormData, personName: e.target.value })}
              placeholder="Who will pay daily?"
              list="agreement-person-names"
            />
            <datalist id="agreement-person-names">
              {personNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <Input
            label="Daily Rate"
            type="number"
            step="0.01"
            min="0"
            value={agreementFormData.dailyRate}
            onChange={(e) => setAgreementFormData({ ...agreementFormData, dailyRate: e.target.value })}
            placeholder="35.00"
          />
          <Input
            label="Start Date"
            type="date"
            value={agreementFormData.startDate}
            onChange={(e) => setAgreementFormData({ ...agreementFormData, startDate: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={agreementFormData.notes}
            onChange={(e) => setAgreementFormData({ ...agreementFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
        </div>
      </Modal>

      {/* Edit Agreement Modal */}
      <Modal
        isOpen={showEditAgreementModal}
        onClose={() => {
          setShowEditAgreementModal(false);
          setSelectedAgreement(null);
        }}
        title="Edit Daily Rate Agreement"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditAgreementModal(false);
                setSelectedAgreement(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitAgreement}
              disabled={updateAgreement.isPending}
              className="flex-1"
            >
              {updateAgreement.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Input
              label="Person Name"
              value={agreementFormData.personName}
              onChange={(e) => setAgreementFormData({ ...agreementFormData, personName: e.target.value })}
              placeholder="Who will pay daily?"
              list="agreement-person-names-edit"
            />
            <datalist id="agreement-person-names-edit">
              {personNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <Input
            label="Daily Rate"
            type="number"
            step="0.01"
            min="0"
            value={agreementFormData.dailyRate}
            onChange={(e) => setAgreementFormData({ ...agreementFormData, dailyRate: e.target.value })}
            placeholder="35.00"
          />
          <Input
            label="Start Date"
            type="date"
            value={agreementFormData.startDate}
            onChange={(e) => setAgreementFormData({ ...agreementFormData, startDate: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={agreementFormData.notes}
            onChange={(e) => setAgreementFormData({ ...agreementFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
        </div>
      </Modal>

      {/* Quick Payment Modal */}
      <Modal
        isOpen={showQuickPaymentModal}
        onClose={() => {
          setShowQuickPaymentModal(false);
          setSelectedPersonName("");
        }}
        title="Record Payment"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowQuickPaymentModal(false);
                setSelectedPersonName("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitQuickPayment}
              disabled={createIOUPayment.isPending || createIOU.isPending}
              className="flex-1"
            >
              {createIOUPayment.isPending || createIOU.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              From
            </label>
            <select
              value={selectedPersonName}
              onChange={(e) => setSelectedPersonName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Select person...</option>
              {personNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={paymentFormData.amount}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Payment Date"
            type="date"
            value={paymentFormData.paymentDate}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={paymentFormData.notes}
            onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
            placeholder="Any additional notes"
          />
          <label className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800/50 cursor-pointer">
            <input
              type="checkbox"
              checked={paymentFormData.isAgreementPayment}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, isAgreementPayment: e.target.checked })}
              className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
            />
            <div>
              <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Daily Rate Payment</p>
              <p className="text-xs text-violet-600/70 dark:text-violet-400/70">Counts directly toward the daily rate agreement</p>
            </div>
          </label>
        </div>
      </Modal>
    </div>
  );
}
