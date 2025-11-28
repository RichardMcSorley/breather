"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";

interface Customer {
  address: string;
  customerName: string;
  visitCount: number;
}

interface LinkCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId?: string | null;
  userId?: string;
  onLink?: () => void;
}

export default function LinkCustomerModal({
  isOpen,
  onClose,
  transactionId,
  userId,
  onLink,
}: LinkCustomerModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingAddress, setLinkingAddress] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchCustomers();
    } else {
      setCustomers([]);
      setError(null);
    }
  }, [isOpen, userId]);

  const fetchCustomers = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/ocr-exports/customers?userId=${userId}&limit=100`);
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }

      const data = await response.json();
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (customerAddress: string) => {
    if (!transactionId) return;

    try {
      setLinkingAddress(customerAddress);
      setError(null);

      // First, get the first OcrExport entry for this address to get the ID
      const encodedAddress = encodeURIComponent(customerAddress);
      const customerResponse = await fetch(`/api/ocr-exports/customers/${encodedAddress}?userId=${userId}`);
      if (!customerResponse.ok) {
        throw new Error("Failed to fetch customer details");
      }

      const customerData = await customerResponse.json();
      if (!customerData.visits || customerData.visits.length === 0) {
        throw new Error("Customer not found");
      }

      const ocrExportId = customerData.visits[0]._id;

      const response = await fetch("/api/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId,
          ocrExportId,
          action: "link",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link customer");
      }

      onLink?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link customer");
    } finally {
      setLinkingAddress(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Customer">
      {loading && customers.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {customers.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No customers found.
        </div>
      )}

      {customers.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {customers.map((customer) => (
            <div
              key={customer.address}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {customer.customerName}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {customer.address}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {customer.visitCount} visit{customer.visitCount !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                onClick={() => handleLink(customer.address)}
                disabled={linkingAddress === customer.address}
                className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed ml-4"
              >
                {linkingAddress === customer.address ? "Linking..." : "Link"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

