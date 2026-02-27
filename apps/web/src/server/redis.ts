import IORedis from "ioredis";
import { env } from "~/env";

export let connection: IORedis | null = null;

/**
 * Key prefix derived from REDIS_KEY_PREFIX env var.
 * When set (e.g. "usesend"), all cache keys become "usesend:team:1", etc.
 * When empty, keys are unprefixed (backwards compatible).
 */
export const REDIS_PREFIX = env.REDIS_KEY_PREFIX
  ? `${env.REDIS_KEY_PREFIX}:`
  : "";

/**
 * BullMQ prefix (no trailing colon — BullMQ adds its own separator).
 * When REDIS_KEY_PREFIX is empty, falls back to BullMQ's default "bull".
 */
export const BULL_PREFIX = env.REDIS_KEY_PREFIX || "bull";

/** Prefix a cache key with REDIS_KEY_PREFIX. */
export function redisKey(key: string): string {
  return `${REDIS_PREFIX}${key}`;
}

export const getRedis = () => {
  if (!connection || connection.status === "end") {
    connection = new IORedis(`${env.REDIS_URL}?family=0`, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
};

/**
 * Simple Redis caching helper. Stores JSON-serialized values under `key` for `ttlSeconds`.
 * If the key exists, returns the parsed value; otherwise, runs `fetcher`, caches, and returns it.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlSeconds?: number; disable?: boolean },
): Promise<T> {
  const { ttlSeconds = 120, disable = false } = options ?? {};

  const redis = getRedis();
  const prefixedKey = redisKey(key);

  if (!disable) {
    const cached = await redis.get(prefixedKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // fallthrough to refresh cache
      }
    }
  }

  const value = await fetcher();

  if (!disable) {
    try {
      await redis.setex(prefixedKey, ttlSeconds, JSON.stringify(value));
    } catch {
      // ignore cache set errors
    }
  }

  return value;
}
