import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/delivery-orders/create/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import Transaction from "@/lib/models/Transaction";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("POST /api/delivery-orders/create", () => {
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

  it("should NOT mark newly created order as active (and should not flip linked transaction active)", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
      // Transaction schema default is active: false
    });

    const request = new NextRequest("http://localhost:3000/api/delivery-orders/create", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        appName: "Dasher",
        money: "25.50",
        restaurantName: "Test Restaurant",
        date: "2024-01-15",
        transactionId: transaction._id.toString(),
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(typeof data.id).toBe("string");

    const createdOrder = await DeliveryOrder.findById(data.id).lean();
    expect(createdOrder).toBeTruthy();
    expect(createdOrder?.active).toBe(false);

    const updatedTransaction = await Transaction.findById(transaction._id).lean();
    expect(updatedTransaction).toBeTruthy();
    expect(updatedTransaction?.active).toBe(false);
    expect((updatedTransaction?.linkedDeliveryOrderIds || []).map((x) => x.toString())).toContain(
      data.id
    );
  });
});

