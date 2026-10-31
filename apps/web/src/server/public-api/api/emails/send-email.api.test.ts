import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTeamFromToken,
  mockRedis,
  mockDb,
  mockValidateApiKeyDomainAccess,
  mockQueueEmail,
} = vi.hoisted(() => ({
  mockGetTeamFromToken: vi.fn(),
  mockRedis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  mockDb: {
    apiKey: {
      findUnique: vi.fn(),
    },
    template: {
      findUnique: vi.fn(),
    },
    email: {
      create: vi.fn(),
    },
  },
  mockValidateApiKeyDomainAccess: vi.fn(),
  mockQueueEmail: vi.fn(),
}));

vi.mock("~/server/public-api/auth", () => ({
  getTeamFromToken: mockGetTeamFromToken,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

vi.mock("~/server/service/domain-service", () => ({
  validateApiKeyDomainAccess: mockValidateApiKeyDomainAccess,
  validateDomainFromEmail: vi.fn(),
}));

vi.mock("~/server/service/suppression-service", () => ({
  SuppressionService: {
    checkMultipleEmails: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: {
    queueEmail: mockQueueEmail,
  },
}));

vi.mock("~/server/service/idempotency-service", () => ({
  IdempotencyService: {
    withIdempotency: ({ operation }: { operation: () => Promise<unknown> }) =>
      operation(),
  },
}));

import { getApp } from "~/server/public-api/hono";
import sendEmail from "~/server/public-api/api/emails/send-email";

describe("POST /v1/emails", () => {
  beforeEach(() => {
    mockGetTeamFromToken.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
    mockRedis.ttl.mockReset();
    mockDb.apiKey.findUnique.mockReset();
    mockDb.template.findUnique.mockReset();
    mockDb.email.create.mockReset();
    mockValidateApiKeyDomainAccess.mockReset();
    mockQueueEmail.mockReset();

    mockGetTeamFromToken.mockResolvedValue({
      id: 1,
      apiRateLimit: 20,
      apiKeyId: 11,
      apiKey: { domainId: null },
    });

    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(1);

    mockDb.apiKey.findUnique.mockResolvedValue({ id: 11, domain: null });
    mockValidateApiKeyDomainAccess.mockResolvedValue({
      id: 10,
      region: "us-east-1",
    });
  });

  it("returns 404 for a template outside the caller's team", async () => {
    mockDb.template.findUnique.mockResolvedValue(null);

    const app = getApp();
    sendEmail(app);

    const response = await app.request("http://localhost/api/v1/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: "user@example.com",
        from: "hello@example.com",
        subject: "Own subject",
        html: "<p>Own body</p>",
        templateId: "tpl_other_team",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Template not found",
      },
    });
    expect(mockDb.template.findUnique).toHaveBeenCalledWith({
      where: { id: "tpl_other_team", teamId: 1 },
    });
    expect(mockDb.email.create).not.toHaveBeenCalled();
    expect(mockQueueEmail).not.toHaveBeenCalled();
  });
});
