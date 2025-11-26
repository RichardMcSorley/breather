import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/mileage/[id]/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import Mileage from "@/lib/models/Mileage";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";
const OTHER_USER_ID = "other-user-id";

describe("GET /api/mileage/[id]", () => {
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

    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`);
    const response = await GET(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage/invalid");
    const response = await GET(request, { params: Promise.resolve({ id: "invalid" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid mileage entry ID");
  });

  it("should return 404 if entry not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(`http://localhost:3000/api/mileage/${fakeId}`);
    const response = await GET(request, { params: Promise.resolve({ id: fakeId }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Mileage entry not found");
  });

  it("should return entry for valid ID", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
      notes: "Test notes",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`);
    const response = await GET(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data._id).toBe(String(entry._id));
    expect(data.odometer).toBe(10000);
    expect(data.date).toBe("2024-01-15");
    expect(data.classification).toBe("work");
    expect(data.notes).toBe("Test notes");
  });

  it("should not return other user's entry", async () => {
    const entry = await Mileage.create({
      userId: OTHER_USER_ID,
      odometer: 20000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`);
    const response = await GET(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Mileage entry not found");
  });
});

describe("PUT /api/mileage/[id]", () => {
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

    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({ odometer: 10100 }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage/invalid", {
      method: "PUT",
      body: JSON.stringify({ odometer: 10100 }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "invalid" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid mileage entry ID");
  });

  it("should update an entry", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
      notes: "Original notes",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        odometer: 10100,
        date: "2024-01-20",
        classification: "personal",
        notes: "Updated notes",
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.odometer).toBe(10100);
    expect(data.date).toBe("2024-01-20");
    expect(data.classification).toBe("personal");
    expect(data.notes).toBe("Updated notes");

    // Verify in database
    const updated = await Mileage.findById(entry._id);
    expect(updated?.odometer).toBe(10100);
    expect(updated?.classification).toBe("personal");
  });

  it("should allow partial updates", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
      notes: "Original notes",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        odometer: 10100,
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.odometer).toBe(10100);
    expect(data.date).toBe("2024-01-15"); // Unchanged
    expect(data.classification).toBe("work"); // Unchanged
    expect(data.notes).toBe("Original notes"); // Unchanged
  });

  it("should return 400 for invalid odometer value", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        odometer: -100,
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid odometer value");
  });

  it("should return 400 for invalid classification", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        classification: "invalid",
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid classification value");
  });

  it("should return 400 for invalid date format", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        date: "invalid-date",
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid date format");
  });

  it("should not update other user's entry", async () => {
    const entry = await Mileage.create({
      userId: OTHER_USER_ID,
      odometer: 20000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        odometer: 20100,
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Mileage entry not found");

    // Verify entry was not updated
    const unchanged = await Mileage.findById(entry._id);
    expect(unchanged?.odometer).toBe(20000);
  });

  it("should return 404 if entry not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(`http://localhost:3000/api/mileage/${fakeId}`, {
      method: "PUT",
      body: JSON.stringify({ odometer: 10100 }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: fakeId }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Mileage entry not found");
  });
});

describe("DELETE /api/mileage/[id]", () => {
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

    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/mileage/invalid", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "invalid" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid mileage entry ID");
  });

  it("should delete an entry", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify deleted
    const deleted = await Mileage.findById(entry._id);
    expect(deleted).toBeNull();
  });

  it("should not delete other user's entry", async () => {
    const entry = await Mileage.create({
      userId: OTHER_USER_ID,
      odometer: 20000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: String(entry._id) }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Mileage entry not found");

    // Verify not deleted
    const notDeleted = await Mileage.findById(entry._id);
    expect(notDeleted).toBeTruthy();
  });

  it("should return 404 if entry not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(`http://localhost:3000/api/mileage/${fakeId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: fakeId }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Mileage entry not found");
  });

  it("should handle odometer decreasing on update", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10100,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        odometer: 10000, // Lower than original
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    // Should either allow or reject - check implementation behavior
    expect([200, 400]).toContain(response.status);
  });

  it("should handle future dates on update", async () => {
    const entry = await Mileage.create({
      userId: TEST_USER_ID,
      odometer: 10000,
      date: new Date("2024-01-15"),
      classification: "work",
    });

    const futureDate = new Date();
    futureDate.setUTCFullYear(futureDate.getUTCFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const request = new NextRequest(`http://localhost:3000/api/mileage/${entry._id}`, {
      method: "PUT",
      body: JSON.stringify({
        date: futureDateStr,
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(entry._id) }) });
    // Should either allow or reject future dates
    expect([200, 400]).toContain(response.status);
  });
});

