import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseDateAsUTC,
  parseDateOnlyAsUTC,
  formatDateAsUTC,
  parseESTAsUTC,
  getCurrentESTAsUTC,
} from "@/lib/date-utils";

describe("date-utils", () => {
  describe("parseDateAsUTC", () => {
    it("should parse date string correctly", () => {
      const date = parseDateAsUTC("2024-01-15");
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // January is 0
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
    });

    it("should parse date with time string", () => {
      const date = parseDateAsUTC("2024-01-15", "14:30");
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0);
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(14);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it("should handle ISO date strings with time", () => {
      const date = parseDateAsUTC("2024-01-15T10:00:00Z", "14:30");
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(14);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it("should throw error for missing date", () => {
      expect(() => parseDateAsUTC("")).toThrow("Missing date");
      expect(() => parseDateAsUTC(null as any)).toThrow("Missing date");
    });

    it("should throw error for invalid date", () => {
      // "invalid-date" will split into ["invalid", "date"] which won't parse as numbers
      expect(() => parseDateAsUTC("invalid-date")).toThrow();
      // "2024-13-45" will parse but month 13 is invalid (though JS Date handles it)
      // Let's test with a clearly invalid format
      expect(() => parseDateAsUTC("not-a-date")).toThrow();
    });

    it("should throw error for invalid time format", () => {
      // Invalid time format should throw an error
      expect(() => parseDateAsUTC("2024-01-15", "invalid")).toThrow("Invalid time format");
      expect(() => parseDateAsUTC("2024-01-15", "25:00")).toThrow("Invalid time format"); // Hour out of range
      expect(() => parseDateAsUTC("2024-01-15", "10:60")).toThrow("Invalid time format"); // Minute out of range
      expect(() => parseDateAsUTC("2024-01-15", "10")).toThrow("Invalid time format"); // Missing colon
    });
  });

  describe("parseDateOnlyAsUTC", () => {
    it("should parse date string at midnight UTC", () => {
      const date = parseDateOnlyAsUTC("2024-01-15");
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0);
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
    });

    it("should handle ISO date strings", () => {
      const date = parseDateOnlyAsUTC("2024-01-15T10:00:00Z");
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(0);
    });

    it("should throw error for missing date", () => {
      expect(() => parseDateOnlyAsUTC("")).toThrow("Missing date");
      expect(() => parseDateOnlyAsUTC(null as any)).toThrow("Missing date");
    });

    it("should throw error for invalid date", () => {
      expect(() => parseDateOnlyAsUTC("invalid-date")).toThrow("Invalid date value");
    });
  });

  describe("formatDateAsUTC", () => {
    it("should format date as YYYY-MM-DD", () => {
      const date = new Date(Date.UTC(2024, 0, 15, 14, 30));
      expect(formatDateAsUTC(date)).toBe("2024-01-15");
    });

    it("should pad single digit months and days", () => {
      const date = new Date(Date.UTC(2024, 0, 5, 0, 0));
      expect(formatDateAsUTC(date)).toBe("2024-01-05");
    });

    it("should handle year boundaries", () => {
      const date = new Date(Date.UTC(2023, 11, 31, 0, 0));
      expect(formatDateAsUTC(date)).toBe("2023-12-31");
    });
  });

  describe("parseESTAsUTC", () => {
    it("should parse EST date and convert to UTC", () => {
      const date = parseESTAsUTC("2024-01-15", "10:00");
      // EST is UTC-5, so 10:00 EST = 15:00 UTC
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0);
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(15);
      expect(date.getUTCMinutes()).toBe(0);
    });

    it("should handle hour rollover when converting to UTC", () => {
      const date = parseESTAsUTC("2024-01-15", "20:00");
      // 20:00 EST = 01:00 UTC next day
      expect(date.getUTCDate()).toBe(16);
      expect(date.getUTCHours()).toBe(1);
    });

    it("should handle month rollover", () => {
      const date = parseESTAsUTC("2024-01-31", "20:00");
      // Should roll over to February
      expect(date.getUTCMonth()).toBe(1); // February
      expect(date.getUTCDate()).toBe(1);
    });

    it("should handle year rollover", () => {
      const date = parseESTAsUTC("2024-12-31", "20:00");
      expect(date.getUTCFullYear()).toBe(2025);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(1);
    });

    it("should throw error for missing date", () => {
      expect(() => parseESTAsUTC("")).toThrow("Missing date");
      expect(() => parseESTAsUTC(null as any)).toThrow("Missing date");
    });

    it("should throw error for invalid date", () => {
      expect(() => parseESTAsUTC("invalid-date")).toThrow("Invalid date value");
    });

    it("should throw error for invalid time format", () => {
      // Invalid time format should throw an error
      expect(() => parseESTAsUTC("2024-01-15", "invalid")).toThrow("Invalid time format");
      expect(() => parseESTAsUTC("2024-01-15", "25:00")).toThrow("Invalid time format"); // Hour out of range
      expect(() => parseESTAsUTC("2024-01-15", "10:60")).toThrow("Invalid time format"); // Minute out of range
      expect(() => parseESTAsUTC("2024-01-15", "10")).toThrow("Invalid time format"); // Missing colon
    });
  });

  describe("getCurrentESTAsUTC", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should get current EST time and convert to UTC", () => {
      // Set a fixed UTC time: 2024-01-15 15:00 UTC (which is 10:00 EST)
      vi.setSystemTime(new Date("2024-01-15T15:00:00Z"));

      const result = getCurrentESTAsUTC();
      
      // Should return EST date string (2024-01-15)
      expect(result.estDateString).toBe("2024-01-15");
      
      // Should return EST time string (10:00)
      expect(result.timeString).toBe("10:00");
      
      // Should return UTC date for storage
      expect(result.date.getUTCFullYear()).toBe(2024);
      expect(result.date.getUTCMonth()).toBe(0);
      expect(result.date.getUTCDate()).toBe(15);
      expect(result.date.getUTCHours()).toBe(15); // Converted back to UTC
    });

    it("should handle day rollover when converting from UTC to EST", () => {
      // Set UTC time: 2024-01-16 04:00 UTC (which is 2024-01-15 23:00 EST previous day)
      vi.setSystemTime(new Date("2024-01-16T04:00:00Z"));

      const result = getCurrentESTAsUTC();
      
      // Should show previous day in EST
      expect(result.estDateString).toBe("2024-01-15");
      expect(result.timeString).toBe("23:00");
    });

    it("should handle month rollover", () => {
      // Set UTC time: 2024-02-01 04:00 UTC (which is 2024-01-31 23:00 EST)
      vi.setSystemTime(new Date("2024-02-01T04:00:00Z"));

      const result = getCurrentESTAsUTC();
      
      expect(result.estDateString).toBe("2024-01-31");
      expect(result.timeString).toBe("23:00");
    });
  });
});

