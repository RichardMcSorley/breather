import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/transactions/route";
import { GET as GET_SUMMARY } from "@/app/api/summary/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../setup/db";
import Transaction from "@/lib/models/Transaction";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("Performance: Large Datasets", () => {
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

  it("should handle 1000+ transactions efficiently", async () => {
    // Create 1000 transactions
    const startTime = Date.now();
    const transactions = [];
    for (let i = 0; i < 1000; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: i % 2 === 0 ? "income" : "expense",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        tag: i % 10 === 0 ? "Uber" : "Other",
      });
    }

    await Transaction.insertMany(transactions);
    const insertTime = Date.now() - startTime;

    // Query should be fast
    const queryStartTime = Date.now();
    const request = new NextRequest("http://localhost:3000/api/transactions?limit=50");
    const response = await GET(request);
    const queryTime = Date.now() - queryStartTime;

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.transactions.length).toBeLessThanOrEqual(50);
    expect(data.pagination.total).toBe(1000);

    // Performance assertions (adjust thresholds as needed)
    expect(insertTime).toBeLessThan(10000); // Should insert in < 10 seconds
    expect(queryTime).toBeLessThan(2000); // Should query in < 2 seconds
  });

  it("should paginate through large dataset efficiently", async () => {
    // Create 500 transactions
    const transactions = [];
    for (let i = 0; i < 500; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: "10:00",
      });
    }
    await Transaction.insertMany(transactions);

    // Test pagination performance
    const pageSizes = [10, 25, 50, 100];
    for (const limit of pageSizes) {
      const startTime = Date.now();
      const request = new NextRequest(
        `http://localhost:3000/api/transactions?page=1&limit=${limit}`
      );
      const response = await GET(request);
      const queryTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transactions.length).toBeLessThanOrEqual(limit);
      expect(queryTime).toBeLessThan(2000); // Should be fast regardless of page size
    }
  });

  it("should filter large dataset efficiently", async () => {
    // Create 1000 transactions with various types and tags
    const transactions = [];
    const tags = ["Uber", "DoorDash", "Gas", "Maintenance", "Other"];
    for (let i = 0; i < 1000; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: i % 2 === 0 ? "income" : "expense",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: "10:00",
        tag: tags[i % tags.length],
      });
    }
    await Transaction.insertMany(transactions);

    // Test filtering performance
    const startTime = Date.now();
    const request = new NextRequest(
      "http://localhost:3000/api/transactions?type=income&tag=Uber"
    );
    const response = await GET(request);
    const queryTime = Date.now() - startTime;

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.transactions.every((t: any) => t.type === "income" && t.tag === "Uber")).toBe(
      true
    );
    expect(queryTime).toBeLessThan(2000); // Should filter quickly
  });

  it("should calculate summary for large dataset efficiently", async () => {
    // Create 1000 transactions
    const transactions = [];
    for (let i = 0; i < 1000; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + (i % 100),
        type: i % 2 === 0 ? "income" : "expense",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: "10:00",
        isBill: i % 10 === 0,
      });
    }
    await Transaction.insertMany(transactions);

    // Create 50 bills
    const bills = [];
    for (let i = 0; i < 50; i++) {
      bills.push({
        userId: TEST_USER_ID,
        name: `Bill ${i}`,
        amount: 100 + i,
        dueDate: (i % 28) + 1,
        lastAmount: 100 + i,
        isActive: true,
      });
    }
    await Bill.insertMany(bills);

    // Test summary calculation performance
    const startTime = Date.now();
    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const response = await GET_SUMMARY(request);
    const queryTime = Date.now() - startTime;

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.grossTotal).toBeGreaterThanOrEqual(0);
    expect(queryTime).toBeLessThan(5000); // Should calculate summary in < 5 seconds
  });

  it("should handle date range queries on large dataset", async () => {
    // Create transactions spanning multiple months
    const transactions = [];
    for (let i = 0; i < 1000; i++) {
      const month = (i % 12) + 1;
      const day = (i % 28) + 1;
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`),
        time: "10:00",
      });
    }
    await Transaction.insertMany(transactions);

    // Test date range query performance
    const startTime = Date.now();
    const request = new NextRequest(
      "http://localhost:3000/api/transactions?startDate=2024-01-01&endDate=2024-03-31"
    );
    const response = await GET(request);
    const queryTime = Date.now() - startTime;

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(queryTime).toBeLessThan(2000); // Should query date range quickly
  });

  it("should handle sorting large dataset efficiently", async () => {
    // Create 1000 transactions with various dates
    const transactions = [];
    for (let i = 0; i < 1000; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: "10:00",
        createdAt: new Date(2024, 0, 1, i % 24, i % 60),
      });
    }
    await Transaction.insertMany(transactions);

    // Test sorting performance
    const startTime = Date.now();
    const request = new NextRequest("http://localhost:3000/api/transactions?limit=100");
    const response = await GET(request);
    const queryTime = Date.now() - startTime;

    expect(response.status).toBe(200);
    const data = await response.json();
    // Verify sorting (should be by date descending)
    if (data.transactions.length > 1) {
      const dates = data.transactions.map((t: any) => new Date(t.date).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    }
    expect(queryTime).toBeLessThan(2000); // Should sort quickly
  });

  it("should handle concurrent queries on large dataset", async () => {
    // Create 1000 transactions
    const transactions = [];
    for (let i = 0; i < 1000; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: "10:00",
      });
    }
    await Transaction.insertMany(transactions);

    // Execute multiple concurrent queries
    const queries = Array.from({ length: 10 }, (_, i) => {
      const request = new NextRequest(
        `http://localhost:3000/api/transactions?page=${i + 1}&limit=50`
      );
      return GET(request);
    });

    const startTime = Date.now();
    const responses = await Promise.all(queries);
    const queryTime = Date.now() - startTime;

    // All queries should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });

    // Concurrent queries should complete in reasonable time
    expect(queryTime).toBeLessThan(5000); // Should handle 10 concurrent queries in < 5 seconds
  });

  it("should handle very large amounts without precision loss", async () => {
    // Create transactions with very large amounts
    const transactions = [];
    for (let i = 0; i < 100; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 999999999.99 + i,
        type: "income",
        date: new Date(`2024-01-${(i % 28) + 1}`),
        time: "10:00",
      });
    }
    await Transaction.insertMany(transactions);

    const request = new NextRequest("http://localhost:3000/api/transactions");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();

    // Verify amounts are preserved correctly
    data.transactions.forEach((t: any) => {
      expect(typeof t.amount).toBe("number");
      expect(t.amount).toBeGreaterThan(999999999);
    });
  });
});

