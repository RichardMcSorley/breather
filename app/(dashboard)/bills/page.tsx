"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";

interface Bill {
  _id: string;
  name: string;
  amount: number;
  dueDate: number;
  category?: string;
  notes?: string;
  isActive: boolean;
  lastAmount: number;
}

export default function BillsPage() {
  const { data: session } = useSession();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [showAddToMonthModal, setShowAddToMonthModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [monthAmount, setMonthAmount] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<"this" | "next">("this");
  const [customDate, setCustomDate] = useState("");
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    dueDate: "",
    category: "",
    notes: "",
    isActive: true,
  });

  useEffect(() => {
    if (session?.user?.id) {
      fetchBills();
    }
  }, [session]);

  const fetchBills = async () => {
    try {
      const res = await fetch("/api/bills");
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills);
      } else {
        const errorData = await res.json();
        if (res.status === 503) {
          alert(`Database connection error: ${errorData.error}\n\n${errorData.hint || ""}`);
        }
      }
    } catch (error) {
      console.error("Error fetching bills:", error);
      alert("Failed to fetch bills. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddBill = () => {
    setFormData({
      name: "",
      amount: "",
      dueDate: "",
      category: "",
      notes: "",
      isActive: true,
    });
    setShowAddModal(true);
  };

  const handleEditBill = (bill: Bill) => {
    setEditingBill(bill);
    setFormData({
      name: bill.name,
      amount: bill.amount.toString(),
      dueDate: bill.dueDate.toString(),
      category: bill.category || "",
      notes: bill.notes || "",
      isActive: bill.isActive,
    });
    setShowEditModal(true);
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = !!editingBill;

    try {
      const url = isEditing ? `/api/bills/${editingBill._id}` : "/api/bills";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          amount: parseFloat(formData.amount),
          dueDate: parseInt(formData.dueDate),
          category: formData.category || undefined,
          notes: formData.notes || undefined,
          isActive: formData.isActive,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setShowEditModal(false);
        setEditingBill(null);
        fetchBills();
      } else {
        alert("Error saving bill");
      }
    } catch (error) {
      console.error("Error saving bill:", error);
      alert("Error saving bill");
    }
  };

  const handleDeleteBill = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bill?")) {
      return;
    }

    try {
      const res = await fetch(`/api/bills/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchBills();
      } else {
        alert("Error deleting bill");
      }
    } catch (error) {
      console.error("Error deleting bill:", error);
      alert("Error deleting bill");
    }
  };

  const handleAddToMonth = (bill: Bill) => {
    setSelectedBill(bill);
    setMonthAmount(bill.lastAmount.toString());
    setSelectedMonth("this");
    setCustomDate("");
    setUseCustomDate(false);
    setShowAddToMonthModal(true);
  };

  const handleAddToMonthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    const amount = parseFloat(monthAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    try {
      const now = new Date();
      let dueDateStr: string;

      if (useCustomDate && customDate) {
        // Use custom date if provided
        dueDateStr = customDate;
      } else {
        // Calculate due date based on selected month and bill's dueDate
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const targetMonth = selectedMonth === "this" ? currentMonth : currentMonth + 1;
        const targetYear = targetMonth > 11 ? currentYear + 1 : currentYear;
        const finalMonth = targetMonth > 11 ? 0 : targetMonth;
        
        // Format as YYYY-MM-DD to avoid timezone issues
        dueDateStr = `${targetYear}-${String(finalMonth + 1).padStart(2, '0')}-${String(selectedBill.dueDate).padStart(2, '0')}`;
      }
      
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount,
          type: "expense",
          date: now.toISOString().split("T")[0],
          time: now.toTimeString().slice(0, 5),
          notes: selectedBill.name,
          isBill: true,
          dueDate: dueDateStr,
        }),
      });

      if (res.ok) {
        setShowAddToMonthModal(false);
        setSelectedBill(null);
        setMonthAmount("");
        fetchBills();
      } else {
        alert("Error adding bill to this month");
      }
    } catch (error) {
      console.error("Error adding bill to this month:", error);
      alert("Error adding bill to this month");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
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
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">BILLS</h2>
        <Button variant="primary" onClick={handleAddBill}>
          + Add Bill
        </Button>
      </div>

      <div className="space-y-3">
        {bills.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No bills found. Add your first recurring bill!
          </div>
        ) : (
          bills.map((bill) => (
            <Card key={bill._id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{bill.name}</h3>
                    {!bill.isActive && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    Due on day {bill.dueDate} of each month
                  </div>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    {formatCurrency(bill.lastAmount)}
                  </div>
                  {bill.category && (
                    <div className="text-xs text-gray-700 mt-1">
                      Category: {bill.category}
                    </div>
                  )}
                  {bill.notes && (
                    <div className="text-sm text-gray-700 mt-1">{bill.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleAddToMonth(bill)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 min-h-[44px]"
                  >
                    Add to this month
                  </button>
                  <button
                    onClick={() => handleEditBill(bill)}
                    className="p-2 text-gray-600 hover:text-gray-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteBill(bill._id)}
                    className="p-2 text-red-600 hover:text-red-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

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
              placeholder="e.g., Rent, Internet"
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="w-5 h-5"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">
                Active
              </label>
            </div>
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActiveEdit"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="w-5 h-5"
              />
              <label htmlFor="isActiveEdit" className="text-sm text-gray-700">
                Active
              </label>
            </div>
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

      {showAddToMonthModal && selectedBill && (
        <Modal
          isOpen={showAddToMonthModal}
          onClose={() => {
            setShowAddToMonthModal(false);
            setSelectedBill(null);
            setMonthAmount("");
            setSelectedMonth("this");
            setCustomDate("");
            setUseCustomDate(false);
          }}
          title={`Add ${selectedBill.name}`}
        >
          <form onSubmit={handleAddToMonthSubmit} className="space-y-4">
            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              required
              value={monthAmount}
              onChange={(e) => setMonthAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Month
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth("this");
                    setUseCustomDate(false);
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                    selectedMonth === "this" && !useCustomDate
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth("next");
                    setUseCustomDate(false);
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                    selectedMonth === "next" && !useCustomDate
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Next Month
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useCustomDate"
                checked={useCustomDate}
                onChange={(e) => {
                  setUseCustomDate(e.target.checked);
                  if (e.target.checked) {
                    // Set default custom date to bill's due date for current month
                    const now = new Date();
                    const currentYear = now.getFullYear();
                    const currentMonth = now.getMonth();
                    const defaultDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedBill.dueDate).padStart(2, '0')}`;
                    setCustomDate(defaultDate);
                  }
                }}
                className="w-5 h-5"
              />
              <label htmlFor="useCustomDate" className="text-sm text-gray-700">
                Override specific date
              </label>
            </div>

            {useCustomDate && (
              <Input
                label="Due Date"
                type="date"
                required
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAddToMonthModal(false);
                  setSelectedBill(null);
                  setMonthAmount("");
                  setSelectedMonth("this");
                  setCustomDate("");
                  setUseCustomDate(false);
                }}
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
    </Layout>
  );
}

