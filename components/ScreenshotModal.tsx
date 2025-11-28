"use client";

import { useEffect } from "react";

interface ScreenshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenshot: string | null | undefined;
  title?: string;
}

export default function ScreenshotModal({
  isOpen,
  onClose,
  screenshot,
  title = "Screenshot",
}: ScreenshotModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !screenshot) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-90 dark:bg-opacity-95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="screenshot-modal-title"
    >
      <div
        className="relative w-full h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-black bg-opacity-50 text-white">
          <h2 id="screenshot-modal-title" className="text-lg font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 text-3xl font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Screenshot Content */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-4">
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt={title}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

