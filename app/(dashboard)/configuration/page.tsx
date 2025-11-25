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
          irsMileageDeduction: data.irsMileageDeduction?.toString() || "0.70",
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
        : 0.70;
      
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          irsMileageDeduction: isNaN(irsMileageValue) ? 0.70 : irsMileageValue,
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

          <Button type="submit" variant="primary" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </form>
      </Card>
    </Layout>
  );
}


