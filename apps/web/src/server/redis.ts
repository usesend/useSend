import IORedis from "ioredis";
import { env } from "~/env";

export let connection: IORedis | null = null;

export const getRedis = () => {
  if (!connection) {
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
  options?: { ttlSeconds?: number; disable?: boolean }
): Promise<T> {
  const { ttlSeconds = 120, disable = false } = options ?? {};

  const redis = getRedis();

  if (!disable) {
    const cached = await redis.get(key);
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
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // ignore cache set errors
    }
  }

  return value;
}

export type RedisSetJsonOptions = {
  ttlSeconds?: number;
  mode?: "NX" | "XX";
};

export async function setJsonValue(
  key: string,
  value: unknown,
  options?: RedisSetJsonOptions
): Promise<"OK" | null> {
  const redis = getRedis();
  const payload = JSON.stringify(value);
  const mode = options?.mode;
  const ttlSeconds = options?.ttlSeconds;

  if (mode && ttlSeconds) {
    return redis.set(key, payload, mode, "EX", ttlSeconds);
  }

  if (mode) {
    return redis.set(key, payload, mode);
  }

  if (ttlSeconds) {
    return redis.set(key, payload, "EX", ttlSeconds);
  }

  return redis.set(key, payload);
}

export async function getJsonValue<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const cached = await redis.get(key);
  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

export async function deleteKey(key: string): Promise<number> {
  const redis = getRedis();
  return redis.del(key);
}
