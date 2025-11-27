"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import CustomerLocationMap from "@/components/CustomerLocationMap";
import CustomerFrequencyList from "@/components/CustomerFrequencyList";
import CustomerDetailsModal from "@/components/CustomerDetailsModal";
import EditCustomerEntriesModal from "@/components/EditCustomerEntriesModal";

interface OcrExportEntry {
  _id: string;
  entryId: string;
  userId: string;
  appName?: string;
  customerName: string;
  customerAddress: string;
  rawResponse?: string;
  lat?: number;
  lon?: number;
  geocodeDisplayName?: string;
  processedAt: string;
  createdAt: string;
  updatedAt: string;
}

export default function OcrDataPage() {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<OcrExportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchOcrData();
    }
  }, [userId]);

  const fetchOcrData = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/ocr-exports?userId=${userId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch customer data");
      }
      const data = await response.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
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

  if (!userId) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Data</h2>
      </div>

      {error && (
        <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </Card>
      )}

      {entries.length > 0 && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Customer Locations Map
          </h3>
          <CustomerLocationMap entries={entries} />
        </Card>
      )}

      {/* Customer Frequency List */}
      <div className="mb-6">
        <CustomerFrequencyList
          userId={userId}
          onCustomerClick={(address) => setSelectedCustomer(address)}
          onEditClick={(address) => setEditingAddress(address)}
          onDelete={() => fetchOcrData()}
        />
      </div>

      {/* Customer Details Modal */}
      <CustomerDetailsModal
        isOpen={selectedCustomer !== null}
        onClose={() => setSelectedCustomer(null)}
        address={selectedCustomer}
        userId={userId}
      />

      {/* Edit Customer Entries Modal */}
      <EditCustomerEntriesModal
        isOpen={editingAddress !== null}
        onClose={() => setEditingAddress(null)}
        address={editingAddress}
        userId={userId}
        onUpdate={() => {
          fetchOcrData();
          setEditingAddress(null);
        }}
      />
    </Layout>
  );
}

