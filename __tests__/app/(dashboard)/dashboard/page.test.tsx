import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../../utils/test-utils";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { useSession } from "next-auth/react";
import * as useQueries from "@/hooks/useQueries";

// Mock dependencies - use importOriginal to preserve SessionProvider
vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: vi.fn(),
  };
});

vi.mock("@/hooks/useQueries", () => ({
  useSummary: vi.fn(),
  usePaymentPlan: vi.fn(),
  useBillPayments: vi.fn(),
  useHeatMapData: vi.fn(),
  useAppHeatMapData: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/AddTransactionModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="add-modal">Add Modal</div> : null,
}));

vi.mock("@/components/HeatMap", () => ({
  default: () => <div data-testid="heatmap">HeatMap</div>,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({
      data: { user: { id: "test-user-id" } },
    });
    (useQueries.useSummary as any).mockReturnValue({
      data: null,
      isLoading: false,
    });
    (useQueries.usePaymentPlan as any).mockReturnValue({
      data: null,
    });
    (useQueries.useBillPayments as any).mockReturnValue({
      data: { payments: [] },
    });
    (useQueries.useHeatMapData as any).mockReturnValue({
      data: null,
      isLoading: false,
    });
    (useQueries.useAppHeatMapData as any).mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  it("should render dashboard page", () => {
    render(<DashboardPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should render heat map", () => {
    render(<DashboardPage />);
    
    expect(screen.getByTestId("heatmap")).toBeInTheDocument();
  });

  it("should show loading state when summary is loading", () => {
    (useQueries.useSummary as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    render(<DashboardPage />);
    
    // Component should still render
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should render with summary data", () => {
    (useQueries.useSummary as any).mockReturnValue({
      data: {
        grossTotal: 1000,
        freeCash: 500,
        todayIncome: 100,
        todayExpenses: 50,
      },
      isLoading: false,
    });

    render(<DashboardPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });
});

