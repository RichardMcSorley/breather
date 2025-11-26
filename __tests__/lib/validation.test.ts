import { describe, it, expect } from "vitest";
import {
  isValidObjectId,
  parseFloatSafe,
  parseIntSafe,
  sanitizeString,
  validatePagination,
  validateBodySize,
  isValidEnum,
  TRANSACTION_TYPES,
  MILEAGE_CLASSIFICATIONS,
} from "@/lib/validation";

describe("validation", () => {
  describe("isValidObjectId", () => {
    it("should return true for valid ObjectId", () => {
      expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
      expect(isValidObjectId("507f191e810c19729de860ea")).toBe(true);
    });

    it("should return false for invalid ObjectId", () => {
      expect(isValidObjectId("invalid")).toBe(false);
      expect(isValidObjectId("123")).toBe(false);
      expect(isValidObjectId("")).toBe(false);
    });

    it("should return false for null or undefined", () => {
      expect(isValidObjectId(null as any)).toBe(false);
      expect(isValidObjectId(undefined as any)).toBe(false);
    });

    it("should return false for non-string types", () => {
      expect(isValidObjectId(123 as any)).toBe(false);
      expect(isValidObjectId({} as any)).toBe(false);
    });
  });

  describe("parseFloatSafe", () => {
    it("should parse valid float strings", () => {
      expect(parseFloatSafe("123.45")).toBe(123.45);
      expect(parseFloatSafe("0.5")).toBe(0.5);
      expect(parseFloatSafe("-100.25")).toBe(-100.25);
    });

    it("should parse valid numbers", () => {
      expect(parseFloatSafe(123.45)).toBe(123.45);
      expect(parseFloatSafe(0)).toBe(0);
      expect(parseFloatSafe(-100)).toBe(-100);
    });

    it("should return null for invalid values", () => {
      expect(parseFloatSafe("invalid")).toBeNull();
      expect(parseFloatSafe("abc")).toBeNull();
      expect(parseFloatSafe("")).toBeNull();
    });

    it("should return null for null or undefined", () => {
      expect(parseFloatSafe(null)).toBeNull();
      expect(parseFloatSafe(undefined)).toBeNull();
    });

    it("should respect min constraint", () => {
      expect(parseFloatSafe("5", 10)).toBeNull();
      expect(parseFloatSafe("15", 10)).toBe(15);
      expect(parseFloatSafe("10", 10)).toBe(10);
    });

    it("should respect max constraint", () => {
      expect(parseFloatSafe("15", undefined, 10)).toBeNull();
      expect(parseFloatSafe("5", undefined, 10)).toBe(5);
      expect(parseFloatSafe("10", undefined, 10)).toBe(10);
    });

    it("should respect both min and max constraints", () => {
      expect(parseFloatSafe("5", 10, 20)).toBeNull();
      expect(parseFloatSafe("25", 10, 20)).toBeNull();
      expect(parseFloatSafe("15", 10, 20)).toBe(15);
    });
  });

  describe("parseIntSafe", () => {
    it("should parse valid integer strings", () => {
      expect(parseIntSafe("123")).toBe(123);
      expect(parseIntSafe("0")).toBe(0);
      expect(parseIntSafe("-100")).toBe(-100);
    });

    it("should parse valid numbers", () => {
      expect(parseIntSafe(123)).toBe(123);
      expect(parseIntSafe(0)).toBe(0);
      expect(parseIntSafe(-100)).toBe(-100);
    });

    it("should floor float numbers", () => {
      expect(parseIntSafe(123.45)).toBe(123);
      expect(parseIntSafe(123.99)).toBe(123);
    });

    it("should return null for invalid values", () => {
      expect(parseIntSafe("invalid")).toBeNull();
      expect(parseIntSafe("abc")).toBeNull();
      expect(parseIntSafe("12.34")).toBe(12); // Parses as int
    });

    it("should return null for null or undefined", () => {
      expect(parseIntSafe(null)).toBeNull();
      expect(parseIntSafe(undefined)).toBeNull();
    });

    it("should respect min constraint", () => {
      expect(parseIntSafe("5", 10)).toBeNull();
      expect(parseIntSafe("15", 10)).toBe(15);
      expect(parseIntSafe("10", 10)).toBe(10);
    });

    it("should respect max constraint", () => {
      expect(parseIntSafe("15", undefined, 10)).toBeNull();
      expect(parseIntSafe("5", undefined, 10)).toBe(5);
      expect(parseIntSafe("10", undefined, 10)).toBe(10);
    });

    it("should respect both min and max constraints", () => {
      expect(parseIntSafe("5", 10, 20)).toBeNull();
      expect(parseIntSafe("25", 10, 20)).toBeNull();
      expect(parseIntSafe("15", 10, 20)).toBe(15);
    });
  });

  describe("sanitizeString", () => {
    it("should trim whitespace", () => {
      expect(sanitizeString("  hello  ")).toBe("hello");
      expect(sanitizeString("\t\nworld\n\t")).toBe("world");
    });

    it("should remove null bytes and control characters", () => {
      expect(sanitizeString("hello\x00world")).toBe("helloworld");
      expect(sanitizeString("test\x01\x02\x03test")).toBe("testtest");
    });

    it("should preserve newlines and tabs", () => {
      expect(sanitizeString("hello\nworld")).toBe("hello\nworld");
      expect(sanitizeString("hello\tworld")).toBe("hello\tworld");
    });

    it("should enforce max length", () => {
      expect(sanitizeString("hello", 3)).toBeNull();
      expect(sanitizeString("hi", 3)).toBe("hi");
      expect(sanitizeString("hel", 3)).toBe("hel");
    });

    it("should return null for empty strings after trimming", () => {
      expect(sanitizeString("   ")).toBeNull();
      expect(sanitizeString("")).toBeNull();
    });

    it("should return null for null or undefined", () => {
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(undefined)).toBeNull();
    });

    it("should return null for non-string types", () => {
      expect(sanitizeString(123 as any)).toBeNull();
      expect(sanitizeString({} as any)).toBeNull();
    });
  });

  describe("validatePagination", () => {
    it("should return default values when page and limit are not provided", () => {
      const result = validatePagination(undefined, undefined);
      expect(result).toEqual({ page: 1, limit: 50 });
    });

    it("should parse valid page and limit", () => {
      expect(validatePagination("2", "25")).toEqual({ page: 2, limit: 25 });
      expect(validatePagination(3, 10)).toEqual({ page: 3, limit: 10 });
    });

    it("should default to page 1 if page is invalid", () => {
      expect(validatePagination("0", "25")).toBeNull();
      expect(validatePagination("-1", "25")).toBeNull();
      expect(validatePagination("invalid", "25")).toBeNull();
    });

    it("should default to limit 50 if limit is not provided", () => {
      expect(validatePagination("1", undefined)).toEqual({ page: 1, limit: 50 });
    });

    it("should enforce max limit", () => {
      expect(validatePagination("1", "200", 100)).toBeNull();
      expect(validatePagination("1", "50", 100)).toEqual({ page: 1, limit: 50 });
    });

    it("should reject invalid limit values", () => {
      expect(validatePagination("1", "0")).toBeNull();
      expect(validatePagination("1", "-1")).toBeNull();
      expect(validatePagination("1", "invalid")).toBeNull();
    });
  });

  describe("validateBodySize", () => {
    it("should return true for empty body", () => {
      expect(validateBodySize(null)).toBe(true);
      expect(validateBodySize(undefined)).toBe(true);
      expect(validateBodySize("")).toBe(true);
    });

    it("should return true for body within size limit", () => {
      const smallBody = "a".repeat(100);
      expect(validateBodySize(smallBody, 1024)).toBe(true);
    });

    it("should return false for body exceeding size limit", () => {
      const largeBody = "a".repeat(2000);
      expect(validateBodySize(largeBody, 1024)).toBe(false);
    });

    it("should use default 1MB limit", () => {
      const body = "a".repeat(1024 * 1024);
      expect(validateBodySize(body)).toBe(true);
      const tooLarge = "a".repeat(1024 * 1024 + 1);
      expect(validateBodySize(tooLarge)).toBe(false);
    });
  });

  describe("isValidEnum", () => {
    it("should return true for valid enum values", () => {
      expect(isValidEnum("income", TRANSACTION_TYPES)).toBe(true);
      expect(isValidEnum("expense", TRANSACTION_TYPES)).toBe(true);
      expect(isValidEnum("work", MILEAGE_CLASSIFICATIONS)).toBe(true);
      expect(isValidEnum("personal", MILEAGE_CLASSIFICATIONS)).toBe(true);
    });

    it("should return false for invalid enum values", () => {
      expect(isValidEnum("invalid", TRANSACTION_TYPES)).toBe(false);
      expect(isValidEnum("INCOME", TRANSACTION_TYPES)).toBe(false);
      expect(isValidEnum("", TRANSACTION_TYPES)).toBe(false);
    });

    it("should return false for null or undefined", () => {
      expect(isValidEnum(null, TRANSACTION_TYPES)).toBe(false);
      expect(isValidEnum(undefined, TRANSACTION_TYPES)).toBe(false);
    });

    it("should return false for non-string types", () => {
      expect(isValidEnum(123 as any, TRANSACTION_TYPES)).toBe(false);
      expect(isValidEnum({} as any, TRANSACTION_TYPES)).toBe(false);
    });
  });

  describe("parseFloatSafe extreme values", () => {
    it("should handle Number.MAX_VALUE", () => {
      const result = parseFloatSafe(Number.MAX_VALUE);
      expect(result).toBe(Number.MAX_VALUE);
    });

    it("should handle Number.MIN_VALUE", () => {
      const result = parseFloatSafe(Number.MIN_VALUE);
      expect(result).toBe(Number.MIN_VALUE);
    });

    it("should handle Number.MAX_SAFE_INTEGER", () => {
      const result = parseFloatSafe(Number.MAX_SAFE_INTEGER);
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("should handle Number.MIN_SAFE_INTEGER", () => {
      const result = parseFloatSafe(Number.MIN_SAFE_INTEGER);
      expect(result).toBe(Number.MIN_SAFE_INTEGER);
    });

    it("should handle very large string numbers", () => {
      const result = parseFloatSafe("999999999999999999999");
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("parseFloatSafe type coercion", () => {
    it("should handle boolean true", () => {
      const result = parseFloatSafe(true as any);
      // parseFloat(String(true)) = parseFloat("true") = NaN, so returns null
      expect(result).toBeNull();
    });

    it("should handle boolean false", () => {
      const result = parseFloatSafe(false as any);
      // parseFloat(String(false)) = parseFloat("false") = NaN, so returns null
      expect(result).toBeNull();
    });

    it("should handle empty object", () => {
      const result = parseFloatSafe({} as any);
      // parseFloat(String({})) = parseFloat("[object Object]") = NaN
      expect(result).toBeNull();
    });

    it("should handle empty array", () => {
      const result = parseFloatSafe([] as any);
      // parseFloat(String([])) = parseFloat("") = NaN
      expect(result).toBeNull();
    });

    it("should handle array with one number", () => {
      const result = parseFloatSafe([123] as any);
      // parseFloat(String([123])) = parseFloat("123") = 123
      expect(result).toBe(123);
    });

    it("should handle function", () => {
      const result = parseFloatSafe(() => 123 as any);
      // parseFloat(String(function)) = NaN
      expect(result).toBeNull();
    });
  });

  describe("parseIntSafe extreme values", () => {
    it("should handle very large integers", () => {
      const result = parseIntSafe("999999999999999");
      expect(result).toBe(999999999999999);
    });

    it("should handle Number.MAX_SAFE_INTEGER", () => {
      const result = parseIntSafe(Number.MAX_SAFE_INTEGER);
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("should handle Number.MIN_SAFE_INTEGER", () => {
      const result = parseIntSafe(Number.MIN_SAFE_INTEGER);
      expect(result).toBe(Number.MIN_SAFE_INTEGER);
    });
  });

  describe("sanitizeString extreme values", () => {
    it("should handle 1MB string", () => {
      const largeString = "A".repeat(1024 * 1024);
      const result = sanitizeString(largeString);
      expect(result).toBe(largeString);
    });

    it("should enforce max length on large string", () => {
      const largeString = "A".repeat(1000);
      const result = sanitizeString(largeString, 100);
      expect(result).toBeNull();
    });

    it("should handle string at max length", () => {
      const string = "A".repeat(100);
      const result = sanitizeString(string, 100);
      expect(result).toBe(string);
    });
  });

  describe("sanitizeString special characters", () => {
    it("should handle unicode emojis", () => {
      const emojiString = "Test 🚀 🏠 💰";
      const result = sanitizeString(emojiString);
      expect(result).toBe(emojiString);
    });

    it("should remove null bytes", () => {
      const stringWithNull = "Test\x00String";
      const result = sanitizeString(stringWithNull);
      expect(result).toBe("TestString");
    });

    it("should remove control characters", () => {
      const stringWithControl = "Test\x01\x02\x03String";
      const result = sanitizeString(stringWithControl);
      expect(result).toBe("TestString");
    });

    it("should preserve newlines and tabs", () => {
      const stringWithNewlines = "Test\n\tString";
      const result = sanitizeString(stringWithNewlines);
      expect(result).toBe("Test\n\tString");
    });

    it("should handle unicode characters", () => {
      const unicodeString = "测试 テスト тест";
      const result = sanitizeString(unicodeString);
      expect(result).toBe(unicodeString);
    });
  });

  describe("sanitizeString type coercion", () => {
    it("should handle number", () => {
      const result = sanitizeString(123 as any);
      expect(result).toBeNull();
    });

    it("should handle boolean", () => {
      const result = sanitizeString(true as any);
      expect(result).toBeNull();
    });

    it("should handle object", () => {
      const result = sanitizeString({ key: "value" } as any);
      expect(result).toBeNull();
    });

    it("should handle array", () => {
      const result = sanitizeString(["test"] as any);
      expect(result).toBeNull();
    });
  });

  describe("validatePagination edge cases", () => {
    it("should handle very large page number", () => {
      const result = validatePagination("999999", "10");
      expect(result).not.toBeNull();
      expect(result?.page).toBe(999999);
    });

    it("should handle page as 0", () => {
      const result = validatePagination("0", "10");
      expect(result).toBeNull();
    });

    it("should handle negative page", () => {
      const result = validatePagination("-1", "10");
      expect(result).toBeNull();
    });

    it("should handle limit at max", () => {
      const result = validatePagination("1", "100", 100);
      expect(result).toEqual({ page: 1, limit: 100 });
    });

    it("should reject limit above max", () => {
      const result = validatePagination("1", "101", 100);
      expect(result).toBeNull();
    });
  });

  describe("validateBodySize edge cases", () => {
    it("should handle exactly 1MB", () => {
      const body = "A".repeat(1024 * 1024);
      expect(validateBodySize(body)).toBe(true);
    });

    it("should reject body slightly over 1MB", () => {
      const body = "A".repeat(1024 * 1024 + 1);
      expect(validateBodySize(body)).toBe(false);
    });

    it("should handle custom max size", () => {
      const body = "A".repeat(5000);
      expect(validateBodySize(body, 10000)).toBe(true);
    });

    it("should reject body over custom max size", () => {
      const body = "A".repeat(10001);
      expect(validateBodySize(body, 10000)).toBe(false);
    });
  });
});

