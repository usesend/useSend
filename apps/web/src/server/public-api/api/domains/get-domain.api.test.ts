import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTeamFromToken, mockRedis, mockGetDomainService, mockLogger } =
  vi.hoisted(() => ({
    mockGetTeamFromToken: vi.fn(),
    mockRedis: {
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
    },
    mockGetDomainService: vi.fn(),
    mockLogger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  }));

vi.mock("~/server/public-api/auth", () => ({
  getTeamFromToken: mockGetTeamFromToken,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/server/db", () => ({
  db: {
    domain: { findUnique: vi.fn() },
    team: { findUnique: vi.fn() },
  },
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

vi.mock("~/server/service/domain-service", () => ({
  getDomain: mockGetDomainService,
}));

vi.mock("~/server/logger/log", () => ({
  logger: mockLogger,
}));

import { UnsendApiError } from "~/server/public-api/api-error";
import getDomain from "~/server/public-api/api/domains/get-domain";
import { getApp } from "~/server/public-api/hono";

describe("GET /v1/domains/{id}", () => {
  beforeEach(() => {
    mockGetTeamFromToken.mockReset();
    mockGetDomainService.mockReset();
    mockLogger.error.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
    mockRedis.ttl.mockReset();

    mockGetTeamFromToken.mockResolvedValue({
      id: 1,
      apiRateLimit: 20,
      apiKeyId: 11,
      apiKey: { domainId: null },
    });

    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(1);
  });

  function request() {
    const app = getApp();
    getDomain(app);
    return app.request("http://localhost/api/v1/domains/42", {
      headers: { Authorization: "Bearer test-key" },
    });
  }

  it("records the original error, the domain and the team when enrichment fails", async () => {
    mockGetDomainService.mockRejectedValue(
      new Error("SES identity lookup failed"),
    );

    const response = await request();

    expect(response.status).toBe(500);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: 42,
        teamId: 1,
        err: expect.any(Error),
      }),
      "Failed to enrich domain",
    );
  });

  it("records no enrichment failure for an expected missing domain", async () => {
    mockGetDomainService.mockRejectedValue(
      new UnsendApiError({ code: "NOT_FOUND", message: "Domain not found" }),
    );

    const response = await request();

    expect(response.status).toBe(500);
    const enrichmentFailureLogs = mockLogger.error.mock.calls.filter(
      ([, message]) => message === "Failed to enrich domain",
    );
    expect(enrichmentFailureLogs).toHaveLength(0);
  });
});
