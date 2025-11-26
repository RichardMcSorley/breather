import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../../utils/test-utils";
import userEvent from "@testing-library/user-event";
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
      data: { transactions: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
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
          { _id: "1", amount: 100, type: "income", date: "2024-01-15", time: "10:00", isBill: false },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
      isLoading: false,
    });

    render(<HistoryPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should display pagination controls when there are multiple pages", () => {
    (useQueries.useTransactions as any).mockReturnValue({
      data: {
        transactions: Array.from({ length: 50 }, (_, i) => ({
          _id: `${i + 1}`,
          amount: 100 + i,
          type: "income" as const,
          date: "2024-01-15",
          time: "10:00",
          isBill: false,
        })),
        pagination: { page: 1, limit: 50, total: 150, totalPages: 3 },
      },
      isLoading: false,
    });

    render(<HistoryPage />);
    
    expect(screen.getByText("Showing 1 to 50 of 150 transactions")).toBeInTheDocument();
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("should disable Previous button on first page", () => {
    (useQueries.useTransactions as any).mockReturnValue({
      data: {
        transactions: Array.from({ length: 50 }, (_, i) => ({
          _id: `${i + 1}`,
          amount: 100 + i,
          type: "income" as const,
          date: "2024-01-15",
          time: "10:00",
          isBill: false,
        })),
        pagination: { page: 1, limit: 50, total: 150, totalPages: 3 },
      },
      isLoading: false,
    });

    render(<HistoryPage />);
    
    const prevButton = screen.getByText("Previous");
    expect(prevButton).toBeDisabled();
  });

  it("should disable Next button on last page", async () => {
    const user = userEvent.setup();
    let currentPage = 1;
    
    (useQueries.useTransactions as any).mockImplementation((filterType, filterTag, page, limit) => {
      currentPage = page;
      const isLastPage = page === 3;
      return {
        data: {
          transactions: Array.from({ length: isLastPage ? 50 : 50 }, (_, i) => ({
            _id: `${(page - 1) * 50 + i + 1}`,
            amount: 100 + (page - 1) * 50 + i,
            type: "income" as const,
            date: "2024-01-15",
            time: "10:00",
            isBill: false,
          })),
          pagination: { page, limit, total: 150, totalPages: 3 },
        },
        isLoading: false,
      };
    });

    const { rerender } = render(<HistoryPage />);
    
    // Navigate to page 2
    const nextButton1 = screen.getByText("Next");
    await user.click(nextButton1);
    await waitFor(() => {
      expect(useQueries.useTransactions).toHaveBeenCalledWith("all", "all", 2, 50);
    });

    // Navigate to page 3 (last page)
    rerender(<HistoryPage />);
    const nextButton2 = screen.getByText("Next");
    await user.click(nextButton2);
    await waitFor(() => {
      expect(useQueries.useTransactions).toHaveBeenCalledWith("all", "all", 3, 50);
    });

    // Now on last page, Next button should be disabled
    rerender(<HistoryPage />);
    const nextButton3 = screen.getByText("Next");
    expect(nextButton3).toBeDisabled();
  });

  it("should call useTransactions with pagination parameters", () => {
    (useQueries.useTransactions as any).mockReturnValue({
      data: {
        transactions: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      },
      isLoading: false,
    });

    render(<HistoryPage />);
    
    expect(useQueries.useTransactions).toHaveBeenCalledWith("all", "all", 1, 50);
  });

  it("should reset to page 1 when filter type changes", async () => {
    const user = userEvent.setup();
    let currentPage = 1;
    
    (useQueries.useTransactions as any).mockImplementation((filterType, filterTag, page, limit) => {
      currentPage = page;
      return {
        data: {
          transactions: [],
          pagination: { page, limit, total: 100, totalPages: 2 },
        },
        isLoading: false,
      };
    });

    const { rerender } = render(<HistoryPage />);
    
    // Change to page 2
    const nextButton = screen.getByText("Next");
    await user.click(nextButton);
    await waitFor(() => {
      expect(useQueries.useTransactions).toHaveBeenCalledWith("all", "all", 2, 50);
    });

    // Change filter type - should reset to page 1
    const incomeButton = screen.getByText("Income");
    await user.click(incomeButton);
    await waitFor(() => {
      expect(useQueries.useTransactions).toHaveBeenCalledWith("income", "all", 1, 50);
    });
  });
});

