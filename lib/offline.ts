import { get, set, del, clear } from "idb-keyval";

const SYNC_QUEUE_KEY = "sync_queue";
const OFFLINE_DATA_KEY = "offline_data";

export interface SyncOperation {
  id: string;
  type: "create" | "update" | "delete";
  endpoint: string;
  method: string;
  data?: any;
  timestamp: number;
}

export async function addToSyncQueue(operation: Omit<SyncOperation, "id" | "timestamp">) {
  const queue = (await get<SyncOperation[]>(SYNC_QUEUE_KEY)) || [];
  const newOperation: SyncOperation = {
    ...operation,
    id: `${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
  };
  queue.push(newOperation);
  await set(SYNC_QUEUE_KEY, queue);
  return newOperation.id;
}

export async function getSyncQueue(): Promise<SyncOperation[]> {
  return (await get<SyncOperation[]>(SYNC_QUEUE_KEY)) || [];
}

export async function removeFromSyncQueue(operationId: string) {
  const queue = await getSyncQueue();
  const filtered = queue.filter((op) => op.id !== operationId);
  await set(SYNC_QUEUE_KEY, filtered);
}

export async function clearSyncQueue() {
  await del(SYNC_QUEUE_KEY);
}

export async function syncQueue() {
  if (!navigator.onLine) {
    return { success: false, message: "Offline", syncedOperations: [] };
  }

  const queue = await getSyncQueue();
  const results = [];
  const syncedOperations: SyncOperation[] = [];

  for (const operation of queue) {
    try {
      const response = await fetch(operation.endpoint, {
        method: operation.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: operation.data ? JSON.stringify(operation.data) : undefined,
      });

      if (response.ok) {
        await removeFromSyncQueue(operation.id);
        results.push({ id: operation.id, success: true });
        syncedOperations.push(operation);
      } else {
        results.push({ id: operation.id, success: false, error: await response.text() });
      }
    } catch (error) {
      console.error(`Error syncing operation ${operation.id}:`, error);
      results.push({ id: operation.id, success: false, error: String(error) });
    }
  }

  return { success: true, results, syncedOperations };
}

export async function cacheData(key: string, data: any) {
  const cached = (await get<any>(OFFLINE_DATA_KEY)) || {};
  cached[key] = { data, timestamp: Date.now() };
  await set(OFFLINE_DATA_KEY, cached);
}

export async function getCachedData(key: string, maxAge?: number) {
  const cached = (await get<any>(OFFLINE_DATA_KEY)) || {};
  const item = cached[key];

  if (!item) return null;

  if (maxAge && Date.now() - item.timestamp > maxAge) {
    delete cached[key];
    await set(OFFLINE_DATA_KEY, cached);
    return null;
  }

  return item.data;
}

export async function clearCache() {
  await del(OFFLINE_DATA_KEY);
}


