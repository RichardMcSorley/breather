/**
 * Validation utilities for input validation, sanitization, and type checking
 */

import mongoose from "mongoose";

/**
 * Validates if a string is a valid MongoDB ObjectId
 * @param id - The string to validate
 * @returns true if valid ObjectId, false otherwise
 */
export function isValidObjectId(id: string | undefined | null): boolean {
  if (!id || typeof id !== "string") {
    return false;
  }
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Validates and parses a float value
 * @param value - The value to parse
 * @param min - Optional minimum value
 * @param max - Optional maximum value
 * @returns Parsed float or null if invalid
 */
export function parseFloatSafe(
  value: string | number | undefined | null,
  min?: number,
  max?: number
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : parseFloat(String(value));

  if (isNaN(parsed)) {
    return null;
  }

  if (min !== undefined && parsed < min) {
    return null;
  }

  if (max !== undefined && parsed > max) {
    return null;
  }

  return parsed;
}

/**
 * Validates and parses an integer value
 * @param value - The value to parse
 * @param min - Optional minimum value
 * @param max - Optional maximum value
 * @returns Parsed integer or null if invalid
 */
export function parseIntSafe(
  value: string | number | undefined | null,
  min?: number,
  max?: number
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? Math.floor(value) : parseInt(String(value), 10);

  if (isNaN(parsed)) {
    return null;
  }

  if (min !== undefined && parsed < min) {
    return null;
  }

  if (max !== undefined && parsed > max) {
    return null;
  }

  return parsed;
}

/**
 * Validates if a value is one of the allowed enum values
 * @param value - The value to validate
 * @param allowedValues - Array of allowed values
 * @returns true if valid, false otherwise
 */
export function isValidEnum<T extends string>(
  value: string | undefined | null,
  allowedValues: readonly T[]
): value is T {
  if (!value || typeof value !== "string") {
    return false;
  }
  return allowedValues.includes(value as T);
}

/**
 * Sanitizes a string by trimming whitespace and removing potentially dangerous characters
 * @param value - The string to sanitize
 * @param maxLength - Optional maximum length
 * @returns Sanitized string or null if invalid
 */
export function sanitizeString(
  value: string | undefined | null,
  maxLength?: number
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  // Trim whitespace
  let sanitized = value.trim();

  // Remove null bytes and control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  // Enforce max length if specified
  if (maxLength !== undefined && sanitized.length > maxLength) {
    return null;
  }

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Validates pagination parameters
 * @param page - Page number (1-indexed), defaults to 1 if not provided
 * @param limit - Items per page, defaults to 50 if not provided
 * @param maxLimit - Maximum allowed limit (default: 100)
 * @returns Validated page and limit, or null if invalid
 */
export function validatePagination(
  page: string | number | undefined | null,
  limit: string | number | undefined | null,
  maxLimit: number = 100
): { page: number; limit: number } | null {
  // Default to page 1 if not provided or invalid
  let parsedPage: number;
  if (page !== undefined && page !== null) {
    const parsed = parseIntSafe(page, 1);
    if (parsed === null) {
      return null; // Invalid page value
    }
    parsedPage = parsed;
  } else {
    parsedPage = 1; // Default to page 1
  }
  
  // Default to 50 if limit not provided, but validate if it is provided
  let parsedLimit: number;
  if (limit !== undefined && limit !== null) {
    const parsed = parseIntSafe(limit, 1, maxLimit);
    if (parsed === null) {
      return null; // Invalid limit value
    }
    parsedLimit = parsed;
  } else {
    parsedLimit = 50; // Default to 50
  }

  return {
    page: parsedPage,
    limit: parsedLimit,
  };
}

/**
 * Validates request body size (in bytes)
 * @param body - The request body string
 * @param maxSize - Maximum size in bytes (default: 1MB)
 * @returns true if valid, false otherwise
 */
export function validateBodySize(
  body: string | undefined | null,
  maxSize: number = 1024 * 1024 // 1MB
): boolean {
  if (!body) {
    return true; // Empty body is valid
  }

  const sizeInBytes = new Blob([body]).size;
  return sizeInBytes <= maxSize;
}

/**
 * Transaction type enum values
 */
export const TRANSACTION_TYPES = ["income", "expense"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Mileage classification enum values
 */
export const MILEAGE_CLASSIFICATIONS = ["work", "personal"] as const;
export type MileageClassification = (typeof MILEAGE_CLASSIFICATIONS)[number];

