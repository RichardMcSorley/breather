import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/bills/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../setup/db";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("GET /api/bills", () => {
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

  it("should return 401 if not authenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/bills");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return user's bills", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest("http://localhost:3000/api/bills");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bills).toHaveLength(1);
    expect(data.bills[0].name).toBe("Rent");
  });

  it("should filter by isActive", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Active Bill",
      amount: 100,
      dueDate: 1,
      isActive: true,
      lastAmount: 100,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "Inactive Bill",
      amount: 50,
      dueDate: 1,
      isActive: false,
      lastAmount: 50,
    });

    const request = new NextRequest("http://localhost:3000/api/bills?isActive=true");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bills).toHaveLength(1);
    expect(data.bills[0].name).toBe("Active Bill");
  });

  it("should sort bills by dueDate and name", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Z Bill",
      amount: 100,
      dueDate: 15,
      lastAmount: 100,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "A Bill",
      amount: 50,
      dueDate: 1,
      lastAmount: 50,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "B Bill",
      amount: 75,
      dueDate: 1,
      lastAmount: 75,
    });

    const request = new NextRequest("http://localhost:3000/api/bills");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bills).toHaveLength(3);
    // Should be sorted by dueDate first, then name
    expect(data.bills[0].dueDate).toBe(1);
    expect(data.bills[0].name).toBe("A Bill");
    expect(data.bills[1].dueDate).toBe(1);
    expect(data.bills[1].name).toBe("B Bill");
    expect(data.bills[2].dueDate).toBe(15);
  });

  it("should handle invalid isActive parameter", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Active Bill",
      amount: 100,
      dueDate: 1,
      isActive: true,
      lastAmount: 100,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "Inactive Bill",
      amount: 50,
      dueDate: 1,
      isActive: false,
      lastAmount: 50,
    });

    const request = new NextRequest("http://localhost:3000/api/bills?isActive=maybe");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // "maybe" !== "true", so isActive will be false, returning only inactive bills
    expect(data.bills).toHaveLength(1);
    expect(data.bills[0].name).toBe("Inactive Bill");
  });
});

describe("POST /api/bills", () => {
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

  it("should create a bill", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        company: "Landlord Co",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Rent");
    expect(data.amount).toBe(1000);
    expect(data.dueDate).toBe(1);
    expect(data.userId).toBe(TEST_USER_ID);
  });

  it("should return 400 for missing required fields", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        // Missing amount and dueDate
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
  });

  it("should return 400 for invalid amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: -100,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should return 400 for invalid due date", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 32, // Invalid
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid due date");
  });

  it("should return 400 for invalid name (empty after sanitization)", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "   ", // Empty after sanitization
        amount: 1000,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid name");
  });

  it("should set default isActive to true", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.isActive).toBe(true);
  });

  it("should set default useInPlan to true", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.useInPlan).toBe(true);
  });

  it("should allow setting isActive to false", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        isActive: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.isActive).toBe(false);
  });

  it("should allow setting useInPlan to false", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        useInPlan: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.useInPlan).toBe(false);
  });

  it("should sanitize company field", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        company: "  Landlord Co  ",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.company).toBe("Landlord Co");
  });

  it("should handle null company field", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        company: null,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.company).toBeNull();
  });

  it("should handle very long bill names", async () => {
    const longName = "A".repeat(500);
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: longName,
        amount: 1000,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe(longName);
  });

  it("should handle decimal amounts", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000.99,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(1000.99);
  });

  it("should handle zero amount edge case", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Free Service",
        amount: 0,
        dueDate: 1,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(0);
  });

  it("should handle category field", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        category: "Housing",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.category).toBe("Housing");
  });

  it("should sanitize category field", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        category: "  Housing  ",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.category).toBe("Housing");
  });

  it("should handle notes field", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        notes: "Monthly rent payment",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.notes).toBe("Monthly rent payment");
  });

  it("should sanitize notes field", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
        notes: "  Monthly rent payment  ",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.notes).toBe("Monthly rent payment");
  });

  it("should handle invalid JSON body", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: "invalid json{",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await POST(request);
    // Should return 500 or 400 for JSON parse error
    expect([400, 500]).toContain(response.status);
  });

  it("should handle missing request body", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      // No body
    });

    const response = await POST(request);
    // Should return 400 or 500 for missing body
    expect([400, 500]).toContain(response.status);
  });
});

