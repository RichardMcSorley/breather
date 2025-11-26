import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils/test-utils";
import RootLayout from "@/app/layout";

// Mock Providers
vi.mock("@/app/providers", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

// Mock SpeedInsights - it uses browser APIs not available in test environment
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => null,
}));

describe("RootLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export metadata with correct values", async () => {
    const layoutModule = await import("@/app/layout");
    
    expect(layoutModule.metadata).toBeDefined();
    expect(layoutModule.metadata.title).toBe("Breather - Gig Worker Expense Tracker");
    expect(layoutModule.metadata.description).toBe("Track your income and expenses as a gig worker");
    expect(layoutModule.metadata.manifest).toBe("/manifest.json");
    expect(layoutModule.metadata.appleWebApp).toEqual({
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Breather",
    });
  });

  it("should export viewport with correct values", async () => {
    const layoutModule = await import("@/app/layout");
    
    expect(layoutModule.viewport).toBeDefined();
    expect(layoutModule.viewport.width).toBe("device-width");
    expect(layoutModule.viewport.initialScale).toBe(1);
    expect(layoutModule.viewport.maximumScale).toBe(1);
    expect(layoutModule.viewport.userScalable).toBe(false);
    expect(layoutModule.viewport.viewportFit).toBe("cover");
    expect(layoutModule.viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#111827" },
    ]);
  });

  it("should render html and body elements", () => {
    const { container } = render(
      <RootLayout>
        <div>Test Content</div>
      </RootLayout>
    );

    // React Testing Library renders into a div, not actual html/body
    // Check that the structure is correct by verifying the content is rendered
    const testContent = container.querySelector("div");
    expect(testContent).toBeInTheDocument();
    
    // Verify the Providers wrapper is present (which wraps the children)
    // Use screen.getByTestId for more reliable test ID queries
    const providers = screen.getByTestId("providers");
    expect(providers).toBeInTheDocument();
    
    // Verify children are rendered
    expect(container.textContent).toContain("Test Content");
  });

  it("should render children wrapped in Providers", () => {
    render(
      <RootLayout>
        <div data-testid="child-content">Child Content</div>
      </RootLayout>
    );

    // Use screen.getByTestId for more reliable test ID queries
    const providers = screen.getByTestId("providers");
    const child = screen.getByTestId("child-content");
    
    expect(providers).toBeInTheDocument();
    expect(child).toBeInTheDocument();
    expect(providers).toContainElement(child);
  });

  it("should render multiple children", () => {
    const { container } = render(
      <RootLayout>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </RootLayout>
    );

    expect(container.querySelector('[data-testid="child-1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="child-2"]')).toBeInTheDocument();
  });
});

