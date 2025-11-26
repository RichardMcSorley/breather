"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Tag from "@/components/ui/Tag";
import { useSettings, useUpdateSettings } from "@/hooks/useQueries";

// Default tags
const DEFAULT_INCOME_TAGS = ["DoorDash", "Uber", "Instacart", "GrubHub", "Roadie", "Shipt", "ProxyPics"];
const DEFAULT_EXPENSE_TAGS = ["Gas", "Maintenance", "Insurance", "Tolls", "Parking", "Car Wash", "Oil Change", "Withdraw Fees"];

export default function ConfigurationPage() {
  const { data: session } = useSession();
  const { data: settingsData, isLoading: loading } = useSettings();
  const updateSettings = useUpdateSettings();
  
  const [formData, setFormData] = useState({
    irsMileageDeduction: "",
    incomeSourceTags: [] as string[],
    expenseSourceTags: [] as string[],
  });
  const [newIncomeTag, setNewIncomeTag] = useState("");
  const [newExpenseTag, setNewExpenseTag] = useState("");

  // Update form data when settings are loaded
  useEffect(() => {
    if (settingsData) {
      setFormData({
        irsMileageDeduction: settingsData.irsMileageDeduction?.toString() || "0.70",
        incomeSourceTags: settingsData.incomeSourceTags?.length > 0 ? settingsData.incomeSourceTags : DEFAULT_INCOME_TAGS,
        expenseSourceTags: settingsData.expenseSourceTags?.length > 0 ? settingsData.expenseSourceTags : DEFAULT_EXPENSE_TAGS,
      });
    }
  }, [settingsData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const irsMileageValue = formData.irsMileageDeduction !== undefined && formData.irsMileageDeduction !== "" 
      ? parseFloat(formData.irsMileageDeduction) 
      : 0.70;
    
    updateSettings.mutate({
      irsMileageDeduction: isNaN(irsMileageValue) ? 0.70 : irsMileageValue,
      incomeSourceTags: formData.incomeSourceTags,
      expenseSourceTags: formData.expenseSourceTags,
    });
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Configuration</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Input
              label="IRS Mileage Deduction ($/mile)"
              type="number"
              step="0.01"
              value={formData.irsMileageDeduction}
              onChange={(e) =>
                setFormData({ ...formData, irsMileageDeduction: e.target.value })
              }
              placeholder="0.70"
            />
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Current IRS standard mileage rate for business use (default: $0.70/mile).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Income Source Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.incomeSourceTags.map((tag) => (
                <Tag
                  key={tag}
                  label={tag}
                  variant="income"
                  showRemove={true}
                  onRemove={() => {
                    setFormData({
                      ...formData,
                      incomeSourceTags: formData.incomeSourceTags.filter((t) => t !== tag),
                    });
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add income source tag"
                value={newIncomeTag}
                onChange={(e) => setNewIncomeTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = newIncomeTag.trim();
                    if (trimmed && !formData.incomeSourceTags.includes(trimmed)) {
                      setFormData({
                        ...formData,
                        incomeSourceTags: [...formData.incomeSourceTags, trimmed],
                      });
                      setNewIncomeTag("");
                    }
                  }
                }}
                aria-label="Add income source tag"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const trimmed = newIncomeTag.trim();
                  if (trimmed && !formData.incomeSourceTags.includes(trimmed)) {
                    setFormData({
                      ...formData,
                      incomeSourceTags: [...formData.incomeSourceTags, trimmed],
                    });
                    setNewIncomeTag("");
                  }
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expense Source Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.expenseSourceTags.map((tag) => (
                <Tag
                  key={tag}
                  label={tag}
                  variant="expense"
                  showRemove={true}
                  onRemove={() => {
                    setFormData({
                      ...formData,
                      expenseSourceTags: formData.expenseSourceTags.filter((t) => t !== tag),
                    });
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add expense source tag"
                value={newExpenseTag}
                onChange={(e) => setNewExpenseTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = newExpenseTag.trim();
                    if (trimmed && !formData.expenseSourceTags.includes(trimmed)) {
                      setFormData({
                        ...formData,
                        expenseSourceTags: [...formData.expenseSourceTags, trimmed],
                      });
                      setNewExpenseTag("");
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const trimmed = newExpenseTag.trim();
                  if (trimmed && !formData.expenseSourceTags.includes(trimmed)) {
                    setFormData({
                      ...formData,
                      expenseSourceTags: [...formData.expenseSourceTags, trimmed],
                    });
                    setNewExpenseTag("");
                  }
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </form>
      </Card>
    </Layout>
  );
}


