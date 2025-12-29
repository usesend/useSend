import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "~/server/db";
import { sendPasswordResetEmail } from "~/server/mailer";
import { getRedis } from "~/server/redis";
import { logger } from "~/server/logger/log";

const schema = z.object({
  email: z.string().email(),
});

function getClientIp(req: Request): string | null {
  const h = req.headers;
  const direct =
    h.get("x-forwarded-for") ??
    h.get("x-real-ip") ??
    h.get("cf-connecting-ip") ??
    h.get("x-client-ip") ??
    h.get("true-client-ip") ??
    h.get("fastly-client-ip") ??
    h.get("x-cluster-client-ip") ??
    null;

  let ip = direct?.split(",")[0]?.trim() ?? "";

  if (!ip) {
    const fwd = h.get("forwarded");
    if (fwd) {
      const first = fwd.split(",")[0];
      const match = first?.match(/for=([^;]+)/i);
      if (match && match[1]) {
        const raw = match[1].trim().replace(/^"|"$/g, "");
        if (raw.startsWith("[")) {
          const end = raw.indexOf("]");
          ip = end !== -1 ? raw.slice(1, end) : raw;
        } else {
          const parts = raw.split(":");
          if (parts.length > 0 && parts[0]) {
            ip =
              parts.length === 2 && /^\d+(?:\.\d+){3}$/.test(parts[0])
                ? parts[0]
                : raw;
          }
        }
      }
    }
  }

  return ip || null;
}

export async function POST(request: Request) {
  // Rate limiting for password reset
  try {
    const ip = getClientIp(request);
    if (ip) {
      const redis = getRedis();
      const key = `password-reset-rl:${ip}`;
      const ttl = 3600; // 1 hour
      const limit = 3;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ttl);
      if (count > limit) {
        logger.warn({ ip }, "Password reset rate limit exceeded");
        // Still return success to prevent enumeration
        return NextResponse.json({ success: true });
      }
    } else {
      logger.warn("Password reset rate limit skipped: missing client IP");
    }
  } catch (error) {
    logger.error({ err: error }, "Password reset rate limit failed");
  }

  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      // Always return success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    const normalizedEmail = result.data.email.toLowerCase().trim();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Only send reset email if user exists AND has a password
    if (user && user.passwordHash) {
      // Delete any existing tokens for this email
      await db.passwordResetToken.deleteMany({
        where: { email: normalizedEmail },
      });

      // Create new token (expires in 1 hour)
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.passwordResetToken.create({
        data: {
          email: normalizedEmail,
          token,
          expires,
        },
      });

      await sendPasswordResetEmail(normalizedEmail, token);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: true });
  }
}
