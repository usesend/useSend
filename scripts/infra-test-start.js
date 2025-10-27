"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.test");
const COMPOSE_PATH = path.join(ROOT_DIR, "docker", "test", "compose.yml");

const REQUIRED_KEYS = [
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "REDIS_HOST",
  "REDIS_PORT",
  "SES_SNS_PORT",
  "MINIO_API_PORT",
];

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }
  throw new Error(
    "Missing .env.test. Copy it from .env.test in the repo root before starting infra.",
  );
}

function parseEnvFile(raw) {
  const env = {};
  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) {
      return;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      return;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value.replace(/^"(.*)"$/, "$1");
  });
  return env;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertEnvValue(content, key, value) {
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, `${key}=${value}`);
  }
  const needsNewline = !content.endsWith("\n");
  const prefix = needsNewline ? "\n" : "";
  return `${content}${prefix}${key}=${value}\n`;
}

function syncConnectionStrings(rawEnv) {
  REQUIRED_KEYS.forEach((key) => {
    if (!rawEnv[key]) {
      throw new Error(
        `Missing ${key} in .env.test. Please fill it before starting infra.`,
      );
    }
  });

  const connectionUpdates = {
    DATABASE_URL_TEST: `postgresql://${rawEnv.POSTGRES_USER}:${rawEnv.POSTGRES_PASSWORD}@${rawEnv.POSTGRES_HOST}:${rawEnv.POSTGRES_PORT}/${rawEnv.POSTGRES_DB}`,
    DATABASE_URL: `postgresql://${rawEnv.POSTGRES_USER}:${rawEnv.POSTGRES_PASSWORD}@${rawEnv.POSTGRES_HOST}:${rawEnv.POSTGRES_PORT}/${rawEnv.POSTGRES_DB}`,
    REDIS_URL_TEST: `redis://${rawEnv.REDIS_HOST}:${rawEnv.REDIS_PORT}`,
    REDIS_URL: `redis://${rawEnv.REDIS_HOST}:${rawEnv.REDIS_PORT}`,
    AWS_SES_ENDPOINT: `http://${rawEnv.POSTGRES_HOST}:${rawEnv.SES_SNS_PORT}/api/ses`,
    AWS_SNS_ENDPOINT: `http://${rawEnv.POSTGRES_HOST}:${rawEnv.SES_SNS_PORT}/api/sns`,
    S3_COMPATIBLE_API_URL: `http://${rawEnv.POSTGRES_HOST}:${rawEnv.MINIO_API_PORT}`,
    S3_COMPATIBLE_PUBLIC_URL: `http://${rawEnv.POSTGRES_HOST}:${rawEnv.MINIO_API_PORT}`,
  };

  let nextContent = fs.readFileSync(ENV_PATH, "utf8");
  Object.entries(connectionUpdates).forEach(([key, value]) => {
    nextContent = upsertEnvValue(nextContent, key, value);
  });
  fs.writeFileSync(ENV_PATH, nextContent, "utf8");
  return { ...rawEnv, ...connectionUpdates };
}

function runDockerCompose() {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      ENV_PATH,
      "-f",
      COMPOSE_PATH,
      "up",
      "-d",
      "--wait",
    ],
    {
      stdio: "inherit",
      cwd: ROOT_DIR,
    },
  );

  if (result.status !== 0) {
    throw new Error("docker compose up failed");
  }
}

function runCommand(command, args, envOverrides) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: ROOT_DIR,
    env: { ...process.env, ...envOverrides },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function runPrismaBootstrap(envVars) {
  const prismaEnv = {
    ...envVars,
    DATABASE_URL: envVars.DATABASE_URL_TEST ?? envVars.DATABASE_URL,
  };

  runCommand("pnpm", ["--filter", "web", "db:migrate-deploy"], prismaEnv);
  runCommand("pnpm", ["--filter", "web", "prisma", "db", "seed"], prismaEnv);
}

function main() {
  ensureEnvFile();
  let env = parseEnvFile(fs.readFileSync(ENV_PATH, "utf8"));
  env = syncConnectionStrings(env);
  runDockerCompose();
  runPrismaBootstrap(env);
  console.log("Test infra is running (Postgres, Redis, SES shim, MinIO).");
}

main();
