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

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export proxy with correct configuration", async () => {
    // Dynamically import to trigger the module
    const proxyModule = await import("@/proxy");
    
    // Verify withAuth was called with correct config
    expect(mockWithAuth).toHaveBeenCalledWith({
      pages: {
        signIn: "/login",
      },
    });
  });

  it("should export config with correct matcher patterns", async () => {
    const proxyModule = await import("@/proxy");
    
    expect(proxyModule.config).toBeDefined();
    expect(proxyModule.config.matcher).toEqual([
      "/dashboard/:path*",
      "/history/:path*",
      "/bills/:path*",
      "/mileage/:path*",
      "/configuration/:path*",
      "/ocr-data/:path*",
    ]);
  });

  it("should match dashboard routes", async () => {
    const proxyModule = await import("@/proxy");
    const matcher = proxyModule.config.matcher;
    
    // Test that matcher includes dashboard routes
    expect(matcher).toContain("/dashboard/:path*");
  });

  it("should match all protected routes", async () => {
    const proxyModule = await import("@/proxy");
    const matcher = proxyModule.config.matcher;
    
    const protectedRoutes = [
      "/dashboard/:path*",
      "/history/:path*",
      "/bills/:path*",
      "/mileage/:path*",
      "/configuration/:path*",
      "/ocr-data/:path*",
    ];
    
    protectedRoutes.forEach((route) => {
      expect(matcher).toContain(route);
    });
  });
});

