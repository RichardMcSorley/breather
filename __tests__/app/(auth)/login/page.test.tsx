import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../utils/test-utils";
import LoginPage from "@/app/(auth)/login/page";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// Mock dependencies - use importOriginal to preserve SessionProvider from setup
vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: vi.fn(),
    signIn: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

describe("LoginPage", () => {
  const mockPush = vi.fn();
  const mockSignIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: mockPush,
    });
    (signIn as any).mockImplementation(mockSignIn);
  });

  it("should render login page with title and description", () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<LoginPage />);

    expect(screen.getByText("BREATHER")).toBeInTheDocument();
    expect(screen.getByText(/Track your income and expenses as a gig worker/i)).toBeInTheDocument();
  });

  it("should render Google sign in button", () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<LoginPage />);

    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });

  it("should call signIn when Google button is clicked", () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<LoginPage />);

    const signInButton = screen.getByText("Sign in with Google");
    fireEvent.click(signInButton);

    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard" });
  });

  it("should show loading state when status is loading", () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: "loading",
    });

    render(<LoginPage />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should redirect to dashboard when authenticated", async () => {
    (useSession as any).mockReturnValue({
      data: { user: { id: "test-user-id" } },
      status: "authenticated",
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("should not redirect when not authenticated", () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<LoginPage />);

    expect(mockPush).not.toHaveBeenCalled();
  });
});

