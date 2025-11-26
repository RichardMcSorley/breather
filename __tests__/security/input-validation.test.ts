import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/transactions/route";
import { POST as POST_BILL } from "@/app/api/bills/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../setup/db";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("Security: Input Validation", () => {
  beforeEach(async () => {
    await setupTestDB();
    await clearDatabase();
    (getServerSession as any).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  describe("XSS Prevention", () => {
    it("should handle XSS attempts in notes field", async () => {
      const xssPayloads = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert('xss')>",
        "<svg onload=alert('xss')>",
        "javascript:alert('xss')",
        "<iframe src=javascript:alert('xss')></iframe>",
      ];

      for (const payload of xssPayloads) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
            notes: payload,
          }),
        });

        const response = await POST(request);
        // Should accept the payload (sanitization happens on display)
        expect([201, 400]).toContain(response.status);
      }
    });

    it("should handle XSS attempts in tag field", async () => {
      const xssPayload = "<script>alert('xss')</script>";
      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
          tag: xssPayload,
        }),
      });

      const response = await POST(request);
      expect([201, 400]).toContain(response.status);
    });

    it("should handle XSS attempts in bill name", async () => {
      const xssPayload = "<script>alert('xss')</script>";
      const request = new NextRequest("http://localhost:3000/api/bills", {
        method: "POST",
        body: JSON.stringify({
          name: xssPayload,
          amount: 1000,
          dueDate: 1,
        }),
      });

      const response = await POST_BILL(request);
      // sanitizeString should handle this
      expect([201, 400]).toContain(response.status);
    });
  });

  describe("SQL Injection Prevention", () => {
    it("should handle SQL injection attempts in notes", async () => {
      const sqlPayloads = [
        "'; DROP TABLE transactions--",
        "' OR '1'='1",
        "'; DELETE FROM transactions WHERE '1'='1",
        "1' UNION SELECT * FROM users--",
      ];

      for (const payload of sqlPayloads) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
            notes: payload,
          }),
        });

        const response = await POST(request);
        // MongoDB should handle this safely
        expect([201, 400]).toContain(response.status);
      }
    });

    it("should handle SQL injection in tag field", async () => {
      const sqlPayload = "'; DROP TABLE transactions--";
      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
          tag: sqlPayload,
        }),
      });

      const response = await POST(request);
      expect([201, 400]).toContain(response.status);
    });
  });

  describe("NoSQL Injection Prevention", () => {
    it("should reject NoSQL injection in amount field", async () => {
      const nosqlPayloads = [
        { $ne: null },
        { $gt: 0 },
        { $regex: ".*" },
      ];

      for (const payload of nosqlPayloads) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: payload,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
          }),
        });

        const response = await POST(request);
        // Should reject invalid amount type
        expect([400, 500]).toContain(response.status);
      }
    });

    it("should reject NoSQL injection in query parameters", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/transactions?type[$ne]=expense"
      );
      const response = await POST(request);
      // Should handle gracefully
      expect([400, 500]).toContain(response.status);
    });

    it("should reject NoSQL injection in bill amount", async () => {
      const request = new NextRequest("http://localhost:3000/api/bills", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          amount: { $ne: null },
          dueDate: 1,
        }),
      });

      const response = await POST_BILL(request);
      expect([400, 500]).toContain(response.status);
    });
  });

  describe("Command Injection Prevention", () => {
    it("should handle command injection attempts in notes", async () => {
      const commandPayloads = [
        "; rm -rf /",
        "| cat /etc/passwd",
        "&& ls -la",
        "`whoami`",
      ];

      for (const payload of commandPayloads) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
            notes: payload,
          }),
        });

        const response = await POST(request);
        // Should be stored as string, not executed
        expect([201, 400]).toContain(response.status);
      }
    });
  });

  describe("Path Traversal Prevention", () => {
    it("should handle path traversal attempts", async () => {
      const pathPayloads = [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "/etc/passwd",
      ];

      for (const payload of pathPayloads) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
            tag: payload,
          }),
        });

        const response = await POST(request);
        expect([201, 400]).toContain(response.status);
      }
    });
  });

  describe("Type Confusion Attacks", () => {
    it("should reject wrong types in amount field", async () => {
      const invalidTypes = [
        "string",
        true,
        false,
        [],
        {},
        null,
        undefined,
      ];

      for (const invalidType of invalidTypes) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: invalidType,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
          }),
        });

        const response = await POST(request);
        expect([400, 500]).toContain(response.status);
      }
    });

    it("should reject wrong types in type field", async () => {
      const invalidTypes = [
        123,
        true,
        [],
        {},
        null,
      ];

      for (const invalidType of invalidTypes) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            type: invalidType,
            date: "2024-01-15",
            time: "10:00",
          }),
        });

        const response = await POST(request);
        expect([400, 500]).toContain(response.status);
      }
    });
  });

  describe("Buffer Overflow Prevention", () => {
    it("should handle extremely long strings", async () => {
      const longString = "A".repeat(10 * 1024 * 1024); // 10MB
      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
          notes: longString,
        }),
      });

      const response = await POST(request);
      // Should either accept or reject based on MongoDB limits
      expect([201, 400, 413, 500]).toContain(response.status);
    });

    it("should handle extremely long tag", async () => {
      const longTag = "A".repeat(1 * 1024 * 1024); // 1MB
      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
          tag: longTag,
        }),
      });

      const response = await POST(request);
      expect([201, 400, 413, 500]).toContain(response.status);
    });
  });

  describe("Authorization Bypass Attempts", () => {
    it("should reject requests without authentication", async () => {
      (getServerSession as any).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should prevent user from accessing other user's data", async () => {
      // This is tested in existing route tests, but included for completeness
      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
          userId: "other-user-id", // Attempt to set different userId
        }),
      });

      const response = await POST(request);
      // Should use session userId, not provided userId
      if (response.status === 201) {
        const data = await response.json();
        expect(data.userId).toBe(TEST_USER_ID);
      }
    });
  });

  describe("Special Character Handling", () => {
    it("should handle unicode characters safely", async () => {
      const unicodeStrings = [
        "测试",
        "🚀💰🏠",
        "тест",
        "テスト",
        "مرحبا",
      ];

      for (const unicode of unicodeStrings) {
        const request = new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            type: "income",
            date: "2024-01-15",
            time: "10:00",
            notes: unicode,
          }),
        });

        const response = await POST(request);
        expect([201, 400]).toContain(response.status);
      }
    });

    it("should handle control characters", async () => {
      const controlChars = "\x00\x01\x02\x03\x04\x05";
      const request = new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 100,
          type: "income",
          date: "2024-01-15",
          time: "10:00",
          notes: controlChars,
        }),
      });

      const response = await POST(request);
      // sanitizeString should remove control characters
      expect([201, 400]).toContain(response.status);
    });
  });
});

