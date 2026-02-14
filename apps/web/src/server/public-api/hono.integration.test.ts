import { ApiPermission } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getApp } from "~/server/public-api/hono";
import { addApiKey } from "~/server/service/api-service";
import { createTeam } from "~/test/factories/core";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetDatabase,
  resetRedis,
} from "~/test/integration/helpers";

const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("Hono public API integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("authenticates request with persisted API key", async () => {
    const team = await createTeam({
      name: "Auth Team",
      apiRateLimit: 2,
    });
    const apiKey = await addApiKey({
      name: "integration-key",
      permission: ApiPermission.FULL,
      teamId: team.id,
    });

    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ teamId: c.var.team.id }));

    const response = await app.request("http://localhost/api/v1/ping", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ teamId: team.id });
  });

  it("returns forbidden when API key is invalid", async () => {
    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/api/v1/ping", {
      headers: {
        Authorization: "Bearer us_bad_token",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "FORBIDDEN",
      },
    });
  });

  it("enforces Redis rate limits when cloud mode is enabled", async () => {
    const team = await createTeam({
      name: "Rate Team",
      apiRateLimit: 1,
    });
    const apiKey = await addApiKey({
      name: "rate-key",
      permission: ApiPermission.FULL,
      teamId: team.id,
    });

    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const first = await app.request("http://localhost/api/v1/ping", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const second = await app.request("http://localhost/api/v1/ping", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
