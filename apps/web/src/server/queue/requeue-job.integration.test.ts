import { Queue, Worker } from "bullmq";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_OPTIONS } from "~/server/queue/queue-constants";
import { requeueJob } from "~/server/queue/requeue-job";
import { getRedis } from "~/server/redis";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetRedis,
} from "~/test/integration/helpers";

const describeIntegration = integrationEnabled ? describe : describe.skip;

const QUEUE_NAME = "requeue-job-integration";
const PREFIX = "requeue-job-test";
// Each test polls the queue a few times; leave room for a slow CI runner.
const TEST_TIMEOUT_MS = 15_000;

type Data = { callId: string };

async function waitFor(check: () => Promise<boolean>, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the queue");
}

describeIntegration("requeueJob with real BullMQ and Redis", () => {
  let queue: Queue<Data>;
  let worker: Worker<Data> | undefined;
  // Attempt numbers seen by the worker, per run (attemptsMade + 1).
  let attempts: number[];
  let shouldFail: boolean;

  function startWorker(handler?: () => Promise<void>): Worker<Data> {
    worker = new Worker<Data>(
      QUEUE_NAME,
      async (job) => {
        attempts.push(job.attemptsMade + 1);
        if (handler) return handler();
        if (shouldFail) throw new Error("endpoint returned 500");
      },
      { connection: getRedis(), prefix: PREFIX },
    );
    return worker;
  }

  const stateOf = async (jobId: string) =>
    (await queue.getJob(jobId))?.getState() ?? "missing";

  beforeEach(async () => {
    await resetRedis();
    attempts = [];
    shouldFail = true;
    queue = new Queue<Data>(QUEUE_NAME, {
      connection: getRedis(),
      prefix: PREFIX,
      defaultJobOptions: {
        ...DEFAULT_QUEUE_OPTIONS,
        attempts: 2,
        backoff: { type: "fixed", delay: 10 },
      },
    });
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue.close();
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it(
    "runs a failed job again with its attempts reset, where a plain add() does nothing",
    async () => {
      startWorker();
      await queue.add("call_1", { callId: "call_1" }, { jobId: "call_1" });
      await waitFor(async () => (await stateOf("call_1")) === "failed");
      expect(attempts).toEqual([1, 2]);

      // The bug: the failed job is kept under the same id, so add() is ignored.
      await queue.add("call_1", { callId: "call_1" }, { jobId: "call_1" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(attempts).toEqual([1, 2]);
      expect(await stateOf("call_1")).toBe("failed");

      shouldFail = false;
      await expect(
        requeueJob(queue, "call_1", { callId: "call_1" }, { jobId: "call_1" }),
      ).resolves.toBe("retried");

      // Completed jobs are removed (removeOnComplete), so the job disappears.
      await waitFor(async () => (await stateOf("call_1")) === "missing");
      expect(attempts).toEqual([1, 2, 1]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "adds a new job when none exists",
    async () => {
      shouldFail = false;
      startWorker();

      await expect(
        requeueJob(queue, "call_2", { callId: "call_2" }, { jobId: "call_2" }),
      ).resolves.toBe("added");

      await waitFor(async () => attempts.length === 1);
      await waitFor(async () => (await stateOf("call_2")) === "missing");
      expect(attempts).toEqual([1]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves a job that is waiting for its next attempt alone",
    async () => {
      startWorker();
      await queue.add(
        "call_3",
        { callId: "call_3" },
        { jobId: "call_3", backoff: { type: "fixed", delay: 60_000 } },
      );
      await waitFor(async () => (await stateOf("call_3")) === "delayed");

      await expect(
        requeueJob(queue, "call_3", { callId: "call_3" }, { jobId: "call_3" }),
      ).resolves.toBe("already-queued");

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(attempts).toEqual([1]);
      expect(await stateOf("call_3")).toBe("delayed");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves a running job alone and never runs it twice at once",
    async () => {
      let release: () => void = () => undefined;
      const running = new Promise<void>((resolve) => {
        release = resolve;
      });
      startWorker(() => running);

      // Always let the job finish, so closing the worker can't hang the suite.
      try {
        await queue.add("call_4", { callId: "call_4" }, { jobId: "call_4" });
        await waitFor(async () => (await stateOf("call_4")) === "active");

        await expect(
          requeueJob(
            queue,
            "call_4",
            { callId: "call_4" },
            { jobId: "call_4" },
          ),
        ).resolves.toBe("already-queued");
      } finally {
        release();
      }

      await waitFor(async () => (await stateOf("call_4")) === "missing");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(attempts).toEqual([1]);
    },
    TEST_TIMEOUT_MS,
  );
});
