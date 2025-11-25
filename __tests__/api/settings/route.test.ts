import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/settings/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../setup/db";
import UserSettings from "@/lib/models/UserSettings";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("GET /api/settings", () => {
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

    const request = new NextRequest("http://localhost:3000/api/settings");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return default settings if none exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/settings");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.irsMileageDeduction).toBe(0.70);
    expect(data.incomeSourceTags).toEqual([]);
  });

  it("should return existing settings", async () => {
    await UserSettings.create({
      userId: TEST_USER_ID,
      irsMileageDeduction: 0.65,
      incomeSourceTags: ["Uber", "Lyft"],
    });

    const request = new NextRequest("http://localhost:3000/api/settings");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.irsMileageDeduction).toBe(0.65);
    expect(data.incomeSourceTags).toEqual(["Uber", "Lyft"]);
  });
});

describe("PUT /api/settings", () => {
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

  it("should update settings", async () => {
    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        irsMileageDeduction: 0.65,
        incomeSourceTags: ["Uber", "Lyft"],
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.irsMileageDeduction).toBe(0.65);
    expect(data.incomeSourceTags).toEqual(["Uber", "Lyft"]);
  });

  it("should create settings if they don't exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        irsMileageDeduction: 0.70,
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.userId).toBe(TEST_USER_ID);

    // Verify in database
    const settings = await UserSettings.findOne({ userId: TEST_USER_ID });
    expect(settings).toBeTruthy();
    expect(settings?.irsMileageDeduction).toBe(0.70);
  });

  it("should allow partial updates", async () => {
    await UserSettings.create({
      userId: TEST_USER_ID,
      irsMileageDeduction: 0.70,
      incomeSourceTags: ["Uber", "Lyft"],
    });

    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        irsMileageDeduction: 0.65,
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.irsMileageDeduction).toBe(0.65);
    // Other fields should remain unchanged
    expect(data.incomeSourceTags).toEqual(["Uber", "Lyft"]);
  });

  it("should handle invalid irsMileageDeduction values gracefully", async () => {
    // Note: The API doesn't validate these, but we test that it accepts them
    // In a real scenario, you might want to add validation
    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        irsMileageDeduction: -0.1, // Negative value
      }),
    });

    const response = await PUT(request);
    // The API currently doesn't validate, so it will succeed
    // This test documents current behavior
    expect(response.status).toBe(200);
  });

  it("should handle invalid incomeSourceTags (non-array)", async () => {
    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        incomeSourceTags: "not-an-array",
      }),
    });

    const response = await PUT(request);
    // The API currently doesn't validate, so it will succeed
    // This test documents current behavior
    expect(response.status).toBe(200);
  });

  it("should update only incomeSourceTags", async () => {
    await UserSettings.create({
      userId: TEST_USER_ID,
      irsMileageDeduction: 0.70,
      incomeSourceTags: ["Uber"],
    });

    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        incomeSourceTags: ["Uber", "Lyft", "DoorDash"],
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.incomeSourceTags).toEqual(["Uber", "Lyft", "DoorDash"]);
    // irsMileageDeduction should remain unchanged
    expect(data.irsMileageDeduction).toBe(0.70);
  });

  it("should return 401 if not authenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        irsMileageDeduction: 0.65,
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});

