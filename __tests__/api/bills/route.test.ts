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
});

