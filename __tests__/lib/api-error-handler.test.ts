import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleApiError } from "@/lib/api-error-handler";

describe("api-error-handler", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("handleApiError", () => {
    it("should handle MongoDB connection errors", async () => {
      const error = {
        message: "ECONNREFUSED",
        name: "MongooseServerSelectionError",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toContain("Database connection failed");
    });

    it("should handle MongoDB server selection errors", () => {
      const error = {
        message: "MongoDB connection failed",
        name: "MongooseServerSelectionError",
      };

      const response = handleApiError(error);
      expect(response.status).toBe(503);
    });

    it("should include details in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const error = {
        message: "ECONNREFUSED",
        name: "MongooseServerSelectionError",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(json.details).toBeDefined();
      expect(json.hint).toBeDefined();
    });

    it("should not include details in production mode", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const error = {
        message: "ECONNREFUSED",
        name: "MongooseServerSelectionError",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(json.details).toBeUndefined();
      expect(json.hint).toBeUndefined();
    });

    it("should handle validation errors", async () => {
      const error = {
        name: "ValidationError",
        message: "Invalid input",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Validation error");
      expect(json.details).toBe("Invalid input");
    });

    it("should handle generic errors", async () => {
      const error = {
        message: "Something went wrong",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe("Internal server error");
    });

    it("should include error details in development for generic errors", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const error = {
        message: "Something went wrong",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(json.details).toBe("Something went wrong");
    });

    it("should not include error details in production for generic errors", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const error = {
        message: "Something went wrong",
      };

      const response = handleApiError(error);
      const json = await response.json();

      expect(json.details).toBeUndefined();
    });
  });
});

