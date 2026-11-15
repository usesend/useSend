import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnsendApiError } from "~/server/public-api/api-error";

const { mockGetTeamFromToken, mockRedis } = vi.hoisted(() => ({
  mockGetTeamFromToken: vi.fn(),
  mockRedis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
}));

vi.mock("~/server/public-api/auth", () => ({
  getTeamFromToken: mockGetTeamFromToken,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

import { getApp } from "~/server/public-api/hono";

describe("public API Hono middleware", () => {
  beforeEach(() => {
    mockGetTeamFromToken.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
    mockRedis.ttl.mockReset();
  });

  it("applies auth and rate limit headers", async () => {
    mockGetTeamFromToken.mockResolvedValue({
      id: 1,
      apiRateLimit: 2,
      apiKeyId: 11,
      apiKey: { domainId: null },
    });
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(1);

    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/api/v1/ping", {
      headers: {
        Authorization: "Bearer test-key",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("1");
  });

  it("returns 429 when limit is exceeded", async () => {
    mockGetTeamFromToken.mockResolvedValue({
      id: 1,
      apiRateLimit: 2,
      apiKeyId: 11,
      apiKey: { domainId: null },
    });
    mockRedis.incr.mockResolvedValue(3);
    mockRedis.ttl.mockResolvedValue(1);

    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/api/v1/ping", {
      headers: {
        Authorization: "Bearer test-key",
      },
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "RATE_LIMITED",
      },
    });
  });

  it("returns auth error from middleware", async () => {
    mockGetTeamFromToken.mockRejectedValue(
      new UnsendApiError({
        code: "UNAUTHORIZED",
        message: "No Authorization header provided",
      }),
    );

    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/api/v1/ping");

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });

  it("never reaches a route without a valid API key, even with encoded line terminators in the path", async () => {
    mockGetTeamFromToken.mockRejectedValue(
      new UnsendApiError({ code: "UNAUTHORIZED", message: "No API key" }),
    );

    const app = getApp();
    const reached = vi.fn();
    // A mix of static and parameterised routes, as in the real API.
    app.get("/v1/domains", (c) => (reached("domains"), c.json({ ok: true })));
    app.get("/v1/emails/:emailId", (c) => (reached("email"), c.json({ ok: true })));
    app.post("/v1/emails", (c) => (reached("send"), c.json({ ok: true })));
    app.get("/v1/contactBooks/:id/contacts/:contactId", (c) => (reached("contact"), c.json({ ok: true })));

    const paths = [
      "/api/v1/domains",
      "/api/v1/domains%0A",
      "/api/v1/domains%0D",
      "/api/v1/domains%E2%80%A8",
      "/api/v1/domains%E2%80%A9",
      "/api/v1/emails/abc",
      "/api/v1/emails/abc%0A",
      "/api/v1/emails/abc%E2%80%A8",
      "/api/v1/emails/%0A",
      "/api/v1/contactBooks/1/contacts/2%0A",
      "/api/v1/contactBooks/1%0A/contacts/2",
    ];
    for (const path of paths) {
      const response = await app.request(`http://localhost${path}`);
      expect(response.status, path).toBe(401);
    }
    const send = await app.request("http://localhost/api/v1/emails%0A", { method: "POST" });
    expect([401, 404]).toContain(send.status);

    expect(reached).not.toHaveBeenCalled();
  });
});

