import { randomUUID } from "crypto";
import { env } from "~/env";
import { UnsendApiError } from "~/server/public-api/api-error";
import { getRedis, redisKey } from "~/server/redis";

export type PlanLimitResource =
  | "domain"
  | "contactBook"
  | "webhook"
  | "teamMember";

const LOCK_TTL_MS = 30_000;
const WAIT_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 100;

// Only delete the lock if we still own it (it may have expired and been
// taken by another request).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/**
 * Runs a plan-limit check and the create that follows it one at a time per
 * team and resource. Without this, concurrent requests all see the same count,
 * all pass the check, and the team ends up over its plan limit.
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
        message: "Another request is already creating this resource, please retry",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_SCRIPT, 1, key, token).catch(() => undefined);
  }
}
