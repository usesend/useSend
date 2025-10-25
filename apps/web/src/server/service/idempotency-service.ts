import { getRedis } from "~/server/redis";

const IDEMPOTENCY_RESULT_TTL_SECONDS = 24 * 60 * 60; // 24h
const IDEMPOTENCY_LOCK_TTL_SECONDS = 60; // 60s

export type IdempotencyRecord = {
  bodyHash: string;
  emailIds: string[];
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
    key: string
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
    record: IdempotencyRecord
  ): Promise<void> {
    const redis = getRedis();
    await redis.setex(
      resultKey(teamId, key),
      IDEMPOTENCY_RESULT_TTL_SECONDS,
      JSON.stringify(record)
    );
  },

  async acquireLock(teamId: number, key: string): Promise<boolean> {
    const redis = getRedis();
    const ok = await redis.set(
      lockKey(teamId, key),
      "1",
      "EX",
      IDEMPOTENCY_LOCK_TTL_SECONDS,
      "NX"
    );
    return ok === "OK";
  },

  async releaseLock(teamId: number, key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(lockKey(teamId, key));
  },
};

export const IDEMPOTENCY_CONSTANTS = {
  RESULT_TTL_SECONDS: IDEMPOTENCY_RESULT_TTL_SECONDS,
  LOCK_TTL_SECONDS: IDEMPOTENCY_LOCK_TTL_SECONDS,
};

