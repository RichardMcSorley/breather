import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT, DELETE } from "@/app/api/bills/payments/[id]/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../../setup/db";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";
const OTHER_USER_ID = "other-user-id";

describe("PUT /api/bills/payments/[id]", () => {
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

    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const payment = await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "PUT",
        body: JSON.stringify({ amount: 1200 }),
      }
    );

    const response = await PUT(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payments/invalid", {
      method: "PUT",
      body: JSON.stringify({ amount: 1200 }),
    });

    const response = await PUT(request, { params: { id: "invalid" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid payment ID");
  });

  it("should update a payment", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const payment = await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
      notes: "Original notes",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: 1200,
          paymentDate: "2024-01-20",
          notes: "Updated notes",
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.amount).toBe(1200);
    expect(data.paymentDate).toBe("2024-01-20");
    expect(data.notes).toBe("Updated notes");

    // Verify in database
    const updated = await BillPayment.findById(payment._id);
    expect(updated?.amount).toBe(1200);
  });

  it("should allow partial updates", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const payment = await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
      notes: "Original notes",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: 1200,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.amount).toBe(1200);
    expect(data.paymentDate).toBe("2024-01-15"); // Unchanged
    expect(data.notes).toBe("Original notes"); // Unchanged
  });

  it("should return 400 for invalid amount", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const payment = await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: -100,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should not update other user's payment", async () => {
    const bill = await Bill.create({
      userId: OTHER_USER_ID,
      name: "Other User's Bill",
      amount: 500,
      dueDate: 1,
      lastAmount: 500,
    });

    const payment = await BillPayment.create({
      userId: OTHER_USER_ID,
      billId: bill._id,
      amount: 500,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: 600,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Payment not found");

    // Verify payment was not updated
    const unchanged = await BillPayment.findById(payment._id);
    expect(unchanged?.amount).toBe(500);
  });

  it("should return 404 if payment not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${fakeId}`,
      {
        method: "PUT",
        body: JSON.stringify({ amount: 1200 }),
      }
    );

    const response = await PUT(request, { params: { id: fakeId } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Payment not found");
  });
});

describe("DELETE /api/bills/payments/[id]", () => {
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

    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const payment = await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payments/invalid", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { id: "invalid" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid payment ID");
  });

  it("should delete a payment", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const payment = await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify deleted
    const deleted = await BillPayment.findById(payment._id);
    expect(deleted).toBeNull();
  });

  it("should not delete other user's payment", async () => {
    const bill = await Bill.create({
      userId: OTHER_USER_ID,
      name: "Other User's Bill",
      amount: 500,
      dueDate: 1,
      lastAmount: 500,
    });

    const payment = await BillPayment.create({
      userId: OTHER_USER_ID,
      billId: bill._id,
      amount: 500,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${payment._id}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: String(payment._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Payment not found");

    // Verify not deleted
    const notDeleted = await BillPayment.findById(payment._id);
    expect(notDeleted).toBeTruthy();
  });

  it("should return 404 if payment not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments/${fakeId}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: fakeId } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Payment not found");
  });
});

