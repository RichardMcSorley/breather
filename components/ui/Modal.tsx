"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  zIndex?: number;
  footer?: ReactNode;
  headerActions?: ReactNode;
  preventClose?: boolean; // Prevent closing via backdrop click
}

export default function Modal({ isOpen, onClose, title, children, zIndex = 9999, footer, headerActions, preventClose }: ModalProps) {
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

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (preventClose) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-70 p-4"
      style={{ zIndex }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl rounded-b-lg w-full max-w-md max-h-[90vh] overflow-y-auto relative"
        style={{ zIndex: zIndex + 1 }}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 id="modal-title" className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
            <div className="flex items-center gap-2">
              {headerActions}
              <button
                onClick={(e) => {
                  if (preventClose) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  onClose();
                }}
                disabled={preventClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ×
              </button>
            </div>
          </div>
        )}
        <div className="p-4">{children}</div>
        {footer && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">{footer}</div>
        )}
      </div>
    </div>
  );
}


