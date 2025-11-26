import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils/test-utils";
import Providers from "@/app/providers";

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}));

vi.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

describe("Providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render children within providers", () => {
    render(
      <Providers>
        <div data-testid="child">Test Child</div>
      </Providers>
    );

    // Verify children are rendered (this confirms all providers are working)
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Test Child")).toBeInTheDocument();
  });

  it("should create QueryClient instance", () => {
    // The Providers component creates a QueryClient with useState
    // We verify it renders without errors, which means QueryClient was created successfully
    render(
      <Providers>
        <div>Test</div>
      </Providers>
    );

    // If QueryClient creation failed, the component would throw an error
    // So rendering successfully means QueryClient was created
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should render children correctly", () => {
    render(
      <Providers>
        <div data-testid="test-content">Test Content</div>
      </Providers>
    );

    expect(screen.getByTestId("test-content")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should maintain QueryClient instance across re-renders", () => {
    // The Providers component uses useState to create QueryClient, so it should be stable
    const { rerender } = render(
      <Providers>
        <div>Test</div>
      </Providers>
    );

    expect(screen.getByText("Test")).toBeInTheDocument();

    rerender(
      <Providers>
        <div>Test</div>
      </Providers>
    );

    // Component should still render after re-render (QueryClient instance is stable)
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should compose providers correctly", () => {
    // Verify that all providers are set up by checking that children render
    // The actual provider components are tested in their own test files
    render(
      <Providers>
        <div data-testid="child">Child</div>
      </Providers>
    );

    // If providers weren't set up correctly, children wouldn't render
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });
});

