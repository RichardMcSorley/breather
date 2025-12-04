"use client";

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncQueue, getSyncQueue, SyncOperation } from "@/lib/offline";

// Helper function to determine which queries to invalidate based on endpoint
function getQueriesToInvalidate(operation: SyncOperation): string[][] {
  const endpoint = operation.endpoint;
  
  // Transactions
  if (endpoint.includes("/api/transactions")) {
    if (endpoint.match(/\/api\/transactions\/[^/]+$/)) {
      // Specific transaction endpoint
      const match = endpoint.match(/\/api\/transactions\/([^/]+)$/);
      if (match) {
        return [["transactions"], ["transaction", match[1]], ["summary"], ["heatmap"], ["appHeatmap"]];
      }
    }
    return [["transactions"], ["summary"], ["heatmap"], ["appHeatmap"]];
  }
  
  // Bills
  if (endpoint.includes("/api/bills")) {
    if (endpoint.includes("/payments")) {
      return [["billPayments"], ["bills"], ["paymentPlan"], ["summary"]];
    }
    if (endpoint.match(/\/api\/bills\/[^/]+$/)) {
      // Specific bill endpoint
      const match = endpoint.match(/\/api\/bills\/([^/]+)$/);
      if (match) {
        return [["bills"], ["bill", match[1]], ["summary"]];
      }
    }
    return [["bills"], ["summary"]];
  }
  
  // Mileage
  if (endpoint.includes("/api/mileage")) {
    if (endpoint.match(/\/api\/mileage\/[^/]+$/)) {
      // Specific mileage entry endpoint
      const match = endpoint.match(/\/api\/mileage\/([^/]+)$/);
      if (match) {
        return [["mileage"], ["mileageEntry", match[1]], ["summary"]];
      }
    }
    return [["mileage"], ["summary"]];
  }
  
  // Settings
  if (endpoint.includes("/api/settings")) {
    return [["settings"], ["summary"]];
  }
  
  // Quick transaction
  if (endpoint.includes("/api/quick-transaction")) {
    return [["transactions"], ["summary"], ["heatmap"]];
  }
  
  // Default: invalidate all queries
  return [];
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      
      // Prevent concurrent syncs
      if (syncInProgressRef.current) {
        return;
      }
      
      syncInProgressRef.current = true;
      setSyncing(true);
      try {
        const result = await syncQueue();
        if (result.success && result.syncedOperations && result.syncedOperations.length > 0) {
          // Collect all unique query keys to invalidate
          const queryKeysToInvalidate = new Set<string>();
          result.syncedOperations.forEach((operation) => {
            const queries = getQueriesToInvalidate(operation);
            queries.forEach((queryKey) => {
              queryKeysToInvalidate.add(JSON.stringify(queryKey));
            });
          });
          
          // Invalidate all affected queries
          queryKeysToInvalidate.forEach((queryKeyStr) => {
            const queryKey = JSON.parse(queryKeyStr);
            queryClient.invalidateQueries({ queryKey });
          });
        }
        const queue = await getSyncQueue();
        setQueueLength(queue.length);
      } catch (error) {
        console.error("Error syncing:", error);
      } finally {
        setSyncing(false);
        syncInProgressRef.current = false;
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const updateQueueLength = async () => {
      const queue = await getSyncQueue();
      setQueueLength(queue.length);
    };

    setIsOnline(navigator.onLine);
    updateQueueLength();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic sync check
    const syncInterval = setInterval(async () => {
      if (navigator.onLine) {
        await handleOnline();
      }
      await updateQueueLength();
    }, 30000); // Every 30 seconds

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(syncInterval);
    };
  }, [queryClient]);

  const manualSync = async () => {
    if (!navigator.onLine || syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setSyncing(true);
    try {
      const result = await syncQueue();
      if (result.success && result.syncedOperations && result.syncedOperations.length > 0) {
        // Collect all unique query keys to invalidate
        const queryKeysToInvalidate = new Set<string>();
        result.syncedOperations.forEach((operation) => {
          const queries = getQueriesToInvalidate(operation);
          queries.forEach((queryKey) => {
            queryKeysToInvalidate.add(JSON.stringify(queryKey));
          });
        });
        
        // Invalidate all affected queries
        queryKeysToInvalidate.forEach((queryKeyStr) => {
          const queryKey = JSON.parse(queryKeyStr);
          queryClient.invalidateQueries({ queryKey });
        });
      }
      const queue = await getSyncQueue();
      setQueueLength(queue.length);
    } catch (error) {
      console.error("Error syncing:", error);
    } finally {
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  };

  return { isOnline, queueLength, syncing, manualSync };
}


