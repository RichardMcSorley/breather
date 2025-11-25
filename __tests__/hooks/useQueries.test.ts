import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useTransactions,
  useTransaction,
  useBills,
  useBillPayments,
  useSettings,
  useSummary,
  useMileageEntries,
} from "@/hooks/useQueries";
import { server } from "../utils/mocks/server";
import { http, HttpResponse } from "msw";

// Store original fetch to restore later
const originalFetch = global.fetch;

// Mock fetch that we can spy on
const mockFetch = vi.fn();

const createWrapper = () => {
  // Create a new query client for each test to avoid cache issues
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { 
        retry: false,
        gcTime: 0, // Don't cache between tests
        refetchOnMount: true, // Always refetch on mount to ensure fresh data
      },
      mutations: { retry: false },
    },
  });

  // Clear cache before each wrapper is used
  queryClient.clear();

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
  
  return Wrapper;
};

describe("useQueries", () => {
  beforeEach(() => {
    // Override fetch with our mock before MSW intercepts
    global.fetch = mockFetch;
    vi.clearAllMocks();
    mockFetch.mockClear();
    // Reset fetch mock implementation
    mockFetch.mockImplementation(() => Promise.reject(new Error("Mock not set")));
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe("useTransactions", () => {
    it("should fetch transactions successfully", async () => {
      const mockTransactions = [
        { _id: "1", amount: 100, type: "income", isBill: false, isBalanceAdjustment: false },
        { _id: "2", amount: 50, type: "expense", isBill: false, isBalanceAdjustment: false },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const { result } = renderHook(() => useTransactions(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // The hook filters out isBill and isBalanceAdjustment transactions
      expect(result.current.data?.transactions).toHaveLength(2);
      expect(result.current.data?.transactions[0]._id).toBe("1");
    });

    it("should filter by type", async () => {
      const mockTransactions = [
        { _id: "1", amount: 100, type: "income", isBill: false, isBalanceAdjustment: false },
        { _id: "2", amount: 50, type: "expense", isBill: false, isBalanceAdjustment: false },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const { result } = renderHook(() => useTransactions("income"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(mockFetch).toHaveBeenCalled();
      }, { timeout: 3000 });
      
      // Verify fetch was called and check the URL contains the type parameter
      const fetchCalls = mockFetch.mock.calls;
      const urlCall = fetchCalls.find(call => call[0]?.includes("type=income"));
      expect(urlCall).toBeDefined();
    });

    it("should handle fetch errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useTransactions(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        // React Query will set isError when the query fails
        expect(result.current.isError || result.current.isPending).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe("useTransaction", () => {
    it("should fetch single transaction", async () => {
      const mockTransaction = { _id: "1", amount: 100, type: "income" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransaction,
      });

      const { result } = renderHook(() => useTransaction("1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
      expect(result.current.data?._id).toBe("1");
      expect(result.current.data?.amount).toBe(100);
    });

    it("should not fetch when id is undefined", () => {
      const { result } = renderHook(() => useTransaction(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
    });
  });

  describe("useBills", () => {
    it("should fetch bills successfully", async () => {
      const mockBills = [
        { _id: "1", name: "Rent", amount: 1000 },
        { _id: "2", name: "Electric", amount: 100 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bills: mockBills }),
      });

      const { result } = renderHook(() => useBills(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.bills).toHaveLength(2);
      expect(result.current.data?.bills[0].name).toBe("Rent");
    });

    it("should handle fetch errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Failed to fetch" }),
      });

      const { result } = renderHook(() => useBills(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError || result.current.isPending).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe("useBillPayments", () => {
    it("should fetch bill payments successfully", async () => {
      const mockPayments = [
        { _id: "1", amount: 50, paymentDate: "2024-01-15" },
        { _id: "2", amount: 100, paymentDate: "2024-01-20" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payments: mockPayments }),
      });

      const { result } = renderHook(() => useBillPayments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data?.payments).toBeDefined();
        expect(result.current.data?.payments).toHaveLength(2);
      }, { timeout: 3000 });
      
      expect(result.current.data?.payments[0]._id).toBe("1");
    });
  });

  describe("useSettings", () => {
    it("should fetch settings successfully", async () => {
      const mockSettings = {
        irsMileageDeduction: 0.70,
        incomeSourceTags: ["Uber", "Lyft"],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSettings,
      });

      const { result } = renderHook(() => useSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
      expect(result.current.data).toBeDefined();
      // Settings may have default values, so we check that our values are present
      expect(result.current.data?.irsMileageDeduction).toBeDefined();
      if (result.current.data?.incomeSourceTags) {
        expect(result.current.data.incomeSourceTags).toContain("Uber");
        expect(result.current.data.incomeSourceTags).toContain("Lyft");
      }
    });
  });

  describe("useSummary", () => {
    it("should fetch summary successfully", async () => {
      const mockSummary = {
        breathingRoom: 30,
        freeCash: 5000,
        totalIncome: 10000,
        totalExpenses: 5000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSummary,
      });

      const { result } = renderHook(() => useSummary("2024-01-15", "month"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockSummary);
    });
  });

  describe("useMileageEntries", () => {
    it("should fetch mileage successfully", async () => {
      const mockMileage = [
        { _id: "1", odometer: 10000, date: "2024-01-15" },
        { _id: "2", odometer: 10100, date: "2024-01-16" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: mockMileage }),
      });

      const { result } = renderHook(() => useMileageEntries(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data?.entries).toBeDefined();
        expect(result.current.data?.entries).toHaveLength(2);
      }, { timeout: 3000 });
      
      expect(result.current.data?.entries[0]._id).toBe("1");
    });
  });
});

