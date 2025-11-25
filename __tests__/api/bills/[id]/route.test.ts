import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT, DELETE } from "@/app/api/bills/[id]/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../../../setup/db";
import Bill from "@/lib/models/Bill";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";
const OTHER_USER_ID = "other-user-id";

describe("PUT /api/bills/[id]", () => {
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

    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Rent" }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/invalid", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Rent" }),
    });

    const response = await PUT(request, { params: { id: "invalid" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid bill ID");
  });

  it("should update a bill", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Updated Rent",
        amount: 1200,
        dueDate: 5,
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Updated Rent");
    expect(data.amount).toBe(1200);
    expect(data.dueDate).toBe(5);
    expect(data.lastAmount).toBe(1200);

    // Verify in database
    const updated = await Bill.findById(bill._id);
    expect(updated?.name).toBe("Updated Rent");
    expect(updated?.amount).toBe(1200);
  });

  it("should allow partial updates", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
      company: "Landlord Co",
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Updated Rent",
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Updated Rent");
    expect(data.amount).toBe(1000); // Unchanged
    expect(data.company).toBe("Landlord Co"); // Unchanged
  });

  it("should return 400 for invalid amount", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        amount: -100,
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid amount");
  });

  it("should return 400 for invalid due date", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        dueDate: 32,
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid due date");
  });

  it("should return 400 for invalid name", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "   ", // Empty after sanitization
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid name");
  });

  it("should not update other user's bill", async () => {
    const bill = await Bill.create({
      userId: OTHER_USER_ID,
      name: "Other User's Bill",
      amount: 500,
      dueDate: 1,
      lastAmount: 500,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Hacked Bill",
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Bill not found");

    // Verify bill was not updated
    const unchanged = await Bill.findById(bill._id);
    expect(unchanged?.name).toBe("Other User's Bill");
  });

  it("should return 404 if bill not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(`http://localhost:3000/api/bills/${fakeId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Updated",
      }),
    });

    const response = await PUT(request, { params: { id: fakeId } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Bill not found");
  });

  it("should update isActive and useInPlan", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
      isActive: true,
      useInPlan: true,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "PUT",
      body: JSON.stringify({
        isActive: false,
        useInPlan: false,
      }),
    });

    const response = await PUT(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isActive).toBe(false);
    expect(data.useInPlan).toBe(false);
  });
});

describe("DELETE /api/bills/[id]", () => {
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

    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid ObjectId", async () => {
    const request = new NextRequest("http://localhost:3000/api/bills/invalid", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { id: "invalid" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid bill ID");
  });

  it("should delete a bill", async () => {
    const bill = await Bill.create({
      userId: TEST_USER_ID,
      name: "Rent",
      amount: 1000,
      dueDate: 1,
      lastAmount: 1000,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify deleted
    const deleted = await Bill.findById(bill._id);
    expect(deleted).toBeNull();
  });

  it("should not delete other user's bill", async () => {
    const bill = await Bill.create({
      userId: OTHER_USER_ID,
      name: "Other User's Bill",
      amount: 500,
      dueDate: 1,
      lastAmount: 500,
    });

    const request = new NextRequest(`http://localhost:3000/api/bills/${bill._id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { id: String(bill._id) } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Bill not found");

    // Verify not deleted
    const notDeleted = await Bill.findById(bill._id);
    expect(notDeleted).toBeTruthy();
  });

  it("should return 404 if bill not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const request = new NextRequest(`http://localhost:3000/api/bills/${fakeId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { id: fakeId } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Bill not found");
  });
});

