import NextAuth from "next-auth";

import { authOptions } from "~/server/auth";
import { env } from "~/env";
import { getRedis } from "~/server/redis";
import { logger } from "~/server/logger/log";

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(req: Request) {
  if (env.AUTH_EMAIL_RATE_LIMIT > 0) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/signin/email")) {
      try {
        const ip =
          req.headers.get("x-forwarded-for")?.split(",")[0] ??
          req.headers.get("x-real-ip") ??
          "unknown";
        const redis = getRedis();
        const key = `auth-rl:${ip}`;
        const ttl = 60;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, ttl);
        if (count > env.AUTH_EMAIL_RATE_LIMIT) {
          logger.warn({ ip }, "Auth email rate limit exceeded");
          return new Response("Too many requests", { status: 429 });
        }
      } catch (error) {
        logger.error({ err: error }, "Auth email rate limit failed");
      }
    }
  }
  return handler(req);
}
