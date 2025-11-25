import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import * as offline from "@/lib/offline";

// Mock offline module
vi.mock("@/lib/offline", () => ({
  syncQueue: vi.fn(),
  getSyncQueue: vi.fn(),
}));

describe("useOfflineSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.onLine using vi.stubGlobal
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
    });
    (offline.getSyncQueue as any).mockResolvedValue([]);
    (offline.syncQueue as any).mockResolvedValue({ success: true, results: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("should initialize with online status", async () => {
    const { result } = renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
    });
  });

    it("should update online status when going offline", async () => {
      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(result.current.isOnline).toBe(true));

      act(() => {
        delete (navigator as any).onLine;
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
          configurable: true,
        });
        window.dispatchEvent(new Event("offline"));
      });

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false);
      });
    });

    it("should sync when coming back online", async () => {
      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(result.current.isOnline).toBe(true));

      act(() => {
        vi.stubGlobal("navigator", {
          ...navigator,
          onLine: false,
        });
        window.dispatchEvent(new Event("offline"));
      });

      await waitFor(() => expect(result.current.isOnline).toBe(false));

      act(() => {
        vi.stubGlobal("navigator", {
          ...navigator,
          onLine: true,
        });
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => {
        expect(offline.syncQueue).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

  it("should update queue length", async () => {
    (offline.getSyncQueue as any).mockResolvedValue([
      { id: "1", type: "create", endpoint: "/api/test", method: "POST", timestamp: Date.now() },
      { id: "2", type: "update", endpoint: "/api/test", method: "PUT", timestamp: Date.now() },
    ]);

    const { result } = renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(result.current.queueLength).toBe(2);
    });
  });

  it("should provide manual sync function", async () => {
    const { result } = renderHook(() => useOfflineSync());

    await waitFor(() => expect(result.current.manualSync).toBeDefined());

    await act(async () => {
      await result.current.manualSync();
    });

    expect(offline.syncQueue).toHaveBeenCalled();
  });

    it("should not sync manually when offline", async () => {
      vi.stubGlobal("navigator", {
        ...navigator,
        onLine: false,
      });

    const { result } = renderHook(() => useOfflineSync());

    await waitFor(() => expect(result.current.isOnline).toBe(false));

    await act(async () => {
      await result.current.manualSync();
    });

    expect(offline.syncQueue).not.toHaveBeenCalled();
  });

  it("should set syncing state during sync", async () => {
    let resolveSync: (value: any) => void;
    const syncPromise = new Promise((resolve) => {
      resolveSync = resolve;
    });
    (offline.syncQueue as any).mockReturnValue(syncPromise);

    const { result } = renderHook(() => useOfflineSync());

    await waitFor(() => expect(result.current.manualSync).toBeDefined());

    act(() => {
      result.current.manualSync();
    });

    await waitFor(() => {
      expect(result.current.syncing).toBe(true);
    });

    await act(async () => {
      resolveSync!({ success: true, results: [] });
      await syncPromise;
    });

    await waitFor(() => {
      expect(result.current.syncing).toBe(false);
    });
  });

  it("should periodically check sync queue", async () => {
    vi.useFakeTimers();

    // Render the hook - this will call getSyncQueue on mount
    const { unmount } = renderHook(() => useOfflineSync());

    // Run all pending timers and flush promises to allow initial mount to complete
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    // Verify initial mount called getSyncQueue
    expect(offline.getSyncQueue).toHaveBeenCalled();

    // Clear the mock to track only periodic calls
    vi.clearAllMocks();

    // Advance time by 30 seconds to trigger the interval
    await act(async () => {
      vi.advanceTimersByTime(30000);
      // Flush promises to ensure async operations complete
      await Promise.resolve();
    });

    // Verify getSyncQueue was called by the periodic interval
    expect(offline.getSyncQueue).toHaveBeenCalled();

    // When online, syncQueue should also be called
    expect(offline.syncQueue).toHaveBeenCalled();

    // Advance time by another 30 seconds to verify it continues to run
    vi.clearAllMocks();
    
    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(offline.getSyncQueue).toHaveBeenCalled();
    expect(offline.syncQueue).toHaveBeenCalled();

    // Clean up
    unmount();
    vi.useRealTimers();
  });
});

