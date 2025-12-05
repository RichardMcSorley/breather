import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOfflineMutation } from "./useOfflineMutation";
import { useToast } from "@/lib/toast";

// Query Keys
export const queryKeys = {
  transactions: (filterType?: string, filterTag?: string, page?: number, limit?: number) =>
    ["transactions", filterType, filterTag, page, limit] as const,
  transaction: (id: string) => ["transaction", id] as const,
  bills: () => ["bills"] as const,
  bill: (id: string) => ["bill", id] as const,
  billPayments: () => ["billPayments"] as const,
  paymentPlan: (startDate: string, dailyPayment: number) =>
    ["paymentPlan", startDate, dailyPayment] as const,
  mileage: (page?: number, limit?: number) => ["mileage", page, limit] as const,
  mileageAll: () => ["mileage", "all"] as const,
  mileageEntry: (id: string) => ["mileageEntry", id] as const,
  settings: () => ["settings"] as const,
  summary: (localDate: string, viewMode: string) =>
    ["summary", localDate, viewMode] as const,
  heatmap: (localDate: string, viewMode: string, days?: number) => ["heatmap", localDate, viewMode, days] as const,
  appHeatmap: (localDate: string, viewMode: string) => ["appHeatmap", localDate, viewMode] as const,
  teslaConnection: () => ["teslaConnection"] as const,
  deliveryOrders: (userId?: string, limit?: number) => ["deliveryOrders", userId, limit] as const,
};

// Query Hooks

export function useTransactions(
  filterType: string = "all",
  filterTag: string = "all",
  page: number = 1,
  limit: number = 50
) {
  return useQuery({
    queryKey: queryKeys.transactions(filterType, filterTag, page, limit),
    queryFn: async () => {
      let url = `/api/transactions?page=${page}&limit=${limit}`;
      if (filterType !== "all") {
        url += `&type=${filterType}`;
      }
      if (filterTag !== "all") {
        url += `&tag=${filterTag}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch transactions");
      }
      const data = await res.json();
      return {
        transactions: data.transactions.filter(
          (t: any) => !t.isBill && !t.isBalanceAdjustment
        ),
        pagination: data.pagination,
      };
    },
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transaction(id!),
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch transaction");
      }
      return res.json();
    },
    enabled: !!id,
  });
}

export function useBills() {
  return useQuery({
    queryKey: queryKeys.bills(),
    queryFn: async () => {
      const res = await fetch("/api/bills");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to fetch bills");
      }
      const data = await res.json();
      return { bills: data.bills };
    },
  });
}

export function useBillPayments() {
  return useQuery({
    queryKey: queryKeys.billPayments(),
    queryFn: async () => {
      const res = await fetch("/api/bills/payments");
      if (!res.ok) {
        throw new Error("Failed to fetch bill payments");
      }
      const data = await res.json();
      return { payments: data.payments || [] };
    },
  });
}

export function usePaymentPlan(startDate: string, dailyPayment: number, enabled: boolean = false) {
  return useQuery({
    queryKey: queryKeys.paymentPlan(startDate, dailyPayment),
    queryFn: async () => {
      const res = await fetch("/api/bills/payment-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, dailyPayment }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to generate payment plan");
      }
      return res.json();
    },
    enabled,
  });
}

export function useMileageEntries(page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.mileage(page, limit),
    queryFn: async () => {
      const res = await fetch(`/api/mileage?page=${page}&limit=${limit}`);
      if (!res.ok) {
        throw new Error("Failed to fetch mileage entries");
      }
      const data = await res.json();
      return {
        entries: data.entries || [],
        pagination: data.pagination,
      };
    },
  });
}

export function useMileageEntriesForCalculation() {
  return useQuery({
    queryKey: queryKeys.mileageAll(),
    queryFn: async () => {
      // Fetch all entries for year calculation (no pagination)
      const res = await fetch("/api/mileage?limit=10000");
      if (!res.ok) {
        throw new Error("Failed to fetch mileage entries");
      }
      const data = await res.json();
      return { entries: data.entries || [] };
    },
  });
}

export function useMileageEntry(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mileageEntry(id!),
    queryFn: async () => {
      const res = await fetch(`/api/mileage/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch mileage entry");
      }
      return res.json();
    },
    enabled: !!id,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        throw new Error("Failed to fetch settings");
      }
      return res.json();
    },
  });
}

export function useDeliveryOrders(userId?: string, limit: number = 20) {
  return useQuery({
    queryKey: queryKeys.deliveryOrders(userId, limit),
    queryFn: async () => {
      if (!userId) {
        return { orders: [] };
      }
      const params = new URLSearchParams({
        userId,
        limit: limit.toString(),
      });
      const res = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch delivery orders");
      }
      const data = await res.json();
      return { orders: data.orders || [] };
    },
    enabled: !!userId,
  });
}

export function useSummary(localDate: string, viewMode: string) {
  return useQuery({
    queryKey: queryKeys.summary(localDate, viewMode),
    queryFn: async () => {
      const params = new URLSearchParams({
        localDate,
        viewMode,
      });
      const res = await fetch(`/api/summary?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to fetch summary");
      }
      return res.json();
    },
  });
}

export function useHeatMapData(localDate: string, viewMode: string, days: number = 30) {
  return useQuery({
    queryKey: queryKeys.heatmap(localDate, viewMode, days),
    queryFn: async () => {
      const params = new URLSearchParams({
        localDate,
        viewMode,
        days: days.toString(),
      });
      const res = await fetch(`/api/analytics/heatmap?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch heat map data");
      }
      return res.json();
    },
  });
}

export function useAppHeatMapData(localDate: string, viewMode: string) {
  return useQuery({
    queryKey: queryKeys.appHeatmap(localDate, viewMode),
    queryFn: async () => {
      const params = new URLSearchParams({
        localDate,
        viewMode,
      });
      const res = await fetch(`/api/analytics/app-heatmap?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch app heat map data");
      }
      return res.json();
    },
  });
}

// Mutation Hooks

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/transactions",
    method: "POST",
    mutationFn: async (data: any) => {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create transaction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["dateTotals"] });
      toast.success("Transaction saved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error saving transaction");
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (variables: { id: string; [key: string]: any }) => `/api/transactions/${variables.id}`,
    method: "PUT",
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update transaction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["dateTotals"] });
      toast.success("Transaction updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error updating transaction");
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (id: string) => `/api/transactions/${id}`,
    method: "DELETE",
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to delete transaction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["dateTotals"] });
      toast.success("Transaction deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error deleting transaction");
    },
  });
}

export function useCreateBill() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/bills",
    method: "POST",
    mutationFn: async (data: any) => {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create bill");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Bill saved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error saving bill");
    },
  });
}

export function useUpdateBill() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (variables: { id: string; [key: string]: any }) => `/api/bills/${variables.id}`,
    method: "PUT",
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const res = await fetch(`/api/bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update bill");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bill"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Bill updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error updating bill");
    },
  });
}

export function useDeleteBill() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (id: string) => `/api/bills/${id}`,
    method: "DELETE",
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bills/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to delete bill");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Bill deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error deleting bill");
    },
  });
}

export function useCreateBillPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/bills/payments",
    method: "POST",
    mutationFn: async (data: any) => {
      const res = await fetch("/api/bills/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billPayments"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["paymentPlan"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error recording payment");
    },
  });
}

export function useUpdateBillPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (variables: { id: string; [key: string]: any }) => `/api/bills/payments/${variables.id}`,
    method: "PUT",
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const res = await fetch(`/api/bills/payments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billPayments"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["paymentPlan"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error updating payment");
    },
  });
}

export function useDeleteBillPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (id: string) => `/api/bills/payments/${id}`,
    method: "DELETE",
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bills/payments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to delete payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billPayments"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["paymentPlan"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error deleting payment");
    },
  });
}

export function useDeleteAllBillPayments() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/bills/payments",
    method: "DELETE",
    mutationFn: async () => {
      const res = await fetch("/api/bills/payments", {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to clear payments");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billPayments"] });
      queryClient.invalidateQueries({ queryKey: ["paymentPlan"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error clearing payments");
    },
  });
}

export function useCreateMileageEntry() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/mileage",
    method: "POST",
    mutationFn: async (data: any) => {
      const res = await fetch("/api/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create mileage entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error saving mileage entry");
    },
  });
}

export function useUpdateMileageEntry() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (variables: { id: string; [key: string]: any }) => `/api/mileage/${variables.id}`,
    method: "PUT",
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const res = await fetch(`/api/mileage/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update mileage entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage"] });
      queryClient.invalidateQueries({ queryKey: ["mileageEntry"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error saving mileage entry");
    },
  });
}

export function useDeleteMileageEntry() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: (id: string) => `/api/mileage/${id}`,
    method: "DELETE",
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/mileage/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to delete mileage entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Mileage entry deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error deleting mileage entry");
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/settings",
    method: "PUT",
    mutationFn: async (data: any) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Settings saved successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error saving settings");
    },
  });
}

export function useQuickTransaction() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useOfflineMutation({
    endpoint: "/api/quick-transaction",
    method: "POST",
    mutationFn: async (data: any) => {
      const res = await fetch("/api/quick-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create quick transaction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error creating quick transaction");
    },
  });
}

export function useQuickAddOrderTransaction() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      // Fetch delivery orders from last 24 hours
      const params = new URLSearchParams({
        userId,
        limit: "50",
      });
      const ordersRes = await fetch(`/api/delivery-orders?${params.toString()}`);
      if (!ordersRes.ok) {
        throw new Error("Failed to fetch delivery orders");
      }
      const ordersData = await ordersRes.json();
      
      // Filter to only unlinked orders from last 24 hours
      const now = new Date();
      const orders = (ordersData.orders || []).filter((order: any) => {
        // Filter out orders already linked to transactions
        if (order.linkedTransactions && order.linkedTransactions.length > 0) {
          return false;
        }
        
        // Filter to only show orders from the last 24 hours
        const orderDate = new Date(order.processedAt);
        const hoursDiff = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
        return hoursDiff <= 24;
      });

      if (orders.length === 0) {
        throw new Error("No unlinked orders found from the last 24 hours");
      }

      // Get the most recent order (they're already sorted by processedAt desc)
      const order = orders[0];

      // Convert UTC processedAt to EST date/time (same logic as AddTransactionModal)
      const utcDate = new Date(order.processedAt);
      const utcTimestamp = utcDate.getTime();
      
      // EST is UTC-5, so subtract 5 hours in milliseconds
      const EST_OFFSET_MS = 5 * 60 * 60 * 1000;
      const estTimestamp = utcTimestamp - EST_OFFSET_MS;
      const estDate = new Date(estTimestamp);
      
      // Extract EST date components
      const estYear = estDate.getUTCFullYear();
      const estMonth = estDate.getUTCMonth();
      const estDay = estDate.getUTCDate();
      const estHour = estDate.getUTCHours();
      const estMinute = estDate.getUTCMinutes();
      
      // Format EST date as YYYY-MM-DD
      const formattedDate = `${estYear}-${String(estMonth + 1).padStart(2, '0')}-${String(estDay).padStart(2, '0')}`;
      
      // Use order's time if available, otherwise use EST time from processedAt
      let orderTime = order.time || "";
      if (!orderTime) {
        orderTime = `${String(estHour).padStart(2, '0')}:${String(estMinute).padStart(2, '0')}`;
      }

      // Create transaction
      const transactionRes = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: order.money,
          type: "income",
          date: formattedDate,
          time: orderTime,
          notes: "",
          tag: order.appName,
          isBill: false,
          step: "CREATED",
          active: true,
        }),
      });

      if (!transactionRes.ok) {
        const errorData = await transactionRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create transaction");
      }

      const transaction = await transactionRes.json();

      // Link the order to the transaction
      if (transaction._id && order.id) {
        const linkRes = await fetch("/api/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: transaction._id,
            deliveryOrderId: order.id,
            action: "link",
          }),
        });

        if (!linkRes.ok) {
          // Transaction was created but linking failed - log error but don't fail completely
          console.error("Failed to link order:", await linkRes.text());
        }
      }

      return { transaction, order };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryOrders"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      toast.success(`Transaction added for ${data.order.restaurantName}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error adding order transaction");
    },
  });
}

export function useTeslaConnection() {
  return useQuery({
    queryKey: queryKeys.teslaConnection(),
    queryFn: async () => {
      const res = await fetch("/api/tesla/connection");
      if (!res.ok) {
        if (res.status === 404) {
          return { connected: false };
        }
        throw new Error("Failed to fetch Tesla connection");
      }
      return res.json();
    },
  });
}

export function useConnectTesla() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tesla/auth");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to get Tesla auth URL");
      }
      const data = await res.json();
      // Redirect to Tesla OAuth
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error connecting to Tesla");
    },
  });
}

export function useDisconnectTesla() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tesla/connection", {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to disconnect Tesla");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teslaConnection"] });
      toast.success("Tesla account disconnected");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error disconnecting Tesla");
    },
  });
}

export function useSyncTesla() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tesla/sync", {
        method: "POST",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to sync Tesla");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mileage"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["teslaConnection"] });
      if (data.entryCreated) {
        toast.success(data.message || "Mileage synced from Tesla");
      } else {
        toast.info(data.message || "No new mileage entry created");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error syncing Tesla");
    },
  });
}

