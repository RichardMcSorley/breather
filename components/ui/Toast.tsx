"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration: number;
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe(() => {
      setToasts(toast.getToasts());
    });

    // Initial load
    setToasts(toast.getToasts());

    return unsubscribe;
  }, []);

  const getToastStyles = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "bg-green-600 text-white";
      case "error":
        return "bg-red-600 text-white";
      case "warning":
        return "bg-yellow-600 text-white";
      case "info":
      default:
        return "bg-blue-600 text-white";
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={`px-4 py-3 rounded-lg shadow-lg min-w-[300px] max-w-md flex items-center justify-between ${getToastStyles(
            toastItem.type
          )}`}
        >
          <span className="flex-1">{toastItem.message}</span>
          <button
            onClick={() => {
              // Access the remove method from the toast manager instance
              toast.remove(toastItem.id);
            }}
            className="ml-4 text-white hover:text-gray-200 font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

