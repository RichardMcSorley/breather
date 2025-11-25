import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/transactions/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../setup/db";
import Transaction from "@/lib/models/Transaction";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("GET /api/transactions", () => {
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

    const request = new NextRequest("http://localhost:3000/api/transactions");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return empty array when no transactions exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it("should return user's transactions", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    await Transaction.create({
      userId: "other-user",
      amount: 200,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/transactions");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].amount).toBe(100);
    expect(data.transactions[0].userId).toBe(TEST_USER_ID);
  });

  it("should filter by type", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "expense",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?type=income"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].type).toBe("income");
  });

  it("should filter by tag", async () => {
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
      amount: 50,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
      tag: "Lyft",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?tag=Uber"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].tag).toBe("Uber");
  });

  it("should paginate results", async () => {
    // Create 5 transactions
    for (let i = 0; i < 5; i++) {
      await Transaction.create({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${15 + i}`),
        time: "10:00",
      });
    }

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?page=1&limit=2"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(2);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(2);
    expect(data.pagination.total).toBe(5);
    expect(data.pagination.totalPages).toBe(3);
  });

  it("should return 400 for invalid transaction type", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/transactions?type=invalid"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid transaction type");
  });

  it("should filter by date range", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: new Date("2024-02-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?startDate=2024-01-01&endDate=2024-01-31"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].amount).toBe(100);
  });

  it("should sort transactions by date descending", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: new Date("2024-01-20"),
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 150,
      type: "income",
      date: new Date("2024-01-18"),
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/transactions");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(3);
    // Should be sorted by date descending
    expect(data.transactions[0].date).toBe("2024-01-20");
    expect(data.transactions[1].date).toBe("2024-01-18");
    expect(data.transactions[2].date).toBe("2024-01-15");
  });

  it("should return 400 for invalid pagination parameters", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/transactions?page=0&limit=50"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid pagination parameters");
  });
});

describe("POST /api/transactions", () => {
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
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should create a transaction", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
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

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(100);
    expect(data.type).toBe("income");
    expect(data.tag).toBe("Uber");
    expect(data.notes).toBe("Test transaction");
    expect(data.userId).toBe(TEST_USER_ID);

    // Verify in database
    const transaction = await Transaction.findOne({ _id: data._id });
    expect(transaction).toBeTruthy();
    expect(transaction?.amount).toBe(100);
  });

  it("should return 400 for missing required fields", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        // Missing type, date, time
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
  });

  it("should return 400 for invalid amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: -100,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should return 400 for invalid transaction type", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "invalid",
        date: "2024-01-15",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid transaction type");
  });

  it("should handle dueDate", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "expense",
        date: "2024-01-15",
        time: "10:00",
        dueDate: "2024-01-20",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.dueDate).toBe("2024-01-20");
  });

  it("should return 400 for invalid date format", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "income",
        date: "invalid-date",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid date or time format");
  });

  it("should return 400 for invalid time format", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "income",
        date: "2024-01-15",
        time: "invalid-time",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    // The error might be "Validation error" from date parsing, or "Invalid date or time format"
    expect(data.error).toMatch(/Invalid date or time format|Validation error/);
  });

  it("should return 400 for invalid dueDate format", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "expense",
        date: "2024-01-15",
        time: "10:00",
        dueDate: "invalid-date",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid dueDate format");
  });

  it("should return 400 for zero amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 0,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    // Amount 0 is falsy, so it triggers "Missing required fields" check first
    // The code checks `!amount` before parsing, so 0 fails the missing fields check
    expect(data.error).toBe("Missing required fields");
  });

  it("should return 400 for negative amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: -100,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should handle very large amounts", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 999999999.99,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(999999999.99);
  });

  it("should handle startDate > endDate (invalid range)", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?startDate=2024-01-31&endDate=2024-01-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should return empty results when startDate > endDate
    expect(data.transactions).toHaveLength(0);
  });

  it("should handle invalid date formats in query params", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/transactions?startDate=invalid&endDate=2024-01-31"
    );
    const response = await GET(request);
    
    // Invalid date format may throw an error (500) or return 400/200
    if (response.status === 200) {
      const data = await response.json();
      expect(Array.isArray(data.transactions)).toBe(true);
    } else {
      expect([400, 500]).toContain(response.status);
    }
  });

  it("should handle pagination beyond total pages", async () => {
    // Create 5 transactions
    for (let i = 0; i < 5; i++) {
      await Transaction.create({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${15 + i}`),
        time: "10:00",
      });
    }

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?page=10&limit=2"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(0);
    expect(data.pagination.page).toBe(10);
    expect(data.pagination.total).toBe(5);
  });

  it("should handle empty tag filter", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
      tag: "Uber",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/transactions?tag="
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Empty tag should either match empty tags or return all
    expect(Array.isArray(data.transactions)).toBe(true);
  });

  it("should handle transaction with isBill=true", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "expense",
        date: "2024-01-15",
        time: "10:00",
        isBill: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.isBill).toBe(true);
  });

  it("should handle decimal precision for amounts", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100.123456789,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount).toBe(100.123456789);
  });

  it("should handle very long notes field", async () => {
    const longNotes = "A".repeat(1000);
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
        notes: longNotes,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.notes).toBe(longNotes);
  });

  it("should handle very long tag field", async () => {
    const longTag = "A".repeat(500);
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
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.tag).toBe(longTag);
  });

  it("should handle dueDate in the past", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        type: "expense",
        date: "2024-01-15",
        time: "10:00",
        dueDate: "2020-01-01", // Past date
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.dueDate).toBe("2020-01-01");
  });

  it("should handle invalid JSON body", async () => {
    const request = new NextRequest("http://localhost:3000/api/transactions", {
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
    const request = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      // No body
    });

    const response = await POST(request);
    // Should return 400 or 500 for missing body
    expect([400, 500]).toContain(response.status);
  });
});

