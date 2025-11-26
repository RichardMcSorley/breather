import { http, HttpResponse } from "msw";
import { createMockTransaction, createMockBill, createMockBillPayment, createMockMileage, createMockUserSettings } from "../mock-data";

const API_BASE = "http://localhost:3000";

export const handlers = [
  // Transactions
  http.get(`${API_BASE}/api/transactions`, () => {
    return HttpResponse.json({
      transactions: [
        createMockTransaction({ _id: "1" as any, amount: 100 }),
        createMockTransaction({ _id: "2" as any, amount: 50, type: "expense" }),
      ],
    });
  }),

  http.get(`${API_BASE}/api/transactions/:id`, ({ params }) => {
    return HttpResponse.json(createMockTransaction({ _id: params.id as any }));
  }),

  http.post(`${API_BASE}/api/transactions`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      createMockTransaction({ _id: "new-id", ...(body as any) }),
      { status: 201 }
    );
  }),

  http.put(`${API_BASE}/api/transactions/:id`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(createMockTransaction({ _id: "1", ...(body as any) }));
  }),

  http.delete(`${API_BASE}/api/transactions/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Bills
  http.get(`${API_BASE}/api/bills`, () => {
    return HttpResponse.json({
      bills: [
        createMockBill({ _id: "1" as any, name: "Rent" }),
        createMockBill({ _id: "2" as any, name: "Electric" }),
      ],
    });
  }),

  http.get(`${API_BASE}/api/bills/:id`, ({ params }) => {
    return HttpResponse.json(createMockBill({ _id: params.id as any }));
  }),

  http.post(`${API_BASE}/api/bills`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      createMockBill({ _id: "new-id", ...(body as any) }),
      { status: 201 }
    );
  }),

  http.put(`${API_BASE}/api/bills/:id`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(createMockBill({ _id: "1", ...(body as any) }));
  }),

  http.delete(`${API_BASE}/api/bills/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Bill Payments
  http.get(`${API_BASE}/api/bills/payments`, () => {
    return HttpResponse.json({
      payments: [
        createMockBillPayment({ _id: "1" as any }),
        createMockBillPayment({ _id: "2" as any }),
      ],
    });
  }),

  http.post(`${API_BASE}/api/bills/payments`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      createMockBillPayment({ _id: "new-id", ...(body as any) }),
      { status: 201 }
    );
  }),

  http.put(`${API_BASE}/api/bills/payments/:id`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(createMockBillPayment({ _id: "1", ...(body as any) }));
  }),

  http.delete(`${API_BASE}/api/bills/payments/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Settings
  http.get(`${API_BASE}/api/settings`, () => {
    return HttpResponse.json(createMockUserSettings());
  }),

  http.put(`${API_BASE}/api/settings`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(createMockUserSettings({ ...(body as any) }));
  }),

  // Summary
  http.get(`${API_BASE}/api/summary`, () => {
    return HttpResponse.json({
      breathingRoom: 30,
      freeCash: 5000,
      totalIncome: 10000,
      totalExpenses: 5000,
    });
  }),

  // Mileage
  http.get(`${API_BASE}/api/mileage`, () => {
    return HttpResponse.json({
      mileage: [
        createMockMileage({ _id: "1" as any }),
        createMockMileage({ _id: "2" as any }),
      ],
    });
  }),

  http.post(`${API_BASE}/api/mileage`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      createMockMileage({ _id: "new-id", ...(body as any) }),
      { status: 201 }
    );
  }),

  // Analytics
  http.get(`${API_BASE}/api/analytics/heatmap`, () => {
    return HttpResponse.json({
      data: [
        { date: "2024-01-01", value: 100 },
        { date: "2024-01-02", value: 150 },
      ],
    });
  }),
];

