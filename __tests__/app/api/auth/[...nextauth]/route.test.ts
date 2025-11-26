import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock NextAuth before any imports
const mockNextAuth = vi.fn((options) => {
  return vi.fn((req: any, res: any) => {
    return { status: 200 };
  });
});

vi.mock("next-auth", () => ({
  default: mockNextAuth,
}));

// Mock config
vi.mock("@/app/api/auth/[...nextauth]/config", () => ({
  authOptions: {
    providers: [],
    callbacks: {},
  },
}));

describe("NextAuth Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to ensure fresh import
    vi.resetModules();
  });

  it("should export GET handler", async () => {
    const routeModule = await import("@/app/api/auth/[...nextauth]/route");
    
    expect(routeModule.GET).toBeDefined();
    expect(typeof routeModule.GET).toBe("function");
  });

  it("should export POST handler", async () => {
    const routeModule = await import("@/app/api/auth/[...nextauth]/route");
    
    expect(routeModule.POST).toBeDefined();
    expect(typeof routeModule.POST).toBe("function");
  });

  it("should use NextAuth with authOptions", async () => {
    vi.resetModules();
    await import("@/app/api/auth/[...nextauth]/route");
    
    expect(mockNextAuth).toHaveBeenCalled();
  });
});

