"use client";

import { useEffect, useState } from "react";
import { syncQueue, getSyncQueue } from "@/lib/offline";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncing(true);
      try {
        await syncQueue();
        const queue = await getSyncQueue();
        setQueueLength(queue.length);
      } catch (error) {
        console.error("Error syncing:", error);
      } finally {
        setSyncing(false);
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
  }, []);

  const manualSync = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      await syncQueue();
      const queue = await getSyncQueue();
      setQueueLength(queue.length);
    } catch (error) {
      console.error("Error syncing:", error);
    } finally {
      setSyncing(false);
    }
  };

  return { isOnline, queueLength, syncing, manualSync };
}


