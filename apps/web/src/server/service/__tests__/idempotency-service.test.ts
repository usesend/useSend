import { IdempotencyService } from "../idempotency-service";
import { getRedis } from "../../redis";

// Mock the Redis client
jest.mock("../../redis");
jest.mock("../../logger/log", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("IdempotencyService", () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
    };
    (getRedis as jest.Mock).mockReturnValue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validateKey", () => {
    it("should accept valid keys", () => {
      expect(IdempotencyService.validateKey("valid-key-123")).toBe(true);
      expect(IdempotencyService.validateKey("user_signup_abc")).toBe(true);
      expect(IdempotencyService.validateKey("order-123")).toBe(true);
    });

    it("should reject invalid keys", () => {
      expect(IdempotencyService.validateKey("invalid key")).toBe(false); // spaces
      expect(IdempotencyService.validateKey("invalid@key")).toBe(false); // special chars
      expect(IdempotencyService.validateKey("")).toBe(false); // empty
      expect(IdempotencyService.validateKey("a".repeat(256))).toBe(false); // too long
    });
  });

  describe("checkKey", () => {
    it("should return null if key doesn't exist", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await IdempotencyService.checkKey(1, "test-key");

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith("idempotency:1:test-key");
    });

    it("should return parsed value if key exists", async () => {
      const mockValue = {
        emailId: "email_123",
        createdAt: "2025-10-24T10:00:00Z",
        status: "QUEUED",
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockValue));

      const result = await IdempotencyService.checkKey(1, "test-key");

      expect(result).toEqual(mockValue);
      expect(mockRedis.get).toHaveBeenCalledWith("idempotency:1:test-key");
    });

    it("should return null on error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis error"));

      const result = await IdempotencyService.checkKey(1, "test-key");

      expect(result).toBeNull();
    });
  });

  describe("storeKey", () => {
    it("should store key with 3-day expiration", async () => {
      mockRedis.set.mockResolvedValue("OK");

      const result = await IdempotencyService.storeKey(
        1,
        "test-key",
        "email_123",
        "QUEUED"
      );

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "idempotency:1:test-key",
        expect.stringContaining("email_123"),
        "EX",
        259200, // 3 days in seconds
        "NX"
      );
    });

    it("should return false if key already exists", async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await IdempotencyService.storeKey(
        1,
        "test-key",
        "email_123",
        "QUEUED"
      );

      expect(result).toBe(false);
    });

    it("should return false on error", async () => {
      mockRedis.set.mockRejectedValue(new Error("Redis error"));

      const result = await IdempotencyService.storeKey(
        1,
        "test-key",
        "email_123",
        "QUEUED"
      );

      expect(result).toBe(false);
    });
  });

  describe("team scoping", () => {
    it("should allow same key for different teams", async () => {
      mockRedis.get.mockResolvedValue(null);

      await IdempotencyService.checkKey(1, "same-key");
      await IdempotencyService.checkKey(2, "same-key");

      expect(mockRedis.get).toHaveBeenCalledWith("idempotency:1:same-key");
      expect(mockRedis.get).toHaveBeenCalledWith("idempotency:2:same-key");
      expect(mockRedis.get).toHaveBeenCalledTimes(2);
    });
  });
});
