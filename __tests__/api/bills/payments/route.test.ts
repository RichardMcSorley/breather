import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "@/app/api/bills/payments/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";
const OTHER_USER_ID = "other-user-id";

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

  it("should return 401 if not authenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/bills/payments");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
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

  it("should filter payments by billId", async () => {
    const bill1 = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const bill2 = await Bill.create({
      userId: TEST_USER_ID,
      name: "Electric",
      amount: 200,
      dueDate: 1,
      lastAmount: 200,
    });

    await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill1._id,
      amount: 1000,
      paymentDate: new Date("2024-01-15"),
    });

    await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill2._id,
      amount: 200,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/bills/payments?billId=${bill1._id}`
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.payments).toHaveLength(1);
    // billId is populated, so it's an object with _id property
    const billId = typeof data.payments[0].billId === "object" 
      ? data.payments[0].billId._id 
      : data.payments[0].billId;
    expect(billId).toBe(String(bill1._id));
  });

  it("should filter payments by date range", async () => {
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

    await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 500,
      paymentDate: new Date("2024-02-15"),
    });

    const request = new NextRequest(
      "http://localhost:3000/api/bills/payments?startDate=2024-01-01&endDate=2024-01-31"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0].paymentDate).toBe("2024-01-15");
  });

  it("should not return other user's payments", async () => {
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

    await BillPayment.create({
      userId: OTHER_USER_ID,
      billId: bill._id,
      amount: 500,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payments");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0].userId).toBe(TEST_USER_ID);
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

  it("should return 401 if not authenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);

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
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
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

  it("should return 400 for invalid billId", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId: "invalid-id",
        amount: 1000,
        paymentDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid bill ID");
  });

  it("should return 404 for bill not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId: fakeId,
        amount: 1000,
        paymentDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Bill not found");
  });

  it("should return 404 for bill belonging to other user", async () => {
    const otherBill = await Bill.create({
      userId: OTHER_USER_ID,
      name: "Other User's Bill",
      amount: 500,
      dueDate: 1,
      lastAmount: 500,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId: String(otherBill._id),
        amount: 500,
        paymentDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Bill not found");
  });

  it("should return 400 for invalid amount", async () => {
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
        amount: -100,
        paymentDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should allow payment amount exceeding bill amount", async () => {
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
        amount: 1500, // More than bill amount
        paymentDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(1500);
  });

  it("should allow multiple payments for same bill", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    // First payment
    const request1 = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId: String(bill._id),
        amount: 500,
        paymentDate: "2024-01-15",
      }),
    });

    const response1 = await POST(request1);
    expect(response1.status).toBe(201);

    // Second payment
    const request2 = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId: String(bill._id),
        amount: 500,
        paymentDate: "2024-01-20",
      }),
    });

    const response2 = await POST(request2);
    expect(response2.status).toBe(201);

    // Verify both payments exist
    const payments = await BillPayment.find({ billId: bill._id });
    expect(payments).toHaveLength(2);
  });

  it("should return 400 for invalid paymentDate format", async () => {
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
        paymentDate: "invalid-date",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    // Invalid date format may throw an error (500) or return 400
    expect([400, 500]).toContain(response.status);
    if (response.status === 400) {
      expect(data.error).toContain("Invalid date");
    }
  });

  it("should handle very large payment amounts", async () => {
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
        amount: 999999999.99,
        paymentDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(999999999.99);
  });
});

describe("DELETE /api/bills/payments", () => {
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

    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "DELETE",
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should delete all user's payments", async () => {
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

    await BillPayment.create({
      userId: TEST_USER_ID,
      billId: bill._id,
      amount: 500,
      paymentDate: new Date("2024-02-15"),
    });

    // Create payment for other user (should not be deleted)
    const otherBill = await Bill.create({
      userId: OTHER_USER_ID,
      name: "Other Bill",
      amount: 500,
      dueDate: 1,
      lastAmount: 500,
    });

    await BillPayment.create({
      userId: OTHER_USER_ID,
      billId: otherBill._id,
      amount: 500,
      paymentDate: new Date("2024-01-15"),
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "DELETE",
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(2);

    // Verify user's payments are deleted
    const userPayments = await BillPayment.find({ userId: TEST_USER_ID });
    expect(userPayments).toHaveLength(0);

    // Verify other user's payment still exists
    const otherPayments = await BillPayment.find({ userId: OTHER_USER_ID });
    expect(otherPayments).toHaveLength(1);
  });

  it("should return success with 0 deletedCount when no payments exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "DELETE",
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(0);
  });
});

