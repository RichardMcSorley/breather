"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";

export default function OfflineIndicator() {
  const { isOnline, queueLength, syncing, manualSync } = useOfflineSync();

  if (isOnline && queueLength === 0) {
    return null;
  }

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-50 px-4 py-2 ${
        isOnline ? "bg-yellow-100 border-b border-yellow-200" : "bg-red-100 border-b border-red-200"
      }`}
    >
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <span className="text-yellow-800">
                {syncing ? "Syncing..." : `${queueLength} pending sync`}
              </span>
            </>
          ) : (
            <span className="text-red-800">You&apos;re offline</span>
          )}
        </div>
        {isOnline && queueLength > 0 && !syncing && (
          <button
            onClick={manualSync}
            className="text-sm text-yellow-800 underline font-medium min-h-[44px] px-2"
          >
            Sync Now
          </button>
        )}
      </div>
    </div>
  );
}


