"use client";

import { useState } from "react";

interface MetadataViewerProps {
  metadata: Record<string, any> | null | undefined;
  title?: string;
  userLatitude?: number | null;
  userLongitude?: number | null;
  userAltitude?: number | null;
  userAddress?: string | null;
}

export default function MetadataViewer({ 
  metadata, 
  title = "Metadata",
  userLatitude,
  userLongitude,
  userAltitude,
  userAddress,
}: MetadataViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasMetadata = metadata && typeof metadata === "object" && Object.keys(metadata).length > 0;
  const hasUserLocation = userLatitude !== undefined && userLatitude !== null || 
                          userLongitude !== undefined && userLongitude !== null || 
                          userAltitude !== undefined && userAltitude !== null ||
                          userAddress !== undefined && userAddress !== null;

  if (!hasMetadata && !hasUserLocation) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-2"
      >
        <span>{title}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>
      {isExpanded && (
        <div className="rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <div className="p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto text-gray-800 dark:text-gray-200">
            {hasUserLocation && (
              <div className="mb-3 space-y-1">
                {userLatitude !== undefined && userLatitude !== null && (
                  <div>
                    <span className="font-medium">userLatitude:</span> {userLatitude}
                  </div>
                )}
                {userLongitude !== undefined && userLongitude !== null && (
                  <div>
                    <span className="font-medium">userLongitude:</span> {userLongitude}
                  </div>
                )}
                {userAltitude !== undefined && userAltitude !== null && (
                  <div>
                    <span className="font-medium">userAltitude:</span> {userAltitude}
                  </div>
                )}
                {userAddress !== undefined && userAddress !== null && (
                  <div>
                    <span className="font-medium">userAddress:</span> {userAddress}
                  </div>
                )}
              </div>
            )}
            {hasMetadata && (
              <pre className={hasUserLocation ? "mt-3 pt-3 border-t border-gray-300 dark:border-gray-600" : ""}>
                {JSON.stringify(metadata, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

