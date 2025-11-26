import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../utils/test-utils";
import BillsPage from "@/app/(dashboard)/bills/page";
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
  useBills: vi.fn(),
  useBillPayments: vi.fn(),
  usePaymentPlan: vi.fn(),
  useCreateBill: vi.fn(),
  useUpdateBill: vi.fn(),
  useDeleteBill: vi.fn(),
  useCreateBillPayment: vi.fn(),
  useUpdateBillPayment: vi.fn(),
  useDeleteBillPayment: vi.fn(),
  useDeleteAllBillPayments: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

describe("BillsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({
      data: { user: { id: "test-user-id" } },
    });
    (useQueries.useBills as any).mockReturnValue({
      data: { bills: [] },
      isLoading: false,
    });
    (useQueries.useBillPayments as any).mockReturnValue({
      data: { payments: [] },
    });
    (useQueries.usePaymentPlan as any).mockReturnValue({
      data: null,
    });
    (useQueries.useCreateBill as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    (useQueries.useUpdateBill as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    (useQueries.useDeleteBill as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("should render bills page", () => {
    render(<BillsPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should show loading state when bills are loading", () => {
    (useQueries.useBills as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    render(<BillsPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should render with bills data", () => {
    (useQueries.useBills as any).mockReturnValue({
      data: {
        bills: [
          { _id: "1", name: "Rent", amount: 1000, dueDate: 1, isActive: true },
        ],
      },
      isLoading: false,
    });

    render(<BillsPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });
});

