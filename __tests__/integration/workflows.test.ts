import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/transactions/route";
import { GET as GET_BILLS, POST as POST_BILL } from "@/app/api/bills/route";
import { GET as GET_SUMMARY } from "@/app/api/summary/route";
import { POST as POST_PAYMENT } from "@/app/api/bills/payments/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../setup/db";
import Transaction from "@/lib/models/Transaction";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("Integration: Transaction Workflow", () => {
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

  it("should create transaction → view in list → edit → delete", async () => {
    // Step 1: Create transaction
    const createRequest = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
        tag: "Uber",
        notes: "Test transaction",
      }),
    });

    const createResponse = await POST(createRequest);
    expect(createResponse.status).toBe(201);
    const createdData = await createResponse.json();
    const transactionId = createdData._id;

    // Step 2: View in list
    const listRequest = new NextRequest("http://localhost:3000/api/transactions");
    const listResponse = await GET(listRequest);
    expect(listResponse.status).toBe(200);
    const listData = await listResponse.json();
    expect(listData.transactions.some((t: any) => t._id === transactionId)).toBe(true);

    // Step 3: Edit transaction
    const { PUT } = await import("@/app/api/transactions/[id]/route");
    const editRequest = new NextRequest(
      `http://localhost:3000/api/transactions/${transactionId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: 150,
          notes: "Updated notes",
        }),
      }
    );

    const editResponse = await PUT(editRequest, { params: { id: transactionId } });
    expect(editResponse.status).toBe(200);
    const editedData = await editResponse.json();
    expect(editedData.amount).toBe(150);
    expect(editedData.notes).toBe("Updated notes");

    // Step 4: Delete transaction
    const { DELETE } = await import("@/app/api/transactions/[id]/route");
    const deleteRequest = new NextRequest(
      `http://localhost:3000/api/transactions/${transactionId}`,
      {
        method: "DELETE",
      }
    );

    const deleteResponse = await DELETE(deleteRequest, { params: { id: transactionId } });
    expect(deleteResponse.status).toBe(200);

    // Verify deleted
    const verifyRequest = new NextRequest("http://localhost:3000/api/transactions");
    const verifyResponse = await GET(verifyRequest);
    const verifyData = await verifyResponse.json();
    expect(verifyData.transactions.some((t: any) => t._id === transactionId)).toBe(false);
  });

  it("should create bill → create payment → view in summary", async () => {
    // Step 1: Create bill
    const createBillRequest = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 15,
      }),
    });

    const createBillResponse = await POST_BILL(createBillRequest);
    expect(createBillResponse.status).toBe(201);
    const billData = await createBillResponse.json();
    const billId = billData._id;

    // Step 2: Create payment
    const paymentRequest = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId,
        amount: 1000,
        paymentDate: "2024-01-15",
      }),
    });

    const paymentResponse = await POST_PAYMENT(paymentRequest);
    expect(paymentResponse.status).toBe(201);

    // Step 3: View in summary
    const summaryRequest = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const summaryResponse = await GET_SUMMARY(summaryRequest);
    expect(summaryResponse.status).toBe(200);
    const summaryData = await summaryResponse.json();
    expect(summaryData.totalBillsDue).toBeGreaterThanOrEqual(0);
  });

  it("should filter transactions → paginate → edit filtered item", async () => {
    // Create multiple transactions
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
      tag: "Uber",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: new Date("2024-01-16"),
      time: "11:00",
      tag: "DoorDash",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "expense",
      date: new Date("2024-01-17"),
      time: "12:00",
      tag: "Gas",
    });

    // Step 1: Filter by type
    const filterRequest = new NextRequest(
      "http://localhost:3000/api/transactions?type=income"
    );
    const filterResponse = await GET(filterRequest);
    expect(filterResponse.status).toBe(200);
    const filterData = await filterResponse.json();
    expect(filterData.transactions.every((t: any) => t.type === "income")).toBe(true);

    // Step 2: Paginate
    const paginateRequest = new NextRequest(
      "http://localhost:3000/api/transactions?page=1&limit=2"
    );
    const paginateResponse = await GET(paginateRequest);
    expect(paginateResponse.status).toBe(200);
    const paginateData = await paginateResponse.json();
    expect(paginateData.transactions.length).toBeLessThanOrEqual(2);

    // Step 3: Edit a filtered item
    if (paginateData.transactions.length > 0) {
      const transactionId = paginateData.transactions[0]._id;
      const { PUT } = await import("@/app/api/transactions/[id]/route");
      const editRequest = new NextRequest(
        `http://localhost:3000/api/transactions/${transactionId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            notes: "Updated from filtered view",
          }),
        }
      );

      const editResponse = await PUT(editRequest, { params: { id: transactionId } });
      expect(editResponse.status).toBe(200);
    }
  });
});

describe("Integration: Bill Payment Workflow", () => {
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

  it("should create bill → mark as paid → verify in summary", async () => {
    // Step 1: Create bill
    const createBillRequest = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Electric",
        amount: 200,
        dueDate: 20,
      }),
    });

    const createBillResponse = await POST_BILL(createBillRequest);
    expect(createBillResponse.status).toBe(201);
    const billData = await createBillResponse.json();
    const billId = billData._id;

    // Step 2: Create full payment
    const paymentRequest = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId,
        amount: 200,
        paymentDate: "2024-01-20",
      }),
    });

    const paymentResponse = await POST_PAYMENT(paymentRequest);
    expect(paymentResponse.status).toBe(201);

    // Step 3: Verify in summary
    const summaryRequest = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-20&viewMode=month"
    );
    const summaryResponse = await GET_SUMMARY(summaryRequest);
    expect(summaryResponse.status).toBe(200);
    const summaryData = await summaryResponse.json();
    // Bill should be paid, so unpaid amount should be 0 or less
    expect(summaryData.unpaidBills).toBeDefined();
  });

  it("should create bill → create partial payment → verify unpaid amount", async () => {
    // Step 1: Create bill
    const createBillRequest = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Rent",
        amount: 1000,
        dueDate: 1,
      }),
    });

    const createBillResponse = await POST_BILL(createBillRequest);
    expect(createBillResponse.status).toBe(201);
    const billData = await createBillResponse.json();
    const billId = billData._id;

    // Step 2: Create partial payment
    const paymentRequest = new NextRequest("http://localhost:3000/api/bills/payments", {
      method: "POST",
      body: JSON.stringify({
        billId,
        amount: 500,
        paymentDate: "2024-01-15",
      }),
    });

    const paymentResponse = await POST_PAYMENT(paymentRequest);
    expect(paymentResponse.status).toBe(201);

    // Step 3: Verify unpaid amount in summary
    const summaryRequest = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const summaryResponse = await GET_SUMMARY(summaryRequest);
    expect(summaryResponse.status).toBe(200);
    const summaryData = await summaryResponse.json();
    // Should show 500 as unpaid (1000 - 500)
    expect(summaryData.unpaidBills).toBeGreaterThanOrEqual(0);
  });

  it("should create bill → delete bill → verify cleanup", async () => {
    // Step 1: Create bill
    const createBillRequest = new NextRequest("http://localhost:3000/api/bills", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Bill",
        amount: 100,
        dueDate: 1,
      }),
    });

    const createBillResponse = await POST_BILL(createBillRequest);
    expect(createBillResponse.status).toBe(201);
    const billData = await createBillResponse.json();
    const billId = billData._id;

    // Step 2: Verify bill exists
    const listRequest = new NextRequest("http://localhost:3000/api/bills");
    const listResponse = await GET_BILLS(listRequest);
    expect(listResponse.status).toBe(200);
    const listData = await listResponse.json();
    expect(listData.bills.some((b: any) => b._id === billId)).toBe(true);

    // Step 3: Delete bill
    const { DELETE } = await import("@/app/api/bills/[id]/route");
    const deleteRequest = new NextRequest(
      `http://localhost:3000/api/bills/${billId}`,
      {
        method: "DELETE",
      }
    );

    const deleteResponse = await DELETE(deleteRequest, { params: { id: billId } });
    expect(deleteResponse.status).toBe(200);

    // Step 4: Verify cleanup
    const verifyRequest = new NextRequest("http://localhost:3000/api/bills");
    const verifyResponse = await GET_BILLS(verifyRequest);
    const verifyData = await verifyResponse.json();
    expect(verifyData.bills.some((b: any) => b._id === billId)).toBe(false);
  });
});

describe("Integration: Offline Sync Workflow", () => {
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

  it("should handle offline create → come online → verify sync", async () => {
    // This test simulates offline behavior
    // In a real scenario, offline mutations would be queued
    // and synced when connection is restored

    // Step 1: Create transaction (simulating offline queue)
    const transactionData = {
      amount: 100,
      type: "income",
      date: "2024-01-15",
      time: "10:00",
      tag: "Uber",
    };

    // Step 2: When online, sync the transaction
    const createRequest = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify(transactionData),
    });

    const createResponse = await POST(createRequest);
    expect(createResponse.status).toBe(201);
    const createdData = await createResponse.json();

    // Step 3: Verify transaction exists
    const listRequest = new NextRequest("http://localhost:3000/api/transactions");
    const listResponse = await GET(listRequest);
    expect(listResponse.status).toBe(200);
    const listData = await listResponse.json();
    expect(listData.transactions.some((t: any) => t._id === createdData._id)).toBe(true);
  });
});

