import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/bills/payments/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("GET /api/bills/payments", () => {
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

  it("should return user's payments", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payments");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0].amount).toBe(1000);
  });
});

describe("POST /api/bills/payments", () => {
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

  it("should create a payment", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId: String(bill._id),
        amount: 1000,
        paymentDate: "2024-01-15",
        notes: "Paid",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(1000);
    expect(data.userId).toBe(TEST_USER_ID);
  });

  it("should return 400 for missing required fields", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        amount: 1000,
        // Missing billId and paymentDate
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
  });
});

