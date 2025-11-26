import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock next-auth/middleware
const mockWithAuth = vi.fn((config) => {
  return vi.fn((request: NextRequest) => {
    return new Response(null, { status: 200 });
  });
});

vi.mock("next-auth/middleware", () => ({
  withAuth: mockWithAuth,
}));

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export middleware with correct configuration", async () => {
    // Dynamically import to trigger the module
    const middlewareModule = await import("@/middleware");
    
    // Verify withAuth was called with correct config
    expect(mockWithAuth).toHaveBeenCalledWith({
      pages: {
        signIn: "/login",
      },
    });
  });

  it("should export config with correct matcher patterns", async () => {
    const middlewareModule = await import("@/middleware");
    
    expect(middlewareModule.config).toBeDefined();
    expect(middlewareModule.config.matcher).toEqual([
      "/dashboard/:path*",
      "/history/:path*",
      "/bills/:path*",
      "/mileage/:path*",
      "/configuration/:path*",
    ]);
  });

  it("should match dashboard routes", async () => {
    const middlewareModule = await import("@/middleware");
    const matcher = middlewareModule.config.matcher;
    
    // Test that matcher includes dashboard routes
    expect(matcher).toContain("/dashboard/:path*");
  });

  it("should match all protected routes", async () => {
    const middlewareModule = await import("@/middleware");
    const matcher = middlewareModule.config.matcher;
    
    const protectedRoutes = [
      "/dashboard/:path*",
      "/history/:path*",
      "/bills/:path*",
      "/mileage/:path*",
      "/configuration/:path*",
    ];
    
    protectedRoutes.forEach((route) => {
      expect(matcher).toContain(route);
    });
  });
});

