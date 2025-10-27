"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.test");
const COMPOSE_PATH = path.join(ROOT_DIR, "docker", "test", "compose.yml");

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }
  throw new Error("Missing .env.test. Nothing to stop.");
}

function runDockerDown() {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      ENV_PATH,
      "-f",
      COMPOSE_PATH,
      "down",
      "-v",
      "--remove-orphans",
    ],
    {
      stdio: "inherit",
      cwd: ROOT_DIR,
    },
  );

  if (result.status !== 0) {
    throw new Error("docker compose down failed");
  }
}

function main() {
  ensureEnvFile();
  runDockerDown();
  console.log("Test infra stopped and ephemeral volumes removed.");
}

main();
