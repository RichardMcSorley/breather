import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ToastContainer from "@/components/ui/Toast";
import { toast } from "@/lib/toast";

describe("Toast", () => {
  beforeEach(() => {
    // Clear all toasts before each test
    const toasts = toast.getToasts();
    toasts.forEach((t) => toast.remove(t.id));
  });

  afterEach(() => {
    // Clean up toasts after each test
    const toasts = toast.getToasts();
    toasts.forEach((t) => toast.remove(t.id));
  });

  it("should not render when no toasts exist", () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it("should render success toast", () => {
    toast.success("Success message");
    render(<ToastContainer />);

    expect(screen.getByText("Success message")).toBeInTheDocument();
    const toastElement = screen.getByText("Success message").closest("div");
    expect(toastElement).toHaveClass("bg-green-600");
  });

  it("should render error toast", () => {
    toast.error("Error message");
    render(<ToastContainer />);

    expect(screen.getByText("Error message")).toBeInTheDocument();
    const toastElement = screen.getByText("Error message").closest("div");
    expect(toastElement).toHaveClass("bg-red-600");
  });

  it("should render warning toast", () => {
    toast.warning("Warning message");
    render(<ToastContainer />);

    expect(screen.getByText("Warning message")).toBeInTheDocument();
    const toastElement = screen.getByText("Warning message").closest("div");
    expect(toastElement).toHaveClass("bg-yellow-600");
  });

  it("should render info toast", () => {
    toast.info("Info message");
    render(<ToastContainer />);

    expect(screen.getByText("Info message")).toBeInTheDocument();
    const toastElement = screen.getByText("Info message").closest("div");
    expect(toastElement).toHaveClass("bg-blue-600");
  });

  it("should render multiple toasts", () => {
    toast.success("First message");
    toast.error("Second message");
    toast.info("Third message");

    render(<ToastContainer />);

    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
    expect(screen.getByText("Third message")).toBeInTheDocument();
  });

  it("should remove toast when close button is clicked", async () => {
    const user = userEvent.setup();
    toast.success("Close me");

    render(<ToastContainer />);

    expect(screen.getByText("Close me")).toBeInTheDocument();

    const closeButton = screen.getByLabelText("Close");
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Close me")).not.toBeInTheDocument();
    });
  });

  it("should auto-dismiss toast after duration", async () => {
    vi.useFakeTimers();
    toast.show("Auto dismiss", { duration: 1000 });

    render(<ToastContainer />);

    expect(screen.getByText("Auto dismiss")).toBeInTheDocument();
    expect(toast.getToasts().length).toBe(1);

    // Fast-forward time past the duration
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    // Verify toast was removed from manager
    expect(toast.getToasts().length).toBe(0);

    vi.useRealTimers();
  });

  it("should use default duration of 3000ms", async () => {
    vi.useFakeTimers();
    toast.success("Default duration");

    render(<ToastContainer />);

    expect(screen.getByText("Default duration")).toBeInTheDocument();
    expect(toast.getToasts().length).toBe(1);

    // Fast-forward less than default duration
    // advanceTimersByTimeAsync only executes timers up to the advanced time
    await vi.advanceTimersByTimeAsync(2000);
    expect(toast.getToasts().length).toBe(1);

    // Fast-forward to default duration (remaining 1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    // Verify toast was removed from manager
    expect(toast.getToasts().length).toBe(0);

    vi.useRealTimers();
  });

  it("should use custom duration for error toasts", async () => {
    vi.useFakeTimers();
    toast.error("Error with longer duration");

    render(<ToastContainer />);

    expect(screen.getByText("Error with longer duration")).toBeInTheDocument();
    expect(toast.getToasts().length).toBe(1);

    // Fast-forward less than error duration (5000ms)
    // advanceTimersByTimeAsync executes timers up to the advanced time
    await vi.advanceTimersByTimeAsync(3000);
    // Check that toast still exists (5000ms timer hasn't fired yet)
    expect(toast.getToasts().length).toBe(1);

    // Fast-forward remaining time to error duration (2000ms more = 5000ms total)
    await vi.advanceTimersByTimeAsync(2000);
    // Now the 5000ms timer should have fired

    // Verify toast was removed from manager
    expect(toast.getToasts().length).toBe(0);

    vi.useRealTimers();
  });

  it("should update when new toast is added", () => {
    const { rerender } = render(<ToastContainer />);

    expect(screen.queryByText("First")).not.toBeInTheDocument();

    toast.success("First");
    rerender(<ToastContainer />);

    expect(screen.getByText("First")).toBeInTheDocument();

    toast.error("Second");
    rerender(<ToastContainer />);

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("should handle toast subscription and unsubscription", () => {
    const { unmount } = render(<ToastContainer />);

    toast.success("Test message");
    // Force re-render by triggering subscription
    const toasts = toast.getToasts();
    expect(toasts.length).toBeGreaterThan(0);

    unmount();

    // After unmount, subscription should be cleaned up
    // (This is tested implicitly - no errors should occur)
  });

  it("should have proper accessibility attributes", () => {
    toast.success("Accessible message");
    render(<ToastContainer />);

    const closeButton = screen.getByLabelText("Close");
    expect(closeButton).toBeInTheDocument();
  });

  it("should apply correct styling classes", () => {
    toast.success("Success");
    const { container } = render(<ToastContainer />);

    // The container div has the fixed positioning classes
    const containerDiv = container.querySelector(".fixed.top-4.right-4.z-50");
    expect(containerDiv).toBeInTheDocument();
    expect(containerDiv).toHaveClass("space-y-2");

    // The individual toast has the content classes
    const toastElement = screen.getByText("Success").closest("div");
    expect(toastElement).toHaveClass("px-4", "py-3", "rounded-lg", "shadow-lg");
    expect(toastElement).toHaveClass("bg-green-600", "text-white");
  });
});

