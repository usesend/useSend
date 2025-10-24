import { getRedis } from "~/server/redis";
import { logger } from "~/server/logger/log";

const IDEMPOTENCY_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days

interface IdempotencyValue {
  emailId: string;
  createdAt: string;
  status: string;
}

export class IdempotencyService {
  /**
   * Build Redis key for idempotency
   */
  private static buildKey(teamId: number, idempotencyKey: string): string {
    return `idempotency:${teamId}:${idempotencyKey}`;
  }

  /**
   * Check if idempotency key exists (not expired)
   * Returns email metadata if found, null otherwise
   */
  static async checkKey(
    teamId: number,
    idempotencyKey: string
  ): Promise<IdempotencyValue | null> {
    const redis = getRedis();
    const key = this.buildKey(teamId, idempotencyKey);

    try {
      const value = await redis.get(key);
      if (!value) {
        return null;
      }

      const parsed = JSON.parse(value) as IdempotencyValue;
      logger.info(
        { teamId, idempotencyKey, emailId: parsed.emailId },
        "Idempotency key found - returning existing email"
      );

      return parsed;
    } catch (error) {
      logger.error(
        { error, teamId, idempotencyKey },
        "Error checking idempotency key"
      );
      return null; // On error, allow email to be sent
    }
  }

  /**
   * Store idempotency key with 3-day expiration
   * Uses SET NX (only if not exists) to handle race conditions
   * Returns true if stored, false if key already exists
   */
  static async storeKey(
    teamId: number,
    idempotencyKey: string,
    emailId: string,
    status: string
  ): Promise<boolean> {
    const redis = getRedis();
    const key = this.buildKey(teamId, idempotencyKey);

    const value: IdempotencyValue = {
      emailId,
      createdAt: new Date().toISOString(),
      status,
    };

    try {
      // SET NX (only if not exists) with EX (expiration)
      // Returns "OK" if set, null if key already exists
      const result = await redis.set(
        key,
        JSON.stringify(value),
        "EX",
        IDEMPOTENCY_TTL_SECONDS,
        "NX"
      );

      if (result === "OK") {
        logger.info(
          { teamId, idempotencyKey, emailId },
          "Idempotency key stored"
        );
        return true;
      } else {
        logger.warn(
          { teamId, idempotencyKey },
          "Idempotency key already exists (race condition)"
        );
        return false;
      }
    } catch (error) {
      logger.error(
        { error, teamId, idempotencyKey },
        "Error storing idempotency key"
      );
      return false;
    }
  }

  /**
   * Validate idempotency key format
   * Max 255 chars, alphanumeric + hyphens + underscores only
   */
  static validateKey(key: string): boolean {
    const regex = /^[a-zA-Z0-9_-]{1,255}$/;
    return regex.test(key);
  }
}
