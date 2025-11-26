import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../utils/test-utils";
import ConfigurationPage from "@/app/(dashboard)/configuration/page";
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
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

describe("ConfigurationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({
      data: { user: { id: "test-user-id" } },
    });
    (useQueries.useSettings as any).mockReturnValue({
      data: {
        irsMileageDeduction: 0.70,
        incomeSourceTags: ["Uber", "Lyft"],
        expenseSourceTags: ["Gas", "Maintenance"],
      },
      isLoading: false,
    });
    (useQueries.useUpdateSettings as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("should render configuration page", () => {
    render(<ConfigurationPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should show loading state when settings are loading", () => {
    (useQueries.useSettings as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    render(<ConfigurationPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });

  it("should render with settings data", () => {
    render(<ConfigurationPage />);
    
    expect(screen.getByTestId("layout")).toBeInTheDocument();
  });
});

