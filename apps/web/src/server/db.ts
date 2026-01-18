import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "~/env";
import { logger } from "./logger/log";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 10000;

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

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            lastError = error;

            if (!isRetryableError(error)) {
              throw error;
            }

            if (attempt < MAX_RETRIES - 1) {
              const delay = calculateDelay(attempt);
              logger.warn(
                {
                  operation,
                  model,
                  attempt: attempt + 1,
                  maxRetries: MAX_RETRIES,
                  delayMs: delay,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                },
                `Database connection error, retrying...`
              );
              await sleep(delay);
            }
          }
        }

        logger.error(
          {
            operation,
            model,
            attempts: MAX_RETRIES,
            error:
              lastError instanceof Error ? lastError.message : "Unknown error",
          },
          `Database operation failed after ${MAX_RETRIES} retries`
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
