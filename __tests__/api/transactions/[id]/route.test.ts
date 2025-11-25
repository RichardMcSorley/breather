import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/transactions/[id]/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import Transaction from "@/lib/models/Transaction";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("GET /api/transactions/[id]", () => {
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

    const request = new NextRequest("http://localhost:3000/api/transactions/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions/invalid");
    const response = await GET(request, { params: { id: "invalid" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid transaction ID");
  });

  it("should return 404 if transaction not found", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/transactions/507f1f77bcf86cd799439011"
    );
    const response = await GET(request, {
      params: { id: "507f1f77bcf86cd799439011" },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Transaction not found");
  });

  it("should return transaction for valid ID", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
      tag: "Uber",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`
    );
    const response = await GET(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data._id).toBe(String(transaction._id));
    expect(data.amount).toBe(100);
    expect(data.type).toBe("income");
  });

  it("should not return other user's transaction", async () => {
    const transaction = await Transaction.create({
      userId: "other-user",
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`
    );
    const response = await GET(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Transaction not found");
  });
});

describe("PUT /api/transactions/[id]", () => {
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

  it("should update transaction", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: 200,
          notes: "Updated notes",
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.amount).toBe(200);
    expect(data.notes).toBe("Updated notes");

    // Verify in database
    const updated = await Transaction.findById(transaction._id);
    expect(updated?.amount).toBe(200);
    expect(updated?.notes).toBe("Updated notes");
  });

  it("should return 400 for invalid amount", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: -100,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should return 400 for invalid transaction type", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          type: "invalid",
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid transaction type");
  });

  it("should not update other user's transaction", async () => {
    const transaction = await Transaction.create({
      userId: "other-user",
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          amount: 200,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Transaction not found");
  });

  it("should update isBill flag", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "expense",
      date: new Date("2024-01-15"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          isBill: true,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isBill).toBe(true);

    // Verify in database
    const updated = await Transaction.findById(transaction._id);
    expect(updated?.isBill).toBe(true);
  });

  it("should update dueDate", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "expense",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          dueDate: "2024-02-15",
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dueDate).toBe("2024-02-15");
  });

  it("should return 400 for invalid dueDate format", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "expense",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          dueDate: "invalid-date",
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid dueDate format");
  });

  it("should handle very long field values", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const longNotes = "A".repeat(1000);
    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          notes: longNotes,
        }),
      }
    );

    const response = await PUT(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notes).toBe(longNotes);
  });
});

describe("DELETE /api/transactions/[id]", () => {
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

  it("should delete transaction", async () => {
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify deleted
    const deleted = await Transaction.findById(transaction._id);
    expect(deleted).toBeNull();
  });

  it("should not delete other user's transaction", async () => {
    const transaction = await Transaction.create({
      userId: "other-user",
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      `http://localhost:3000/api/transactions/${transaction._id}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: String(transaction._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Transaction not found");

    // Verify not deleted
    const notDeleted = await Transaction.findById(transaction._id);
    expect(notDeleted).toBeTruthy();
  });
});

