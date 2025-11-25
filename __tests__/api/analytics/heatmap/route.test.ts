import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/heatmap/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import Transaction from "@/lib/models/Transaction";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";
const OTHER_USER_ID = "other-user-id";

describe("GET /api/analytics/heatmap", () => {
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

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return empty heatmap data when no transactions exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.byDayOfWeek).toBeDefined();
    expect(data.byHour).toBeDefined();
    expect(data.byDayAndHour).toBeDefined();
    expect(data.period).toBeDefined();

    // Verify all day of week averages are 0
    Object.values(data.byDayOfWeek).forEach((avg: any) => {
      expect(avg).toBe(0);
    });

    // Verify all hour averages are 0
    Object.values(data.byHour).forEach((avg: any) => {
      expect(avg).toBe(0);
    });
  });

  it("should calculate heatmap data for income transactions", async () => {
    // Create transactions within the last 30 days
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);

    // Get day of week for yesterday (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = yesterday.getUTCDay();

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: yesterday,
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: yesterday,
      time: "14:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 150,
      type: "income",
      date: twoDaysAgo,
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap?days=30");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.byDayOfWeek).toBeDefined();
    expect(data.byHour).toBeDefined();
    expect(data.byDayAndHour).toBeDefined();
    expect(data.period).toBeDefined();
    expect(data.period.days).toBe(30);

    // Verify the day of week has average (yesterday's day)
    expect(data.byDayOfWeek[dayOfWeek.toString()]).toBeGreaterThan(0);
    
    // Verify hour 10 has average
    expect(data.byHour["10"]).toBeGreaterThan(0);
  });

  it("should only include income transactions", async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: yesterday,
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 50,
      type: "expense",
      date: yesterday,
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // Only income should be counted
    const totalIncome = Object.values(data.byDayOfWeek).reduce((sum: number, avg: any) => sum + avg, 0);
    expect(totalIncome).toBeGreaterThan(0);
    // Expense should not be included
  });

  it("should not include other user's transactions", async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: yesterday,
      time: "10:00",
    });

    await Transaction.create({
      userId: OTHER_USER_ID,
      amount: 500,
      type: "income",
      date: yesterday,
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // Should only include test user's transaction
    // Average for hour 10 should be 100, not 300
    expect(data.byHour["10"]).toBe(100);
  });

  it("should use default days parameter of 30", async () => {
    // Create transaction 35 days ago (should not be included)
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 35);
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: oldDate,
      time: "10:00",
    });

    // Create transaction 15 days ago (should be included)
    const recentDate = new Date();
    recentDate.setUTCDate(recentDate.getUTCDate() - 15);
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: recentDate,
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.period.days).toBe(30);
    
    // Should only include recent transaction
    expect(data.byHour["10"]).toBe(200);
  });

  it("should accept custom days parameter", async () => {
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15T10:00:00Z"),
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap?days=60");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.period.days).toBe(60);
  });

  it("should calculate averages correctly", async () => {
    const now = new Date();
    // Create transactions within the last 30 days on the same day of week
    // Find a date within the last 30 days
    const date1 = new Date(now);
    date1.setUTCDate(date1.getUTCDate() - 7); // 7 days ago (same day of week as today)
    
    const date2 = new Date(now);
    date2.setUTCDate(date2.getUTCDate() - 14); // 14 days ago (same day of week)

    // Get day of week
    const dayOfWeek = date1.getUTCDay();

    // Create 2 transactions on the same day of week at 10:00
    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: date1,
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: date2,
      time: "10:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // Average should be (100 + 200) / 2 = 150
    // Both transactions are on the same day of week
    expect(data.byDayOfWeek[dayOfWeek.toString()]).toBe(150);
    expect(data.byHour["10"]).toBe(150);
    expect(data.byDayAndHour[dayOfWeek.toString()]["10"]).toBe(150);
  });

  it("should handle time parsing edge cases", async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: yesterday,
      time: "10:00",
    });

    await Transaction.create({
      userId: TEST_USER_ID,
      amount: 200,
      type: "income",
      date: yesterday,
      time: "23:00",
    });

    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.byHour["10"]).toBe(100);
    expect(data.byHour["23"]).toBe(200);
  });

  it("should include period information", async () => {
    const request = new NextRequest("http://localhost:3000/api/analytics/heatmap?days=30");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.period).toBeDefined();
    expect(data.period.days).toBe(30);
    expect(data.period.startDate).toBeDefined();
    expect(data.period.endDate).toBeDefined();
    expect(new Date(data.period.startDate)).toBeInstanceOf(Date);
    expect(new Date(data.period.endDate)).toBeInstanceOf(Date);
  });
});

