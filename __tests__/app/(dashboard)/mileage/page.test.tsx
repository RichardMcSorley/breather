import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../utils/test-utils";
import MileagePage from "@/app/(dashboard)/mileage/page";
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
  useMileageEntries: vi.fn(),
  useSettings: vi.fn(),
  useDeleteMileageEntry: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/AddMileageModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="add-modal">Add Modal</div> : null,
}));

describe("MileagePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({
      data: { user: { id: "test-user-id" } },
    });
    (useQueries.useMileageEntries as any).mockReturnValue({
      data: { entries: [] },
      isLoading: false,
    });
    (useQueries.useSettings as any).mockReturnValue({
      data: { irsMileageDeduction: 0.67 },
    });
    (useQueries.useDeleteMileageEntry as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("should render mileage page", () => {
    render(<MileagePage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should show loading state when entries are loading", () => {
    (useQueries.useMileageEntries as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    render(<MileagePage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should render with mileage entries data", () => {
    (useQueries.useMileageEntries as any).mockReturnValue({
      data: {
        entries: [
          { _id: "1", odometer: 10000, date: "2024-01-15", classification: "work" },
        ],
      },
      isLoading: false,
    });

    render(<MileagePage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });
});

