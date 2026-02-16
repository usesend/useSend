import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDEMPOTENCY_CONSTANTS,
  IdempotencyService,
} from "~/server/service/idempotency-service";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetRedis,
} from "~/test/integration/helpers";

const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("idempotency redis integration", () => {
  beforeEach(async () => {
    await resetRedis();
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("stores and retrieves idempotency result", async () => {
    const teamId = 1;
    const key = "idem-1";

    await IdempotencyService.setResult(teamId, key, {
      bodyHash: "hash-123",
      emailIds: ["em_1"],
    });

    await expect(IdempotencyService.getResult(teamId, key)).resolves.toEqual({
      bodyHash: "hash-123",
      emailIds: ["em_1"],
    });
  });

  it("acquires lock only once for same key", async () => {
    const teamId = 99;
    const key = "lock-test";

    const first = await IdempotencyService.acquireLock(teamId, key);
    const second = await IdempotencyService.acquireLock(teamId, key);

    expect(first).toBe(true);
    expect(second).toBe(false);

    await IdempotencyService.releaseLock(teamId, key);
    await expect(IdempotencyService.acquireLock(teamId, key)).resolves.toBe(
      true,
    );
  });

  it("returns cached response for repeated payload", async () => {
    const operation = vi.fn(async () => ({ id: "first", emailIds: ["em_1"] }));

    const options = {
      teamId: 25,
      idemKey: "request-1",
      payload: { to: "a@b.com", subject: "hello" },
      operation,
      extractEmailIds: (result: { emailIds: string[] }) => result.emailIds,
      formatCachedResponse: (emailIds: string[]) => ({
        id: "cached",
        emailIds,
      }),
      logContext: "integration-test",
    };

    const first = await IdempotencyService.withIdempotency(options);
    const second = await IdempotencyService.withIdempotency(options);

    expect(first).toEqual({ id: "first", emailIds: ["em_1"] });
    expect(second).toEqual({ id: "cached", emailIds: ["em_1"] });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(IDEMPOTENCY_CONSTANTS.RESULT_TTL_SECONDS).toBe(24 * 60 * 60);
  });
});
