/**
 * Common TypeScript types for API responses, query objects, and data structures
 */

import { ITransaction } from "./models/Transaction";
import { IBill } from "./models/Bill";
import { IMileage } from "./models/Mileage";
import { IBillPayment } from "./models/BillPayment";
import { IIOU } from "./models/IOU";
import { IIOUPayment } from "./models/IOUPayment";
import { TransactionType } from "./validation";

/**
 * MongoDB document with string date formatting (for API responses)
 */
export interface TransactionResponse {
  _id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  date: string; // YYYY-MM-DD format
  time: string;
  isBill: boolean;
  isBalanceAdjustment?: boolean;
  notes?: string;
  tag?: string;
  dueDate?: string; // YYYY-MM-DD format
  step?: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BillResponse = Omit<IBill, "_id" | "createdAt" | "updatedAt"> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type MileageResponse = Omit<IMileage, "_id" | "date" | "createdAt" | "updatedAt"> & {
  _id: string;
  date: string; // YYYY-MM-DD format
  createdAt: string;
  updatedAt: string;
};

export type BillPaymentResponse = Omit<IBillPayment, "_id" | "billId" | "paymentDate" | "createdAt" | "updatedAt"> & {
  _id: string;
  billId: string | { _id: string; name: string; company?: string };
  paymentDate: string; // YYYY-MM-DD format
  createdAt: string;
  updatedAt: string;
};

/**
 * Query objects for MongoDB queries
 */
export interface TransactionQuery {
  userId: string;
  date?: {
    $gte?: Date;
    $lte?: Date;
  };
  type?: TransactionType;
  tag?: string;
  $and?: Array<{ $or?: any[] }>;
}

export interface BillQuery {
  userId: string;
  isActive?: boolean;
}

export interface MileageQuery {
  userId: string;
  date?: {
    $gte?: Date;
    $lte?: Date;
  };
}

export interface BillPaymentQuery {
  userId: string;
  billId?: string;
  paymentDate?: {
    $gte?: Date;
    $lte?: Date;
  };
}

/**
 * Pagination response structure
 */
export interface PaginationResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * API response wrappers
 */
export interface TransactionListResponse {
  transactions: TransactionResponse[];
  pagination: PaginationResponse;
}

export interface MileageListResponse {
  entries: MileageResponse[];
  pagination: PaginationResponse;
}

export interface BillListResponse {
  bills: BillResponse[];
}

export interface BillPaymentListResponse {
  payments: BillPaymentResponse[];
}

/**
 * Request body types
 */
export interface CreateTransactionRequest {
  amount: number;
  type: TransactionType;
  date: string;
  time: string;
  isBill?: boolean;
  notes?: string;
  tag?: string;
  dueDate?: string;
}

export interface UpdateTransactionRequest {
  amount?: number;
  type?: TransactionType;
  date?: string;
  time?: string;
  isBill?: boolean;
  notes?: string;
  tag?: string;
  dueDate?: string;
}

export interface CreateBillRequest {
  name: string;
  amount: number;
  dueDate: number;
  company?: string;
  category?: string;
  notes?: string;
  isActive?: boolean;
  useInPlan?: boolean;
}

export interface UpdateBillRequest {
  name?: string;
  amount?: number;
  dueDate?: number;
  company?: string;
  category?: string;
  notes?: string;
  isActive?: boolean;
  useInPlan?: boolean;
}

export interface CreateMileageRequest {
  odometer: number;
  date: string;
  classification?: "work" | "personal";
  carId?: string;
  notes?: string;
}

export interface UpdateMileageRequest {
  odometer?: number;
  date?: string;
  classification?: "work" | "personal";
  carId?: string;
  notes?: string;
}

export interface CreateBillPaymentRequest {
  billId: string;
  amount: number;
  paymentDate: string;
  notes?: string;
}

export interface UpdateBillPaymentRequest {
  billId?: string;
  amount?: number;
  paymentDate?: string;
  notes?: string;
}

/**
 * Formatted transaction object (used in map operations)
 */
export interface FormattedTransaction {
  _id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  date: string;
  time: string;
  isBill: boolean;
  isBalanceAdjustment?: boolean;
  notes?: string;
  tag?: string;
  dueDate?: string;
  step?: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Formatted mileage entry object (used in map operations)
 */
export interface FormattedMileageEntry {
  _id: string;
  userId: string;
  odometer: number;
  date: string;
  classification: "work" | "personal";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Formatted bill payment object (used in map operations)
 */
export interface FormattedBillPayment {
  _id: string;
  userId: string;
  billId: string | { _id: string; name: string; company?: string };
  amount: number;
  paymentDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * IOU types
 */
export type IOUResponse = Omit<IIOU, "_id" | "date" | "createdAt" | "updatedAt"> & {
  _id: string;
  date: string; // YYYY-MM-DD format
  createdAt: string;
  updatedAt: string;
};

export type IOUPaymentResponse = Omit<IIOUPayment, "_id" | "iouId" | "paymentDate" | "createdAt" | "updatedAt"> & {
  _id: string;
  iouId: string | { _id: string; personName: string; description: string };
  paymentDate: string; // YYYY-MM-DD format
  isAgreementPayment?: boolean;
  createdAt: string;
  updatedAt: string;
};

export interface IOUQuery {
  userId: string;
  isActive?: boolean;
  personName?: string;
}

export interface IOUPaymentQuery {
  userId: string;
  iouId?: string;
  personName?: string;
  paymentDate?: {
    $gte?: Date;
    $lte?: Date;
  };
}

export interface IOUListResponse {
  ious: IOUResponse[];
}

export interface IOUPaymentListResponse {
  payments: IOUPaymentResponse[];
}

export interface CreateIOURequest {
  personName: string;
  description: string;
  amount: number;
  date: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateIOURequest {
  personName?: string;
  description?: string;
  amount?: number;
  date?: string;
  notes?: string;
  isActive?: boolean;
}

export interface CreateIOUPaymentRequest {
  iouId: string;
  personName: string;
  amount: number;
  paymentDate: string;
  notes?: string;
  isAgreementPayment?: boolean;
}

export interface UpdateIOUPaymentRequest {
  iouId?: string;
  personName?: string;
  amount?: number;
  paymentDate?: string;
  notes?: string;
  isAgreementPayment?: boolean;
}

export interface IOUSummary {
  personName: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  iouCount: number;
  paymentCount: number;
}

/**
 * Daily Rate Agreement types
 */
export interface DailyRateAgreementResponse {
  _id: string;
  userId: string;
  personName: string;
  dailyRate: number;
  startDate: string; // YYYY-MM-DD format
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDailyRateAgreementRequest {
  personName: string;
  dailyRate: number;
  startDate: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateDailyRateAgreementRequest {
  personName?: string;
  dailyRate?: number;
  startDate?: string;
  notes?: string;
  isActive?: boolean;
}

export interface DailyRateDay {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  expectedAmount: number;
  cumulativeExpected: number;
  cumulativePaid: number;
  balance: number; // positive = owes, negative = ahead
  isPaid: boolean;
}

export interface DailyRateAgreementStatus {
  agreement: DailyRateAgreementResponse;
  daysElapsed: number;
  expectedTotal: number;
  totalPaid: number;
  runningBalance: number; // expectedTotal - totalPaid (positive = owes, negative = ahead)
  daysAhead: number; // negative means behind
  currentMonthExpected: number;
  currentMonthPaid: number;
  currentMonthBalance: number;
  iouDebt: number; // Amount of IOUs that must be paid first
  dailyBreakdown: DailyRateDay[];
}

