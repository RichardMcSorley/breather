import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/mileage/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../setup/db";
import Mileage from "@/lib/models/Mileage";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";
const OTHER_USER_ID = "other-user-id";

describe("GET /api/mileage", () => {
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

    const request = new NextRequest("http://localhost:3000/api/mileage");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return empty array when no entries exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it("should return user's mileage entries", async () => {
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    await Mileage.create({
      userId: OTHER_USER_ID,
      odometer: 20000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest("http://localhost:3000/api/mileage");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].odometer).toBe(10000);
    expect(data.entries[0].userId).toBe(TEST_USER_ID);
  });

  it("should filter by date range", async () => {
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-02-15"),
      classification: "work",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/mileage?startDate=2024-01-01&endDate=2024-01-31"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].date).toBe("2024-01-15");
  });

  it("should paginate results", async () => {
    // Create 5 entries
    for (let i = 0; i < 5; i++) {
      await Mileage.create({
        userId: TEST_USER_ID,
        odometer: 10000 + i * 100,
        date: new Date(`2024-01-${15 + i}`),
        classification: "work",
      });
    }

    const request = new NextRequest(
      "http://localhost:3000/api/mileage?page=1&limit=2"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(2);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(2);
    expect(data.pagination.total).toBe(5);
    expect(data.pagination.totalPages).toBe(3);
  });

  it("should return 400 for invalid pagination parameters", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/mileage?page=0&limit=50"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid pagination parameters");
  });

  it("should sort entries by date descending", async () => {
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-02-15"),
      classification: "work",
    });

    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10200,
      date: new Date("2024-01-20"),
      classification: "work",
    });

    const request = new NextRequest("http://localhost:3000/api/mileage");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(3);
    // Should be sorted by date descending
    expect(data.entries[0].date).toBe("2024-02-15");
    expect(data.entries[1].date).toBe("2024-01-20");
    expect(data.entries[2].date).toBe("2024-01-15");
  });
});

describe("POST /api/mileage", () => {
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

    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "2024-01-15",
        classification: "work",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should create a mileage entry", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "2024-01-15",
        classification: "work",
        notes: "Test entry",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.odometer).toBe(10000);
    expect(data.date).toBe("2024-01-15");
    expect(data.classification).toBe("work");
    expect(data.notes).toBe("Test entry");
    expect(data.userId).toBe(TEST_USER_ID);

    // Verify in database
    const entry = await Mileage.findOne({ _id: data._id });
    expect(entry).toBeTruthy();
    expect(entry?.odometer).toBe(10000);
  });

  it("should default classification to 'work'", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.classification).toBe("work");
  });

  it("should accept 'personal' classification", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "2024-01-15",
        classification: "personal",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.classification).toBe("personal");
  });

  it("should return 400 for missing required fields", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        // Missing date
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
  });

  it("should return 400 for invalid odometer value", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: -100,
        date: "2024-01-15",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid odometer value");
  });

  it("should return 400 for invalid classification", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "2024-01-15",
        classification: "invalid",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid classification value");
  });

  it("should return 400 for invalid date format", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "invalid-date",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid date format");
  });

  it("should handle invalid date range (startDate > endDate)", async () => {
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/mileage?startDate=2024-01-31&endDate=2024-01-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should return empty results when startDate > endDate
    expect(data.entries).toHaveLength(0);
  });

  it("should handle odometer decreasing (should be allowed or validated)", async () => {
    // First entry with higher odometer
    await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    // Try to create entry with lower odometer
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000, // Lower than previous
        date: "2024-01-20",
        classification: "work",
      }),
    });

    const response = await POST(request);
    // Should either allow or reject - check implementation behavior
    expect([201, 400]).toContain(response.status);
  });

  it("should handle very large odometer values", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 999999999,
        date: "2024-01-15",
        classification: "work",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.odometer).toBe(999999999);
  });

  it("should handle future dates", async () => {
    const futureDate = new Date();
    futureDate.setUTCFullYear(futureDate.getUTCFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: futureDateStr,
        classification: "work",
      }),
    });

    const response = await POST(request);
    // Should either allow or reject future dates
    expect([201, 400]).toContain(response.status);
  });

  it("should handle very long notes field", async () => {
    const longNotes = "A".repeat(1000);
    const request = new NextRequest("http://localhost:3000/api/mileage", {
      method: "POST",
      body: JSON.stringify({
        odometer: 10000,
        date: "2024-01-15",
        classification: "work",
        notes: longNotes,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.notes).toBe(longNotes);
  });
});

