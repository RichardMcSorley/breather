"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface JsonViewerProps {
  data: any;
  level?: number;
  maxLevel?: number;
}

function JsonViewer({ data, level = 0, maxLevel = 10 }: JsonViewerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isExpanded = (key: string) => expanded[key] ?? level < 2; // Auto-expand first 2 levels

  if (level > maxLevel) {
    return <span className="text-gray-500 dark:text-gray-400">...</span>;
  }

  if (data === null) {
    return <span className="text-gray-500 dark:text-gray-400">null</span>;
  }

  if (typeof data === "string") {
    return <span className="text-green-600 dark:text-green-400">"{data}"</span>;
  }

  if (typeof data === "number") {
    return <span className="text-blue-600 dark:text-blue-400">{data}</span>;
  }

  if (typeof data === "boolean") {
    return <span className="text-purple-600 dark:text-purple-400">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">[]</span>;
    }

    const key = `array-${level}`;
    const isOpen = isExpanded(key);

    return (
      <div className="ml-2">
        <button
          onClick={() => toggle(key)}
          className="flex items-center gap-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          {isOpen ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="text-gray-600 dark:text-gray-400">[</span>
          <span className="text-gray-500 dark:text-gray-400 text-xs">
            {data.length} {data.length === 1 ? "item" : "items"}
          </span>
          <span className="text-gray-600 dark:text-gray-400">]</span>
        </button>
        {isOpen && (
          <div className="ml-4 mt-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
            {data.map((item, index) => (
              <div key={index} className="mb-1">
                <span className="text-gray-500 dark:text-gray-400 text-xs">
                  {index}:
                </span>{" "}
                <JsonViewer data={item} level={level + 1} maxLevel={maxLevel} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">{`{}`}</span>;
    }

    const key = `object-${level}`;
    const isOpen = isExpanded(key);

    return (
      <div className="ml-2">
        <button
          onClick={() => toggle(key)}
          className="flex items-center gap-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          {isOpen ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="text-gray-600 dark:text-gray-400">{`{`}</span>
          <span className="text-gray-500 dark:text-gray-400 text-xs">
            {keys.length} {keys.length === 1 ? "key" : "keys"}
          </span>
          <span className="text-gray-600 dark:text-gray-400">{`}`}</span>
        </button>
        {isOpen && (
          <div className="ml-4 mt-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
            {keys.map((k) => (
              <div key={k} className="mb-1">
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  {k}:
                </span>{" "}
                <JsonViewer data={data[k]} level={level + 1} maxLevel={maxLevel} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

interface JsonViewerModalProps {
  data: any;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function JsonViewerModal({
  data,
  title = "JSON Data",
  isOpen,
  onClose,
}: JsonViewerModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="font-mono text-sm">
              <JsonViewer data={data} />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              }}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
            >
              Copy JSON
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 min-h-[44px]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

