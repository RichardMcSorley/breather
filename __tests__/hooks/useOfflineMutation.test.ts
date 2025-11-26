import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import * as offline from "@/lib/offline";
import * as toast from "@/lib/toast";

// Mock dependencies
vi.mock("@/lib/offline");
vi.mock("@/lib/toast");

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
  
  return Wrapper;
};

describe("useOfflineMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
    (toast.useToast as any).mockReturnValue({
      success: vi.fn(),
      error: vi.fn(),
    });
  });

  it("should execute mutation when online", async () => {
    const mockData = { id: "1", amount: 100 };
    const mockResponse = { success: true };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(
      () =>
        useOfflineMutation<{ success: boolean }, Error, { id: string; amount: number }>({
          endpoint: "/api/test",
          method: "POST",
          mutationFn: async (data) => {
            const res = await fetch("/api/test", {
              method: "POST",
              body: JSON.stringify(data),
            });
            return res.json();
          },
        }),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate(mockData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should queue mutation when offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    (offline.addToSyncQueue as any).mockResolvedValueOnce("queue-id");

    const { result } = renderHook(
      () =>
        useOfflineMutation<any, Error, { data: string }>({
          endpoint: "/api/test",
          method: "POST",
          mutationFn: async () => {
            throw new Error("Should not be called");
          },
        }),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate({ data: "test" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(offline.addToSyncQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "create",
        endpoint: "/api/test",
        method: "POST",
      })
    );
  });

  it("should determine operation type from method", async () => {
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    (offline.addToSyncQueue as any).mockResolvedValueOnce("queue-id");

    const { result: putResult } = renderHook(
      () =>
        useOfflineMutation<any, Error, { id: string }>({
          endpoint: "/api/test/1",
          method: "PUT",
          mutationFn: async () => ({}),
        }),
      {
        wrapper: createWrapper(),
      }
    );

    putResult.current.mutate({ id: "1" });

    await waitFor(() => expect(putResult.current.isSuccess).toBe(true));
    expect(offline.addToSyncQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "update",
        method: "PUT",
      })
    );

    const { result: deleteResult } = renderHook(
      () =>
        useOfflineMutation<any, Error, string>({
          endpoint: "/api/test/1",
          method: "DELETE",
          mutationFn: async () => ({}),
        }),
      {
        wrapper: createWrapper(),
      }
    );

    deleteResult.current.mutate("1");

    await waitFor(() => expect(deleteResult.current.isSuccess).toBe(true));
    expect(offline.addToSyncQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "delete",
        method: "DELETE",
      })
    );
  });

  it("should handle dynamic endpoint function", async () => {
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    (offline.addToSyncQueue as any).mockResolvedValueOnce("queue-id");

    const { result } = renderHook(
      () =>
        useOfflineMutation<any, Error, { id: string }>({
          endpoint: (vars: { id: string }) => `/api/test/${vars.id}`,
          method: "PUT",
          mutationFn: async () => ({}),
        }),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate({ id: "123" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(offline.addToSyncQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/test/123",
      })
    );
  });

  it("should queue mutation if network error occurs and goes offline", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call fails, then we go offline
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    (offline.addToSyncQueue as any).mockResolvedValueOnce("queue-id");

    const { result } = renderHook(
      () =>
        useOfflineMutation<any, Error, { data: string }>({
          endpoint: "/api/test",
          method: "POST",
          mutationFn: async (data) => {
            const res = await fetch("/api/test", {
              method: "POST",
              body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Failed");
            return res.json();
          },
        }),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate({ data: "test" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(offline.addToSyncQueue).toHaveBeenCalled();
  });
});

