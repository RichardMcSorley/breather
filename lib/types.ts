/**
 * Common TypeScript types for API responses, query objects, and data structures
 */

import { ITransaction } from "./models/Transaction";
import { IBill } from "./models/Bill";
import { IMileage } from "./models/Mileage";
import { IBillPayment } from "./models/BillPayment";
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
  stepLog?: Array<{
    fromStep?: string | null;
    toStep: string;
    time: Date | string;
  }>;
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
  stepLog?: Array<{
    fromStep?: string | null;
    toStep: string;
    time: Date | string;
  }>;
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

