/**
 * Simple toast notification utility
 * Provides a lightweight way to show user notifications without blocking the UI
 */

type ToastType = "success" | "error" | "info" | "warning";

interface ToastOptions {
  duration?: number; // Duration in milliseconds (default: 3000)
  type?: ToastType;
}

class ToastManager {
  private toasts: Array<{ id: string; message: string; type: ToastType; duration: number }> = [];
  private listeners: Array<() => void> = [];

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  show(message: string, options: ToastOptions = {}) {
    const id = Math.random().toString(36).substring(2, 9);
    const toast = {
      id,
      message,
      type: options.type || "info",
      duration: options.duration || 3000,
    };

    this.toasts.push(toast);
    this.notify();

    // Auto-remove after duration
    setTimeout(() => {
      this.remove(id);
    }, toast.duration);

    return id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  getToasts() {
    return [...this.toasts];
  }

  success(message: string, options?: Omit<ToastOptions, "type">) {
    return this.show(message, { ...options, type: "success" });
  }

  error(message: string, options?: Omit<ToastOptions, "type">) {
    return this.show(message, { ...options, type: "error", duration: options?.duration || 5000 });
  }

  info(message: string, options?: Omit<ToastOptions, "type">) {
    return this.show(message, { ...options, type: "info" });
  }

  warning(message: string, options?: Omit<ToastOptions, "type">) {
    return this.show(message, { ...options, type: "warning" });
  }
}

export const toast = new ToastManager();

// Export the class for type checking
export { ToastManager };

// React hook for using toasts in components
export function useToast() {
  return {
    success: (message: string, options?: Omit<ToastOptions, "type">) =>
      toast.success(message, options),
    error: (message: string, options?: Omit<ToastOptions, "type">) =>
      toast.error(message, options),
    info: (message: string, options?: Omit<ToastOptions, "type">) =>
      toast.info(message, options),
    warning: (message: string, options?: Omit<ToastOptions, "type">) =>
      toast.warning(message, options),
  };
}

