import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { Context, Next } from "hono";
import { handleError } from "./api-error";
import { env } from "~/env";
import { getRedis } from "~/server/redis";
import { getTeamFromToken } from "~/server/public-api/auth";
import { isSelfHosted } from "~/utils/common";
import { UnsendApiError } from "./api-error";
import { Team } from "@prisma/client";
import { logger } from "../logger/log";

// Define AppEnv for Hono context
export type AppEnv = {
  Variables: {
    team: Team & { apiKeyId: number };
  };
};

export function getApp() {
  const app = new OpenAPIHono<AppEnv>().basePath("/api");

  app.onError(handleError);

  // Auth and Team Middleware (runs before rate limiter)
  app.use("*", async (c: Context<AppEnv>, next: Next) => {
    if (
      c.req.path.startsWith("/api/v1/doc") ||
      c.req.path.startsWith("/api/v1/ui") ||
      c.req.path === "/api/health"
    ) {
      return next();
    }

    try {
      const team = await getTeamFromToken(c as any);
      c.set("team", team);
    } catch (error) {
      if (error instanceof UnsendApiError) {
        throw error;
      }
      logger.error({ err: error }, "Error in getTeamFromToken middleware");
      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Authentication failed",
      });
    }
    await next();
  });

  // Custom Rate Limiter Middleware
  const RATE_LIMIT_WINDOW_SECONDS = 1;

  app.use("*", async (c: Context<AppEnv>, next: Next) => {
    // Skip for self-hosted, or if team is not set (e.g. for public/doc paths not caught earlier)
    // or if the path is one of the explicitly skipped paths for auth.
    if (
      isSelfHosted() ||
      !c.var.team || // Team should be set by auth middleware for protected routes
      c.req.path.startsWith("/api/v1/doc") ||
      c.req.path.startsWith("/api/v1/ui") ||
      c.req.path === "/api/health"
    ) {
      return next();
    }

    const team = c.var.team;
    const limit = team.apiRateLimit ?? 2; // Default limit from your previous setup
    const key = `rl:${team.id}`; // Rate limit key for Redis
    const redis = getRedis();

    let currentRequests: number;
    let ttl: number;

    try {
      // Increment the key. If the key does not exist, it is created and set to 1.
      currentRequests = await redis.incr(key);

      if (currentRequests === 1) {
        // This is the first request in the window, set the expiry.
        await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }
      // Get the TTL (time to live) of the key to know when it resets.
      // If the key does not exist or has no expiry, TTL returns -1 or -2.
      // We rely on expire being set for new keys.
      ttl = await redis.ttl(key);
    } catch (error) {
      logger.error({ err: error }, "Redis error during rate limiting");
      // Alternatively, you could fail closed by throwing an error here.
      return next();
    }

    const resetTime =
      Math.floor(Date.now() / 1000) +
      (ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS);
    const remainingRequests = Math.max(0, limit - currentRequests);

    c.res.headers.set("X-RateLimit-Limit", String(limit));
    c.res.headers.set("X-RateLimit-Remaining", String(remainingRequests));
    c.res.headers.set("X-RateLimit-Reset", String(resetTime));

    if (currentRequests > limit) {
      c.res.headers.set(
        "Retry-After",
        String(ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS)
      );
      throw new UnsendApiError({
        code: "RATE_LIMITED",
        message: `Rate limit exceeded. Try again in ${ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS} seconds.`,
      });
    }

    await next();
  });

  // The OpenAPI documentation will be available at /doc
  app.doc("/v1/doc", (c) => ({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "useSend API",
    },
    servers: [{ url: `${env.NEXTAUTH_URL}/api` }],
  }));

  app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
    type: "http",
    scheme: "bearer",
  });

  app.get("/v1/ui", swaggerUI({ url: "/api/v1/doc" }));

  return app;
}

export type PublicAPIApp = OpenAPIHono<AppEnv>;
