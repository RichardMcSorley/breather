"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function ConfigurationPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    liquidCash: "",
    monthlyBurnRate: "",
    fixedExpenses: "",
    estimatedTaxRate: "",
    irsMileageDeduction: "",
  });

  useEffect(() => {
    if (session?.user?.id) {
      fetchSettings();
    }
  }, [session]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setFormData({
          liquidCash: data.liquidCash?.toString() || "",
          monthlyBurnRate: data.monthlyBurnRate?.toString() || "",
          fixedExpenses: data.fixedExpenses?.toString() || "",
          estimatedTaxRate: data.estimatedTaxRate?.toString() || "",
          irsMileageDeduction: data.irsMileageDeduction?.toString() || "0.67",
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const irsMileageValue = formData.irsMileageDeduction !== undefined && formData.irsMileageDeduction !== "" 
        ? parseFloat(formData.irsMileageDeduction) 
        : 0.67;
      
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liquidCash: parseFloat(formData.liquidCash) || 0,
          monthlyBurnRate: parseFloat(formData.monthlyBurnRate) || 0,
          fixedExpenses: parseFloat(formData.fixedExpenses) || 0,
          estimatedTaxRate: parseFloat(formData.estimatedTaxRate) || 0,
          irsMileageDeduction: isNaN(irsMileageValue) ? 0.67 : irsMileageValue,
        }),
      });

      if (res.ok) {
        alert("Settings saved successfully!");
      } else {
        alert("Error saving settings");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
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
      <Card className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">CONFIGURATION</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Input
              label="TOTAL LIQUID CASH ($)"
              type="number"
              step="0.01"
              value={formData.liquidCash}
              onChange={(e) =>
                setFormData({ ...formData, liquidCash: e.target.value })
              }
              placeholder="0.00"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The total liquid cash you have available right now.
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <Input
              label="MONTHLY BURN RATE ($)"
              type="number"
              step="0.01"
              value={formData.monthlyBurnRate}
              onChange={(e) =>
                setFormData({ ...formData, monthlyBurnRate: e.target.value })
              }
              placeholder="0.00"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your total estimated survival budget for one month.
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <Input
              label="FIXED EXPENSES ($)"
              type="number"
              step="0.01"
              value={formData.fixedExpenses}
              onChange={(e) =>
                setFormData({ ...formData, fixedExpenses: e.target.value })
              }
              placeholder="0.00"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Rent, mortgage, or bills due at the end of the month.
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <Input
              label="EST. TAX RATE (%)"
              type="number"
              step="0.01"
              value={formData.estimatedTaxRate}
              onChange={(e) =>
                setFormData({ ...formData, estimatedTaxRate: e.target.value })
              }
              placeholder="0"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Percentage of income set aside for taxes (Gig work).
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <Input
              label="IRS MILEAGE DEDUCTION ($/mile)"
              type="number"
              step="0.01"
              value={formData.irsMileageDeduction}
              onChange={(e) =>
                setFormData({ ...formData, irsMileageDeduction: e.target.value })
              }
              placeholder="0.67"
            />
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Current IRS standard mileage rate for business use (2024-2025: $0.67/mile).
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <span className="font-medium text-gray-900 dark:text-white">PRO MODE</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">INACTIVE</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2">
                <span>🔗</span>
                <span className="font-medium text-gray-900 dark:text-white">LINK BANK ACCOUNT</span>
              </div>
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </form>
      </Card>
    </Layout>
  );
}


