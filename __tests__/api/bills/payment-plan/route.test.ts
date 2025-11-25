import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/bills/payment-plan/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("POST /api/bills/payment-plan", () => {
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

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for missing startDate", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Start date is required");
  });

  it("should return 400 when no bills found", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No bills found");
  });

  it("should generate payment plan with default daily payment", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentPlan).toBeDefined();
    expect(Array.isArray(data.paymentPlan)).toBe(true);
    expect(data.groupedByDate).toBeDefined();
    expect(data.warnings).toBeDefined();
    expect(Array.isArray(data.warnings)).toBe(true);
  });

  it("should generate payment plan with custom daily payment", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 50,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentPlan).toBeDefined();
    expect(data.paymentPlan.length).toBeGreaterThan(0);
    
    // Verify payment amounts don't exceed daily payment
    data.paymentPlan.forEach((entry: any) => {
      expect(entry.payment).toBeLessThanOrEqual(50);
    });
  });

  it("should only include bills with useInPlan=true", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      useInPlan: true,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "Excluded Bill",
      amount: 500,
      dueDate: 20,
      lastAmount: 500,
      useInPlan: false,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // Verify only Rent bill is in the plan
    const billNames = data.paymentPlan.map((entry: any) => entry.bill);
    expect(billNames).toContain("Rent");
    expect(billNames).not.toContain("Excluded Bill");
  });

  it("should handle multiple bills", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      useInPlan: true,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "Electric",
      amount: 200,
      dueDate: 20,
      lastAmount: 200,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentPlan.length).toBeGreaterThan(0);
    
    // Verify both bills are included
    const billNames = data.paymentPlan.map((entry: any) => entry.bill);
    expect(billNames).toContain("Rent");
    expect(billNames).toContain("Electric");
  });

  it("should sort bills by due date", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Late Bill",
      amount: 500,
      dueDate: 20,
      lastAmount: 500,
      useInPlan: true,
    });

    await Bill.create({
      userId: TEST_USER_ID,
      name: "Early Bill",
      amount: 300,
      dueDate: 5,
      lastAmount: 300,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // Verify bills are sorted by due date
    const dueDates = data.paymentPlan.map((entry: any) => entry.dueDate);
    const sortedDueDates = [...dueDates].sort();
    expect(dueDates).toEqual(sortedDueDates);
  });

  it("should handle bills with due dates in the past", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Past Due Bill",
      amount: 500,
      dueDate: 10, // Before startDate of 15th
      lastAmount: 500,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentPlan.length).toBeGreaterThan(0);
    
    // Verify the bill's due date was moved to next month
    const billEntry = data.paymentPlan.find((entry: any) => entry.bill === "Past Due Bill");
    expect(billEntry).toBeDefined();
    expect(billEntry.dueDate).toBe("2024-02-10");
  });

  it("should handle year rollover", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Year End Bill",
      amount: 500,
      dueDate: 5,
      lastAmount: 500,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-12-31",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentPlan.length).toBeGreaterThan(0);
  });

  it("should group payments by date", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 50,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groupedByDate).toBeDefined();
    
    // Verify groupedByDate has date keys
    const dates = Object.keys(data.groupedByDate);
    expect(dates.length).toBeGreaterThan(0);
    
    // Verify each date has an array of entries
    dates.forEach((date) => {
      expect(Array.isArray(data.groupedByDate[date])).toBe(true);
      data.groupedByDate[date].forEach((entry: any) => {
        expect(entry.date).toBe(date);
      });
    });
  });

  it("should calculate remaining balance correctly", async () => {
    await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 15,
      lastAmount: 1000,
      useInPlan: true,
    });

    const request = new NextRequest("http://localhost:3000/api/bills/payment-plan", {
      method: "POST",
      body: JSON.stringify({
        startDate: "2024-01-15",
        dailyPayment: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // Verify remaining balance decreases
    const rentEntries = data.paymentPlan.filter((entry: any) => entry.bill === "Rent");
    expect(rentEntries.length).toBeGreaterThan(0);
    
    let previousBalance = 1000;
    rentEntries.forEach((entry: any) => {
      expect(entry.remainingBalance).toBeLessThanOrEqual(previousBalance);
      previousBalance = entry.remainingBalance;
    });
    
    // Last entry should have remaining balance of 0
    const lastEntry = rentEntries[rentEntries.length - 1];
    expect(lastEntry.remainingBalance).toBe(0);
  });
});

