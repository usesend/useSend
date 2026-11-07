import { randomUUID } from "crypto";
import { env } from "~/env";
import { logger } from "~/server/logger/log";
import { UnsendApiError } from "~/server/public-api/api-error";
import { getRedis, redisKey } from "~/server/redis";

export type PlanLimitResource =
  | "domain"
  | "contactBook"
  | "webhook"
  | "teamMember";

const LOCK_TTL_MS = 30_000;
// Extend the lock well before it expires while the work is still running,
// so a slow create (e.g. SES domain setup) can't outlive it.
const RENEW_EVERY_MS = 10_000;
const WAIT_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 100;

// Only touch the lock if we still own it.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Runs a plan-limit check and the create that follows it one at a time per
 * team and resource. Without this, concurrent requests all see the same count,
 * all pass the check, and the team ends up over its plan limit. `fn` must
 * include the commit of the created row.
 *
 * Plan limits only apply in cloud mode, so self-hosted runs `fn` directly.
 */
export async function withPlanLimitLock<T>(
  teamId: number,
  resource: PlanLimitResource,
  fn: () => Promise<T>,
): Promise<T> {
  if (!env.NEXT_PUBLIC_IS_CLOUD) {
    return fn();
  }

  const redis = getRedis();
  const key = redisKey(`plan-limit-lock:${resource}:${teamId}`);
  const token = randomUUID();
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (true) {
    const acquired = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    if (acquired === "OK") {
      break;
    }
    if (Date.now() >= deadline) {
      throw new UnsendApiError({
        code: "RATE_LIMITED",
        message:
          "Another request is already creating this resource, please retry",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  const renewal = setInterval(() => {
    redis
      .eval(RENEW_SCRIPT, 1, key, token, String(LOCK_TTL_MS))
      .catch((error: unknown) =>
        logger.warn({ err: error, key }, "[PlanLimitLock]: Failed to renew"),
      );
  }, RENEW_EVERY_MS);
  renewal.unref();

  try {
    return await fn();
  } finally {
    clearInterval(renewal);
    // Don't make a finished request wait on Redis; the TTL cleans up if this fails.
    void redis
      .eval(RELEASE_SCRIPT, 1, key, token)
      .catch((error: unknown) =>
        logger.warn({ err: error, key }, "[PlanLimitLock]: Failed to release"),
      );
  }
}
