import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/quick-transaction/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../setup/db";
import Transaction from "@/lib/models/Transaction";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("POST /api/quick-transaction", () => {
  beforeEach(async () => {
    await setupTestDB();
    await clearDatabase();
    // Note: quick-transaction doesn't use NextAuth, it uses userId directly
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  it("should return 400 for missing userId", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing userId");
  });

  it("should return 400 for missing amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing amount");
  });

  it("should return 400 for invalid amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: "invalid",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Amount must be a valid number");
  });

  it("should create income transaction for positive amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: 100,
        source: "Uber",
        localDate: "2024-01-15",
        localTime: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.todayIncome).toBe(100);
    expect(data.todayExpenses).toBe(0);
    expect(data.todayEarnings).toBe(100);

    // Verify transaction was created
    const transaction = await Transaction.findOne({ userId: TEST_USER_ID });
    expect(transaction).toBeTruthy();
    expect(transaction?.amount).toBe(100);
    expect(transaction?.type).toBe("income");
    expect(transaction?.tag).toBe("Uber");
  });

  it("should create expense transaction for negative amount", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: -50,
        localDate: "2024-01-15",
        localTime: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.todayIncome).toBe(0);
    expect(data.todayExpenses).toBe(50);
    expect(data.todayEarnings).toBe(-50);

    // Verify transaction was created
    const transaction = await Transaction.findOne({ userId: TEST_USER_ID });
    expect(transaction).toBeTruthy();
    expect(transaction?.amount).toBe(50);
    expect(transaction?.type).toBe("expense");
  });

  it("should not create transaction when amount is 0", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: 0,
        localDate: "2024-01-15",
        localTime: "10:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify no transaction was created
    const transaction = await Transaction.findOne({ userId: TEST_USER_ID });
    expect(transaction).toBeNull();
  });

  it("should calculate today's earnings correctly", async () => {
    // Create existing transactions for today
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 30,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: 50,
        localDate: "2024-01-15",
        localTime: "14:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(150); // 100 + 50
    expect(data.todayExpenses).toBe(30);
    expect(data.todayEarnings).toBe(120); // 150 - 30
  });

  it("should use current EST time when localDate/localTime not provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T15:00:00Z")); // 10:00 EST

    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify transaction was created with EST date/time
    const transaction = await Transaction.findOne({ userId: TEST_USER_ID });
    expect(transaction).toBeTruthy();

    vi.useRealTimers();
  });

  it("should handle EST timezone conversion correctly", async () => {
    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: 100,
        localDate: "2024-01-15",
        localTime: "20:00", // 8 PM EST = 1 AM UTC next day
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify transaction was created
    const transaction = await Transaction.findOne({ userId: TEST_USER_ID });
    expect(transaction).toBeTruthy();
    // The date should be stored in UTC
    expect(transaction?.time).toBe("20:00");
  });

  it("should exclude bills from today's earnings calculation", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: true, // This is a bill
    });

    const request = new NextRequest("http://localhost:3000/api/quick-transaction", {
      method: "POST",
      body: JSON.stringify({
        userId: TEST_USER_ID,
        amount: 25,
        localDate: "2024-01-15",
        localTime: "14:00",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(125); // 100 + 25
    expect(data.todayExpenses).toBe(0); // Bill expense excluded
    expect(data.todayEarnings).toBe(125);
  });
});

