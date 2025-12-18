import { getRedis } from "~/server/redis";
import { canonicalizePayload } from "~/server/utils/idempotency";
import { UseSendApiError } from "~/server/public-api/api-error";
import { logger } from "~/server/logger/log";

const IDEMPOTENCY_RESULT_TTL_SECONDS = 24 * 60 * 60; // 24h
const IDEMPOTENCY_LOCK_TTL_SECONDS = 60; // 60s

export type IdempotencyRecord = {
  bodyHash: string;
  emailIds: string[];
};

export type IdempotencyHandlerOptions<TPayload, TResult> = {
  teamId: number;
  idemKey: string | undefined;
  payload: TPayload;
  operation: () => Promise<TResult>;
  extractEmailIds: (result: TResult) => string[];
  formatCachedResponse: (emailIds: string[]) => TResult;
  logContext: string;
};

function resultKey(teamId: number, key: string) {
  return `idem:${teamId}:${key}`;
}

function lockKey(teamId: number, key: string) {
  return `idemlock:${teamId}:${key}`;
}

export const IdempotencyService = {
  async getResult(
    teamId: number,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const redis = getRedis();
    const raw = await redis.get(resultKey(teamId, key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as any).bodyHash === "string" &&
        Array.isArray((parsed as any).emailIds)
      ) {
        return parsed as IdempotencyRecord;
      }
      return null;
    } catch {
      return null;
    }
  },

  async setResult(
    teamId: number,
    key: string,
    record: IdempotencyRecord,
  ): Promise<void> {
    const redis = getRedis();
    await redis.setex(
      resultKey(teamId, key),
      IDEMPOTENCY_RESULT_TTL_SECONDS,
      JSON.stringify(record),
    );
  },

  async acquireLock(teamId: number, key: string): Promise<boolean> {
    const redis = getRedis();
    const ok = await redis.set(
      lockKey(teamId, key),
      "1",
      "EX",
      IDEMPOTENCY_LOCK_TTL_SECONDS,
      "NX",
    );
    return ok === "OK";
  },

  async releaseLock(teamId: number, key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(lockKey(teamId, key));
  },

  async withIdempotency<TPayload, TResult>(
    options: IdempotencyHandlerOptions<TPayload, TResult>,
  ): Promise<TResult> {
    const {
      teamId,
      idemKey,
      payload,
      operation,
      extractEmailIds,
      formatCachedResponse,
      logContext,
    } = options;

    // Validate idempotency key length
    if (idemKey !== undefined && (idemKey.length < 1 || idemKey.length > 256)) {
      throw new UseSendApiError({
        code: "BAD_REQUEST",
        message: "Invalid Idempotency-Key length",
      });
    }

    // If no idempotency key, just execute the operation
    if (!idemKey) {
      return await operation();
    }

    // Calculate payload hash
    const { bodyHash: payloadHash } = canonicalizePayload(payload);

    // Check for existing result
    const existing = await this.getResult(teamId, idemKey);
    if (existing) {
      if (existing.bodyHash === payloadHash) {
        logger.info({ teamId }, `Idempotency hit for ${logContext}`);
        return formatCachedResponse(existing.emailIds);
      }

      throw new UseSendApiError({
        code: "NOT_UNIQUE",
        message: "Idempotency-Key already used with a different payload",
      });
    }

    // Try to acquire lock
    const lockAcquired = await this.acquireLock(teamId, idemKey);
    if (!lockAcquired) {
      // Check again in case another request completed
      const again = await this.getResult(teamId, idemKey);
      if (again) {
        if (again.bodyHash === payloadHash) {
          logger.info(
            { teamId },
            `Idempotency hit after contention for ${logContext}`,
          );
          return formatCachedResponse(again.emailIds);
        }

        throw new UseSendApiError({
          code: "NOT_UNIQUE",
          message: "Idempotency-Key already used with a different payload",
        });
      }

      throw new UseSendApiError({
        code: "NOT_UNIQUE",
        message:
          "Request with same Idempotency-Key is in progress. Retry later.",
      });
    }

    try {
      // Execute the operation
      const result = await operation();

      // Store the result for future idempotency checks
      await this.setResult(teamId, idemKey, {
        bodyHash: payloadHash,
        emailIds: extractEmailIds(result),
      });

      return result;
    } finally {
      // Always release the lock
      await this.releaseLock(teamId, idemKey);
    }
  },
};

export const IDEMPOTENCY_CONSTANTS = {
  RESULT_TTL_SECONDS: IDEMPOTENCY_RESULT_TTL_SECONDS,
  LOCK_TTL_SECONDS: IDEMPOTENCY_LOCK_TTL_SECONDS,
};
