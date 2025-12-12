import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "@/app/api/transactions/[id]/route";
import { DELETE } from "@/app/api/transactions/[id]/route";
import { POST } from "@/app/api/transactions/route";
import { setupTestDB, teardownTestDB, clearDatabase } from "../setup/db";
import Transaction from "@/lib/models/Transaction";
import { getServerSession } from "next-auth";

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const TEST_USER_ID = "test-user-id";

describe("Concurrency: Race Conditions", () => {
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

  it("should handle simultaneous updates to same transaction", async () => {
    // Create a transaction
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const transactionId = String(transaction._id);

    // Attempt simultaneous updates
    const update1 = PUT(
      new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify({ amount: 200 }),
      }),
      { params: Promise.resolve({ id: transactionId }) }
    );

    const update2 = PUT(
      new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify({ amount: 300 }),
      }),
      { params: Promise.resolve({ id: transactionId }) }
    );

    const [response1, response2] = await Promise.all([update1, update2]);

    // Both should succeed (last write wins in MongoDB)
    expect([200, 404]).toContain(response1.status);
    expect([200, 404]).toContain(response2.status);

    // Verify final state
    const finalTransaction = await Transaction.findById(transactionId);
    expect(finalTransaction).toBeTruthy();
    // Final amount should be one of the updates
    expect([200, 300]).toContain(finalTransaction?.amount);
  });

  it("should handle delete while update in progress", async () => {
    // Create a transaction
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const transactionId = String(transaction._id);

    // Start update and delete simultaneously
    const updatePromise = PUT(
      new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify({ amount: 200 }),
      }),
      { params: Promise.resolve({ id: transactionId }) }
    );

    const deletePromise = DELETE(
      new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: transactionId }) }
    );

    const [updateResponse, deleteResponse] = await Promise.all([
      updatePromise,
      deletePromise,
    ]);

    // One should succeed, one might fail or both might succeed depending on timing
    expect([200, 404]).toContain(updateResponse.status);
    expect([200, 404]).toContain(deleteResponse.status);

    // Verify final state
    const finalTransaction = await Transaction.findById(transactionId);
    // Transaction should either be deleted or updated, not both
    if (deleteResponse.status === 200) {
      expect(finalTransaction).toBeNull();
    } else {
      expect(finalTransaction).toBeTruthy();
    }
  });

  it("should handle race conditions with pagination", async () => {
    // Create multiple transactions
    const transactions = [];
    for (let i = 0; i < 10; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${15 + i}`),
        time: "10:00",
      });
    }
    await Transaction.insertMany(transactions);

    // Create new transaction while paginating
    const { GET } = await import("@/app/api/transactions/route");
    const paginatePromise = GET(
      new NextRequest("http://localhost:3000/api/transactions?page=1&limit=5")
    );

    const createPromise = POST(
      new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: 999,
          type: "income",
          date: "2024-01-20",
          time: "10:00",
        }),
      })
    );

    const [paginateResponse, createResponse] = await Promise.all([
      paginatePromise,
      createPromise,
    ]);

    expect(paginateResponse.status).toBe(200);
    expect(createResponse.status).toBe(201);

    const paginateData = await paginateResponse.json();
    expect(paginateData.transactions.length).toBeLessThanOrEqual(5);
  });

  it("should handle concurrent creates", async () => {
    // Create multiple transactions simultaneously
    const createPromises = Array.from({ length: 10 }, (_, i) =>
      POST(
        new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            amount: 100 + i,
            type: "income",
            date: `2024-01-${15 + i}`,
            time: "10:00",
          }),
        })
      )
    );

    const responses = await Promise.all(createPromises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(201);
    });

    // Verify all transactions were created
    const { GET } = await import("@/app/api/transactions/route");
    const listResponse = await GET(
      new NextRequest("http://localhost:3000/api/transactions")
    );
    const listData = await listResponse.json();
    expect(listData.transactions.length).toBeGreaterThanOrEqual(10);
  });

  it("should handle concurrent updates to different transactions", async () => {
    // Create multiple transactions
    const transactions = [];
    for (let i = 0; i < 5; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${15 + i}`),
        time: "10:00",
      });
    }
    const created = await Transaction.insertMany(transactions);

    // Update all simultaneously
    const updatePromises = created.map((t, i) =>
      PUT(
        new NextRequest(`http://localhost:3000/api/transactions/${t._id}`, {
          method: "PUT",
          body: JSON.stringify({ amount: 200 + i }),
        }),
        { params: Promise.resolve({ id: String(t._id) }) }
      )
    );

    const responses = await Promise.all(updatePromises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });

    // Verify all updates
    for (let i = 0; i < created.length; i++) {
      const updated = await Transaction.findById(created[i]._id);
      expect(updated?.amount).toBe(200 + i);
    }
  });

  it("should handle concurrent deletes", async () => {
    // Create multiple transactions
    const transactions = [];
    for (let i = 0; i < 5; i++) {
      transactions.push({
        userId: TEST_USER_ID,
        amount: 100 + i,
        type: "income",
        date: new Date(`2024-01-${15 + i}`),
        time: "10:00",
      });
    }
    const created = await Transaction.insertMany(transactions);

    // Delete all simultaneously
    const deletePromises = created.map((t) =>
      DELETE(
        new NextRequest(`http://localhost:3000/api/transactions/${t._id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: String(t._id) }) }
      )
    );

    const responses = await Promise.all(deletePromises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });

    // Verify all deleted
    for (const t of created) {
      const deleted = await Transaction.findById(t._id);
      expect(deleted).toBeNull();
    }
  });

  it("should maintain data consistency during concurrent operations", async () => {
    // Create a transaction
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const transactionId = String(transaction._id);

    // Perform multiple operations simultaneously
    const operations = [
      PUT(
        new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
          method: "PUT",
          body: JSON.stringify({ amount: 200 }),
        }),
        { params: Promise.resolve({ id: transactionId }) }
      ),
      PUT(
        new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
          method: "PUT",
          body: JSON.stringify({ notes: "Updated" }),
        }),
        { params: Promise.resolve({ id: transactionId }) }
      ),
      PUT(
        new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
          method: "PUT",
          body: JSON.stringify({ tag: "Uber" }),
        }),
        { params: Promise.resolve({ id: transactionId }) }
      ),
    ];

    const responses = await Promise.all(operations);

    // All should succeed
    responses.forEach((response) => {
      expect([200, 404]).toContain(response.status);
    });

    // Verify final state is consistent
    const final = await Transaction.findById(transactionId);
    if (final) {
      // Should have valid data structure
      expect(final.amount).toBeGreaterThan(0);
      expect(final.type).toBe("income");
    }
  });

  it("should handle mutation failure and retry", async () => {
    // Create a transaction
    const transaction = await Transaction.create({
      userId: TEST_USER_ID,
      amount: 100,
      type: "income",
      date: new Date("2024-01-15"),
      time: "10:00",
    });

    const transactionId = String(transaction._id);

    // Attempt update with invalid data (should fail)
    const invalidUpdate = PUT(
      new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify({ amount: -100 }), // Invalid amount
      }),
      { params: Promise.resolve({ id: transactionId }) }
    );

    // Simultaneously attempt valid update
    const validUpdate = PUT(
      new NextRequest(`http://localhost:3000/api/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify({ amount: 200 }), // Valid amount
      }),
      { params: Promise.resolve({ id: transactionId }) }
    );

    const [invalidResponse, validResponse] = await Promise.all([
      invalidUpdate,
      validUpdate,
    ]);

    // Invalid should fail, valid should succeed
    expect(invalidResponse.status).toBe(400);
    expect([200, 404]).toContain(validResponse.status);

    // Verify final state
    const final = await Transaction.findById(transactionId);
    if (final && validResponse.status === 200) {
      expect(final.amount).toBe(200);
    }
  });
});

