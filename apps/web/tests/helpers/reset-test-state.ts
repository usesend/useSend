import "~/env";

import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "~/env";

const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

export async function truncateDatabase(client: PrismaClient = prisma) {
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations');
  `;

  if (!tables.length) {
    return;
  }

  const formattedTables = tables
    .map(
      ({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`,
    )
    .join(", ");

  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${formattedTables} RESTART IDENTITY CASCADE;`,
  );
}

export async function flushRedis(connection: Redis = redis) {
  await connection.flushall();
}

export async function resetTestState() {
  await flushRedis();
  await truncateDatabase();
}

async function runAsCli() {
  try {
    await resetTestState();
  } finally {
    await redis.quit();
    await prisma.$disconnect();
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  runAsCli()
    .then(() => {
      console.info("Test state reset complete.");
    })
    .catch((error) => {
      console.error("Failed to reset test state:", error);
      process.exitCode = 1;
    });
}
