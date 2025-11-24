"use client";

import { addToSyncQueue, getCachedData, cacheData } from "@/lib/offline";

export function useApi() {
  const fetchWithOffline = async (
    url: string,
    options: RequestInit = {},
    cacheKey?: string
  ) => {
    // Try to get cached data first if offline
    if (!navigator.onLine && cacheKey) {
      const cached = await getCachedData(cacheKey, 5 * 60 * 1000); // 5 minutes
      if (cached) {
        return { ok: true, json: async () => cached, status: 200 };
      }
    }

    try {
      const response = await fetch(url, options);

      // Cache successful GET requests
      if (response.ok && options.method === "GET" && cacheKey) {
        const data = await response.clone().json();
        await cacheData(cacheKey, data);
      }

      return response;
    } catch (error) {
      // If offline and it's a mutation, add to sync queue
      if (!navigator.onLine && options.method && options.method !== "GET") {
        const body = options.body ? JSON.parse(options.body as string) : undefined;
        await addToSyncQueue({
          type: options.method === "DELETE" ? "delete" : options.method === "PUT" ? "update" : "create",
          endpoint: url,
          method: options.method,
          data: body,
        });

        // Return a mock success response for optimistic UI
        return {
          ok: true,
          json: async () => ({ success: true, queued: true }),
          status: 202,
        };
      }

      throw error;
    }
  };

  return { fetchWithOffline };
}


