import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../utils/test-utils";
import OfflineIndicator from "@/components/OfflineIndicator";
import { useOfflineSync } from "@/hooks/useOfflineSync";

// Mock useOfflineSync
vi.mock("@/hooks/useOfflineSync", () => ({
  useOfflineSync: vi.fn(),
}));

describe("OfflineIndicator", () => {
  const mockManualSync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when online and queue is empty", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 0,
      syncing: false,
      manualSync: mockManualSync,
    });

    const { container } = render(<OfflineIndicator />);
    
    expect(container.firstChild).toBeNull();
  });

  it("should render offline message when offline", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: false,
      queueLength: 0,
      syncing: false,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  it("should have red background when offline", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: false,
      queueLength: 0,
      syncing: false,
      manualSync: mockManualSync,
    });

    const { container } = render(<OfflineIndicator />);
    const indicator = container.firstChild as HTMLElement;
    
    expect(indicator).toHaveClass("bg-red-100");
  });

  it("should show syncing message when syncing", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 5,
      syncing: true,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.getByText("Syncing...")).toBeInTheDocument();
  });

  it("should show queue length when online with pending items", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 3,
      syncing: false,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.getByText("3 pending sync")).toBeInTheDocument();
  });

  it("should have yellow background when online with pending items", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 3,
      syncing: false,
      manualSync: mockManualSync,
    });

    const { container } = render(<OfflineIndicator />);
    const indicator = container.firstChild as HTMLElement;
    
    expect(indicator).toHaveClass("bg-yellow-100");
  });

  it("should show Sync Now button when online, has queue, and not syncing", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 2,
      syncing: false,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.getByText("Sync Now")).toBeInTheDocument();
  });

  it("should not show Sync Now button when syncing", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 2,
      syncing: true,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.queryByText("Sync Now")).not.toBeInTheDocument();
  });

  it("should not show Sync Now button when queue is empty", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 0,
      syncing: false,
      manualSync: mockManualSync,
    });

    const { container } = render(<OfflineIndicator />);
    
    // Should return null when online and queue is empty
    expect(container.firstChild).toBeNull();
  });

  it("should call manualSync when Sync Now button is clicked", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 2,
      syncing: false,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    const syncButton = screen.getByText("Sync Now");
    fireEvent.click(syncButton);
    
    expect(mockManualSync).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple pending items", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: true,
      queueLength: 10,
      syncing: false,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.getByText("10 pending sync")).toBeInTheDocument();
  });

  it("should not show Sync Now button when offline", () => {
    (useOfflineSync as any).mockReturnValue({
      isOnline: false,
      queueLength: 5,
      syncing: false,
      manualSync: mockManualSync,
    });

    render(<OfflineIndicator />);
    
    expect(screen.queryByText("Sync Now")).not.toBeInTheDocument();
  });
});

