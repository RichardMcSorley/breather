import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../utils/test-utils";
import { render as baseRender } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";

describe("ThemeProvider", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Reset localStorage
    localStorage.clear();
    
    // Reset matchMedia mock
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    
    // Remove dark class from document
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    // Don't try to restore localStorage - it's read-only in the test environment
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("should render children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Test Child</div>
      </ThemeProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("should default to light theme when no saved preference", async () => {
    localStorage.removeItem("theme");
    
    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme-default">{theme}</div>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-default")).toHaveTextContent("light");
    });
  });

  it("should use saved theme from localStorage", async () => {
    localStorage.setItem("theme", "dark");
    
    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme-saved">{theme}</div>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-saved")).toHaveTextContent("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("should use system preference when no saved theme", async () => {
    localStorage.removeItem("theme");
    
    // Mock prefers dark mode
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    
    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme-system">{theme}</div>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-system")).toHaveTextContent("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("should toggle theme from light to dark", async () => {
    localStorage.setItem("theme", "light");
    
    const TestComponent = () => {
      const { theme, toggleTheme } = useTheme();
      return (
        <div>
          <div data-testid="theme-toggle-light">{theme}</div>
          <button onClick={toggleTheme} data-testid="toggle-light">Toggle</button>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-toggle-light")).toHaveTextContent("light");
    });

    const toggleButton = screen.getByTestId("toggle-light");
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId("theme-toggle-light")).toHaveTextContent("dark");
      expect(localStorage.getItem("theme")).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("should toggle theme from dark to light", async () => {
    localStorage.setItem("theme", "dark");
    
    const TestComponent = () => {
      const { theme, toggleTheme } = useTheme();
      return (
        <div>
          <div data-testid="theme-toggle-dark">{theme}</div>
          <button onClick={toggleTheme} data-testid="toggle-dark">Toggle</button>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-toggle-dark")).toHaveTextContent("dark");
    });

    const toggleButton = screen.getByTestId("toggle-dark");
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId("theme-toggle-dark")).toHaveTextContent("light");
      expect(localStorage.getItem("theme")).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("should add dark class to document when theme is dark", async () => {
    localStorage.setItem("theme", "dark");
    
    render(
      <ThemeProvider>
        <div>Test</div>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("should remove dark class from document when theme is light", async () => {
    localStorage.setItem("theme", "light");
    
    render(
      <ThemeProvider>
        <div>Test</div>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("should save theme to localStorage when toggled", async () => {
    localStorage.removeItem("theme");
    
    const TestComponent = () => {
      const { toggleTheme } = useTheme();
      return <button onClick={toggleTheme} data-testid="toggle-save">Toggle</button>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      // Wait for initial mount
    });

    const toggleButton = screen.getByTestId("toggle-save");
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("dark");
    });
  });

  it("should return default values when useTheme is called outside provider", () => {
    // Clear any previous theme state - ensure clean state
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    
    // Create a fresh component that doesn't use the ThemeProvider context
    // This tests the fallback behavior when context is undefined
    const TestComponent = () => {
      const { theme, toggleTheme } = useTheme();
      return (
        <div>
          <div data-testid="theme-outside">{theme}</div>
          <button onClick={toggleTheme} data-testid="toggle-outside">Toggle</button>
        </div>
      );
    };

    // Render without ThemeProvider wrapper - use baseRender to avoid the AllTheProviders wrapper
    // that includes ThemeProvider from test-utils
    const { unmount } = baseRender(<TestComponent />);

    // The default should be "light" when outside provider (context is undefined)
    const themeElement = screen.getByTestId("theme-outside");
    // The useTheme hook returns { theme: "light", toggleTheme: noop } when context is undefined
    expect(themeElement).toHaveTextContent("light");
    
    // Toggle should be a no-op
    const toggleButton = screen.getByTestId("toggle-outside");
    fireEvent.click(toggleButton);
    
    // Theme should still be light (no-op) since toggleTheme is a no-op outside provider
    expect(themeElement).toHaveTextContent("light");
    
    unmount();
  });

  it("should not render theme-dependent content until mounted", async () => {
    localStorage.setItem("theme", "dark");
    
    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme-mounted">{theme}</div>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Initially should render children without theme context
    // Then after mount, should show dark theme
    await waitFor(() => {
      expect(screen.getByTestId("theme-mounted")).toHaveTextContent("dark");
    });
  });
});

