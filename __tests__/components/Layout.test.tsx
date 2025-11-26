import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../utils/test-utils";
import Layout from "@/components/Layout";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

// Mock dependencies - use importOriginal to preserve SessionProvider from setup
vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("@/components/ThemeProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ThemeProvider")>();
  return {
    ...actual,
    useTheme: vi.fn(),
  };
});

vi.mock("@/components/OfflineIndicator", () => ({
  default: () => <div data-testid="offline-indicator">Offline Indicator</div>,
}));

vi.mock("@/components/ui/Toast", () => ({
  default: () => <div data-testid="toast-container">Toast Container</div>,
}));

describe("Layout", () => {
  const mockPush = vi.fn();
  const mockToggleTheme = vi.fn();
  const mockSignOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: mockPush,
    });
    (usePathname as any).mockReturnValue("/dashboard");
    (useTheme as any).mockReturnValue({
      theme: "light",
      toggleTheme: mockToggleTheme,
    });
    (useSession as any).mockReturnValue({
      data: {
        user: {
          id: "test-user-id",
          name: "Test User",
        },
      },
    });
    (signOut as any).mockImplementation(mockSignOut);
  });

  it("should render header with title", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText("Breather")).toBeInTheDocument();
  });

  it("should render all navigation items", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText("Bills")).toBeInTheDocument();
    expect(screen.getByText("Mileage")).toBeInTheDocument();
  });

  it("should highlight active route", () => {
    (usePathname as any).mockReturnValue("/dashboard");
    
    const { container } = render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveClass("text-green-600");
  });

  it("should not highlight inactive routes", () => {
    (usePathname as any).mockReturnValue("/dashboard");
    
    const { container } = render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const historyLink = screen.getByText("Logs").closest("a");
    expect(historyLink).not.toHaveClass("text-green-600");
  });

  it("should render theme toggle button", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const themeButton = screen.getByLabelText("Toggle dark mode");
    expect(themeButton).toBeInTheDocument();
    expect(themeButton).toHaveTextContent("🌙");
  });

  it("should show sun icon when theme is dark", () => {
    (useTheme as any).mockReturnValue({
      theme: "dark",
      toggleTheme: mockToggleTheme,
    });

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const themeButton = screen.getByLabelText("Toggle dark mode");
    expect(themeButton).toHaveTextContent("☀️");
  });

  it("should call toggleTheme when theme button is clicked", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const themeButton = screen.getByLabelText("Toggle dark mode");
    fireEvent.click(themeButton);

    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("should render settings button", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const settingsButton = screen.getByLabelText("Settings");
    expect(settingsButton).toBeInTheDocument();
    expect(settingsButton).toHaveTextContent("⚙️");
  });

  it("should navigate to configuration when settings button is clicked", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const settingsButton = screen.getByLabelText("Settings");
    fireEvent.click(settingsButton);

    expect(mockPush).toHaveBeenCalledWith("/configuration");
  });

  it("should render sign out button when user is authenticated", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("should not render sign out button when user is not authenticated", () => {
    (useSession as any).mockReturnValue({
      data: null,
    });

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
  });

  it("should call signOut when sign out button is clicked", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const signOutButton = screen.getByText("Sign Out");
    fireEvent.click(signOutButton);

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("should render children", () => {
    render(
      <Layout>
        <div data-testid="child-content">Child Content</div>
      </Layout>
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Child Content")).toBeInTheDocument();
  });

  it("should render OfflineIndicator", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByTestId("offline-indicator")).toBeInTheDocument();
  });

  it("should render ToastContainer", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByTestId("toast-container")).toBeInTheDocument();
  });

  it("should render navigation with correct icons", () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText("📊")).toBeInTheDocument(); // Dashboard
    expect(screen.getByText("🕐")).toBeInTheDocument(); // Logs
    expect(screen.getByText("📄")).toBeInTheDocument(); // Bills
    expect(screen.getByText("🚗")).toBeInTheDocument(); // Mileage
  });

  it("should handle different active routes", () => {
    (usePathname as any).mockReturnValue("/bills");
    
    const { container } = render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const billsLink = screen.getByText("Bills").closest("a");
    expect(billsLink).toHaveClass("text-green-600");
  });
});

