import { describe, it, expect, beforeEach, vi } from "vitest";
import * as offline from "@/lib/offline";
import * as idbKeyval from "idb-keyval";

// Mock idb-keyval
vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
}));

describe("offline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (idbKeyval.get as any).mockResolvedValue([]);
  });

  describe("addToSyncQueue", () => {
    it("should add operation to sync queue", async () => {
      (idbKeyval.get as any).mockResolvedValueOnce([]);

      const operationId = await offline.addToSyncQueue({
        type: "create",
        endpoint: "/api/transactions",
        method: "POST",
        data: { amount: 100 },
      });

      expect(operationId).toBeDefined();
      expect(idbKeyval.set).toHaveBeenCalled();
    });

    it("should append to existing queue", async () => {
      const existingQueue = [
        {
          id: "existing-id",
          type: "create" as const,
          endpoint: "/api/bills",
          method: "POST",
          timestamp: Date.now(),
        },
      ];
      (idbKeyval.get as any).mockResolvedValueOnce(existingQueue);

      await offline.addToSyncQueue({
        type: "update",
        endpoint: "/api/transactions/1",
        method: "PUT",
        data: { amount: 200 },
      });

      expect(idbKeyval.set).toHaveBeenCalledWith(
        "sync_queue",
        expect.arrayContaining([
          expect.objectContaining({ type: "create" }),
          expect.objectContaining({ type: "update" }),
        ])
      );
    });
  });

  describe("getSyncQueue", () => {
    it("should return sync queue", async () => {
      const queue = [
        {
          id: "1",
          type: "create" as const,
          endpoint: "/api/transactions",
          method: "POST",
          timestamp: Date.now(),
        },
      ];
      (idbKeyval.get as any).mockResolvedValueOnce(queue);

      const result = await offline.getSyncQueue();
      expect(result).toEqual(queue);
    });

    it("should return empty array if queue doesn't exist", async () => {
      (idbKeyval.get as any).mockResolvedValueOnce(null);

      const result = await offline.getSyncQueue();
      expect(result).toEqual([]);
    });
  });

  describe("removeFromSyncQueue", () => {
    it("should remove operation from queue", async () => {
      const queue = [
        { id: "1", type: "create" as const, endpoint: "/api/test", method: "POST", timestamp: Date.now() },
        { id: "2", type: "update" as const, endpoint: "/api/test", method: "PUT", timestamp: Date.now() },
      ];
      (idbKeyval.get as any).mockResolvedValueOnce(queue);

      await offline.removeFromSyncQueue("1");

      expect(idbKeyval.set).toHaveBeenCalledWith(
        "sync_queue",
        expect.arrayContaining([
          expect.objectContaining({ id: "2" }),
        ])
      );
      expect(idbKeyval.set).toHaveBeenCalledWith(
        "sync_queue",
        expect.not.arrayContaining([
          expect.objectContaining({ id: "1" }),
        ])
      );
    });
  });

  describe("clearSyncQueue", () => {
    it("should clear sync queue", async () => {
      await offline.clearSyncQueue();
      expect(idbKeyval.del).toHaveBeenCalledWith("sync_queue");
    });
  });

  describe("syncQueue", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });
    });

    it("should return failure when offline", async () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const result = await offline.syncQueue();
      expect(result.success).toBe(false);
      expect(result.message).toBe("Offline");
    });

    it("should sync operations when online", async () => {
      const queue = [
        {
          id: "1",
          type: "create" as const,
          endpoint: "/api/transactions",
          method: "POST",
          data: { amount: 100 },
          timestamp: Date.now(),
        },
      ];
      (idbKeyval.get as any).mockResolvedValueOnce(queue);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await offline.syncQueue();

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(idbKeyval.set).toHaveBeenCalled(); // Queue should be updated
    });

    it("should handle failed sync operations", async () => {
      const queue = [
        {
          id: "1",
          type: "create" as const,
          endpoint: "/api/transactions",
          method: "POST",
          data: { amount: 100 },
          timestamp: Date.now(),
        },
      ];
      (idbKeyval.get as any).mockResolvedValueOnce(queue);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      const result = await offline.syncQueue();

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
    });

    it("should handle network errors", async () => {
      const queue = [
        {
          id: "1",
          type: "create" as const,
          endpoint: "/api/transactions",
          method: "POST",
          data: { amount: 100 },
          timestamp: Date.now(),
        },
      ];
      (idbKeyval.get as any).mockResolvedValueOnce(queue);

      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      const result = await offline.syncQueue();

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
    });
  });

  describe("cacheData", () => {
    it("should cache data with timestamp", async () => {
      (idbKeyval.get as any).mockResolvedValueOnce({});

      await offline.cacheData("test-key", { data: "test" });

      expect(idbKeyval.set).toHaveBeenCalledWith(
        "offline_data",
        expect.objectContaining({
          "test-key": expect.objectContaining({
            data: { data: "test" },
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it("should merge with existing cache", async () => {
      const existingCache = {
        "existing-key": { data: "existing", timestamp: Date.now() },
      };
      (idbKeyval.get as any).mockResolvedValueOnce(existingCache);

      await offline.cacheData("new-key", { data: "new" });

      expect(idbKeyval.set).toHaveBeenCalledWith(
        "offline_data",
        expect.objectContaining({
          "existing-key": expect.any(Object),
          "new-key": expect.any(Object),
        })
      );
    });
  });

  describe("getCachedData", () => {
    it("should return cached data if not expired", async () => {
      const cached = {
        "test-key": {
          data: { test: "data" },
          timestamp: Date.now(),
        },
      };
      (idbKeyval.get as any).mockResolvedValueOnce(cached);

      const result = await offline.getCachedData("test-key");
      expect(result).toEqual({ test: "data" });
    });

    it("should return null if cache doesn't exist", async () => {
      (idbKeyval.get as any).mockResolvedValueOnce({});

      const result = await offline.getCachedData("non-existent");
      expect(result).toBeNull();
    });

    it("should return null if cache is expired", async () => {
      const cached = {
        "test-key": {
          data: { test: "data" },
          timestamp: Date.now() - 2000, // 2 seconds ago
        },
      };
      (idbKeyval.get as any).mockResolvedValueOnce(cached);

      const result = await offline.getCachedData("test-key", 1000); // 1 second max age
      expect(result).toBeNull();
    });

    it("should return data if cache is not expired", async () => {
      const cached = {
        "test-key": {
          data: { test: "data" },
          timestamp: Date.now() - 500, // 0.5 seconds ago
        },
      };
      (idbKeyval.get as any).mockResolvedValueOnce(cached);

      const result = await offline.getCachedData("test-key", 1000); // 1 second max age
      expect(result).toEqual({ test: "data" });
    });
  });

  describe("clearCache", () => {
    it("should clear cache", async () => {
      await offline.clearCache();
      expect(idbKeyval.del).toHaveBeenCalledWith("offline_data");
    });
  });
});

