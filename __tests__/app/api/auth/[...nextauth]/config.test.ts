import { describe, it, expect, vi, beforeEach } from "vitest";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";

// Mock GoogleProvider
vi.mock("next-auth/providers/google", () => ({
  default: vi.fn((config) => ({
    id: "google",
    name: "Google",
    ...config,
  })),
}));

describe("authOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have providers configured", () => {
    expect(authOptions.providers).toBeDefined();
    expect(Array.isArray(authOptions.providers)).toBe(true);
  });

  it("should have session callback", () => {
    expect(authOptions.callbacks).toBeDefined();
    expect(authOptions.callbacks?.session).toBeDefined();
    expect(typeof authOptions.callbacks?.session).toBe("function");
  });

  it("should have jwt callback", () => {
    expect(authOptions.callbacks).toBeDefined();
    expect(authOptions.callbacks?.jwt).toBeDefined();
    expect(typeof authOptions.callbacks?.jwt).toBe("function");
  });

  it("should set user id in session callback", async () => {
    const session = {
      user: {
        name: "Test User",
        email: "test@example.com",
      },
    };
    const token = {
      sub: "user-id-123",
    };

    const result = await authOptions.callbacks!.session!({
      session: session as any,
      token: token as any,
    } as any);

    expect((result.user as any)?.id).toBe("user-id-123");
  });

  it("should handle session without user", async () => {
    const session = {};
    const token = {
      sub: "user-id-123",
    };

    const result = await authOptions.callbacks!.session!({
      session: session as any,
      token: token as any,
    } as any);

    expect(result).toBeDefined();
  });

  it("should set token sub from user id in jwt callback", async () => {
    const token = {};
    const user = {
      id: "user-id-123",
    };

    const result = await authOptions.callbacks!.jwt!({
      token: token as any,
      user: user as any,
    } as any);

    expect(result.sub).toBe("user-id-123");
  });

  it("should return token when no user in jwt callback", async () => {
    const token = {
      sub: "existing-user-id",
    };

    const result = await authOptions.callbacks!.jwt!({
      token: token as any,
      user: undefined,
    } as any);

    expect(result).toBe(token);
  });

  it("should have custom sign in page", () => {
    expect(authOptions.pages).toBeDefined();
    expect(authOptions.pages?.signIn).toBe("/login");
  });
});

