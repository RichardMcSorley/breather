"use client";

import { useState } from "react";

interface MetadataViewerProps {
  metadata: Record<string, any> | null | undefined;
  title?: string;
}

export default function MetadataViewer({ metadata, title = "Metadata" }: MetadataViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!metadata || typeof metadata !== "object" || Object.keys(metadata).length === 0) {
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
          <pre className="p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto text-gray-800 dark:text-gray-200">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

