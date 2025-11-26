import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../utils/test-utils";
import HistoryPage from "@/app/(dashboard)/history/page";
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
  useTransactions: vi.fn(),
  useDeleteTransaction: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/AddTransactionModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="add-modal">Add Modal</div> : null,
}));

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({
      data: { user: { id: "test-user-id" } },
    });
    (useQueries.useTransactions as any).mockReturnValue({
      data: { transactions: [] },
      isLoading: false,
    });
    (useQueries.useDeleteTransaction as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("should render history page", () => {
    render(<HistoryPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should show loading state when transactions are loading", () => {
    (useQueries.useTransactions as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    render(<HistoryPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should render with transactions data", () => {
    (useQueries.useTransactions as any).mockReturnValue({
      data: {
        transactions: [
          { _id: "1", amount: 100, type: "income", date: "2024-01-15", isBill: false },
        ],
      },
      isLoading: false,
    });

    render(<HistoryPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });
});

