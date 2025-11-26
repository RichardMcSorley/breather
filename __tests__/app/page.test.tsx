import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("Home Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redirect to dashboard when session exists", async () => {
    (getServerSession as any).mockResolvedValue({
      user: { id: "test-user-id" },
    });

    const HomePage = (await import("@/app/page")).default;
    
    // Since it's an async component that redirects, we can't easily test the render
    // But we can test that redirect is called
    try {
      await HomePage({});
    } catch (e) {
      // Redirect throws, which is expected
    }

    expect(getServerSession).toHaveBeenCalledWith(authOptions);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("should redirect to login when session does not exist", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const HomePage = (await import("@/app/page")).default;
    
    try {
      await HomePage({});
    } catch (e) {
      // Redirect throws, which is expected
    }

    expect(getServerSession).toHaveBeenCalledWith(authOptions);
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

