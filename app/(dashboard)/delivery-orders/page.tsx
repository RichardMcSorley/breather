"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import DeliveryOrdersList from "@/components/DeliveryOrdersList";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";

interface DeliveryOrder {
  id: string;
  entryId: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  restaurantName: string;
  time: string;
  processedAt: string;
  createdAt: string;
}

function DeliveryOrdersPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchOrders();
    }
  }, [userId]);

  // Check for orderId query parameter and auto-open edit modal
  useEffect(() => {
    const orderIdParam = searchParams.get("orderId");
    if (orderIdParam && userId) {
      setEditingOrderId(orderIdParam);
    }
  }, [searchParams, userId]);

  const fetchOrders = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/delivery-orders?userId=${userId}&limit=100`);
      if (!response.ok) {
        throw new Error("Failed to fetch delivery orders");
      }
      const data = await response.json();
      setOrders(data.orders || []);
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Delivery Orders</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track your delivery orders, miles, earnings, and ratios
        </p>
      </div>

      {error && (
        <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </Card>
      )}

      {/* Delivery Orders List */}
      <div className="mb-6">
        <DeliveryOrdersList
          userId={userId}
          onRefresh={fetchOrders}
          onEditClick={(orderId) => setEditingOrderId(orderId)}
        />
      </div>

      {/* Edit Delivery Order Modal */}
      <EditDeliveryOrderModal
        isOpen={editingOrderId !== null}
        onClose={() => setEditingOrderId(null)}
        orderId={editingOrderId}
        userId={userId}
        onUpdate={() => {
          fetchOrders();
          setEditingOrderId(null);
        }}
      />
    </Layout>
  );
}

export default function DeliveryOrdersPage() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        </Layout>
      }
    >
      <DeliveryOrdersPageContent />
    </Suspense>
  );
}

