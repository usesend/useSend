import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "~/env";
import { logger } from "./logger/log";

const MAX_RETRY_DURATION_MS = 60000; // 1 minute total retry window
const BASE_DELAY_MS = 1000; // Start with 1 second delay
const MAX_DELAY_MS = 10000; // Cap individual delays at 10 seconds

const RETRYABLE_ERROR_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server closed the connection
  "P2024", // Timed out fetching a new connection from the pool
]);

// Only retry read-only operations to avoid re-running non-idempotent mutations
const READ_ONLY_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    // Only retry transient connection errors, not permanent misconfigurations
    // (e.g., invalid credentials, wrong database URL, schema errors)
    return (
      error.errorCode !== undefined && RETRYABLE_ERROR_CODES.has(error.errorCode)
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("econnreset") ||
      message.includes("connection") ||
      message.includes("socket") ||
      message.includes("timeout")
    );
  }

  return false;
}

function calculateDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 100;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const createPrismaClient = () => {
  logger.info("Creating Prisma client with retry logic");
  const client = new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  return client.$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        // Skip retries for non-idempotent mutations (creates, updates, deletes)
        if (!READ_ONLY_OPERATIONS.has(operation)) {
          return await query(args);
        }

        let lastError: unknown;
        const startTime = Date.now();
        let attempt = 0;

        while (true) {
          try {
            return await query(args);
          } catch (error) {
            lastError = error;

            if (!isRetryableError(error)) {
              throw error;
            }

            const elapsedTime = Date.now() - startTime;
            const delay = calculateDelay(attempt);

            // Stop retrying if we've exceeded the 1 minute window
            if (elapsedTime + delay > MAX_RETRY_DURATION_MS) {
              break;
            }

            logger.warn(
              {
                operation,
                model,
                attempt: attempt + 1,
                elapsedMs: elapsedTime,
                maxDurationMs: MAX_RETRY_DURATION_MS,
                delayMs: delay,
                error:
                  error instanceof Error ? error.message : "Unknown error",
              },
              `Database connection error, retrying...`
            );
            await sleep(delay);
            attempt++;
          }
        }

        const totalElapsed = Date.now() - startTime;
        logger.error(
          {
            operation,
            model,
            attempts: attempt + 1,
            totalElapsedMs: totalElapsed,
            error:
              lastError instanceof Error ? lastError.message : "Unknown error",
          },
          `Database operation failed after retrying for ${Math.round(totalElapsed / 1000)}s`
        );
        throw lastError;
      },
    },
  });
};

// eslint-disable-next-line no-undef
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = db;
