import { ITransaction } from "@/lib/models/Transaction";
import { IBill } from "@/lib/models/Bill";
import { IBillPayment } from "@/lib/models/BillPayment";
import { IMileage } from "@/lib/models/Mileage";
import { IUserSettings } from "@/lib/models/UserSettings";

export const TEST_USER_ID = "test-user-id";

export function createMockTransaction(overrides?: Partial<ITransaction>): Partial<ITransaction> {
  return {
    userId: TEST_USER_ID,
    amount: 100.0,
    type: "income",
    date: new Date("2024-01-15"),
    time: "10:00",
    isBill: false,
    isBalanceAdjustment: false,
    notes: "Test transaction",
    tag: "Uber",
    ...overrides,
  };
}

export function createMockBill(overrides?: Partial<IBill>): Partial<IBill> {
  return {
    userId: TEST_USER_ID,
    name: "Test Bill",
    amount: 50.0,
    dueDate: 15,
    company: "Test Company",
    category: "Utilities",
    notes: "Test bill notes",
    isActive: true,
    useInPlan: true,
    lastAmount: 50.0,
    ...overrides,
  };
}

export function createMockBillPayment(overrides?: Partial<IBillPayment>): Partial<IBillPayment> {
  return {
    userId: TEST_USER_ID,
    billId: "507f1f77bcf86cd799439011",
    amount: 50.0,
    paymentDate: new Date("2024-01-15"),
    notes: "Test payment",
    ...overrides,
  };
}

export function createMockMileage(overrides?: Partial<IMileage>): Partial<IMileage> {
  return {
    userId: TEST_USER_ID,
    odometer: 10000,
    date: new Date("2024-01-15"),
    classification: "work",
    notes: "Test mileage",
    ...overrides,
  };
}

export function createMockUserSettings(overrides?: Partial<IUserSettings>): Partial<IUserSettings> {
  return {
    userId: TEST_USER_ID,
    irsMileageDeduction: 0.70,
    incomeSourceTags: ["Uber", "Lyft", "DoorDash"],
    expenseSourceTags: ["Gas", "Maintenance"],
    ...overrides,
  };
}

