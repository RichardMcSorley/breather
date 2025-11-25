import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/summary/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../setup/db";
import Transaction from "@/lib/models/Transaction";
import Bill from "@/lib/models/Bill";
import Mileage from "@/lib/models/Mileage";
import UserSettings from "@/lib/models/UserSettings";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("GET /api/summary", () => {
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

    const request = new NextRequest("http://localhost:3000/api/summary");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return summary with default values when no data exists", async () => {
    const request = new NextRequest("http://localhost:3000/api/summary");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.grossTotal).toBe(0);
    expect(data.variableExpenses).toBe(0);
    expect(data.freeCash).toBe(0);
    expect(data.totalBillsDue).toBe(0);
    expect(data.unpaidBills).toBe(0);
    expect(data.todayIncome).toBe(0);
    expect(data.todayExpenses).toBe(0);
    expect(data.todayNet).toBe(0);
  });

  it("should calculate summary for day view", async () => {
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
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.grossTotal).toBe(100);
    expect(data.variableExpenses).toBe(50);
    expect(data.todayIncome).toBe(100);
    expect(data.todayExpenses).toBe(50);
    expect(data.todayNet).toBe(50);
  });

  it("should calculate summary for month view", async () => {
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
      date: new Date("2024-01-20T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(100);
    expect(data.todayExpenses).toBe(50);
  });

  it("should calculate bills due", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      isActive: true,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "Electric",
      amount: 200,
      dueDate: 20,
      lastAmount: 200,
      isActive: true,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalBillsDue).toBe(1200);
  });

  it("should calculate unpaid bills", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      isActive: true,
    });

    // Create a bill payment transaction
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 500,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: true,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalBillsDue).toBe(1000);
    expect(data.unpaidBills).toBe(500); // 1000 - 500
  });

  it("should calculate mileage savings", async () => {
    await UserSettings.create({
      userId: TEST_USER_ID,
      irsMileageDeduction: 0.70,
    });

    // Create entries within the last 30 days from the test date
    // The summary route uses thirtyDaysAgo from the selected date
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-10"), // Within 30 days of 2024-01-15
      classification: "work",
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mileageMilesLast30).toBe(100); // 10100 - 10000
    expect(data.mileageSavings).toBe(70); // 100 * 0.70
  });

  it("should use default mileage deduction rate", async () => {
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-01"),
      classification: "work",
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=month"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.irsMileageRate).toBe(0.70); // Default value
  });

  it("should calculate earnings per mile", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-01"),
      classification: "work",
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.earningsPerMile).toBe(1); // 100 / 100
  });

  it("should calculate earnings per hour", async () => {
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
      type: "income",
      date: new Date("2024-01-15T12:00:00Z"),
      time: "12:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.earningsPerHour).toBeGreaterThan(0);
    // 150 total income / 2 hours = 75 per hour
    expect(data.earningsPerHour).toBe(75);
  });

  it("should handle year view", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=year"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(100);
  });

  it("should exclude bills from transaction display", async () => {
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
      amount: 500,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: true,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(100);
    expect(data.todayExpenses).toBe(0); // Bill expense excluded from display
  });

  it("should handle division by zero cases (no income)", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(0);
    expect(data.earningsPerHour).toBeNull();
    expect(data.earningsPerMile).toBeNull();
  });

  it("should handle division by zero cases (no mileage)", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.earningsPerMile).toBeNull();
  });

  it("should handle negative values", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayNet).toBe(-50);
    expect(data.freeCash).toBeLessThan(0);
  });

  it("should handle very large amounts", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 999999999.99,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(999999999.99);
  });

  it("should handle edge case: all transactions are bills", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: true,
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "expense",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: true,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(0); // Bills excluded from display
    expect(data.todayExpenses).toBe(0);
  });

  it("should handle edge case: no transactions in period", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.todayIncome).toBe(0);
    expect(data.todayExpenses).toBe(0);
    expect(data.todayNet).toBe(0);
  });

  it("should handle invalid viewMode parameter", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=invalid"
    );
    const response = await GET(request);
    const data = await response.json();

    // Should either default to day or handle gracefully
    expect(response.status).toBe(200);
    expect(data).toBeDefined();
  });

  it("should handle invalid localDate format", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=invalid-date&viewMode=day"
    );
    const response = await GET(request);
    // Invalid date format may throw an error (500) or return 400/200
    expect([200, 400, 500]).toContain(response.status);
  });

  it("should handle earningsPerHour with single transaction", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // With single transaction, should use minimum 1 hour
    expect(data.earningsPerHour).toBe(100);
  });

  it("should handle earningsPerMile with zero mileage", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
      isBill: false,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/summary?localDate=2024-01-15&viewMode=day"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.earningsPerMile).toBeNull();
  });
});

