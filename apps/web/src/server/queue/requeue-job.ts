import type { JobsOptions, Queue } from "bullmq";

export type RequeueResult = "retried" | "added" | "already-queued";

/**
 * Runs a job again under a fixed job id.
 *
 * BullMQ ignores `add()` when a job with the same id already exists, in any
 * state, and our queues keep failed jobs for 30 days. So a plain `add()` after
 * a failure silently does nothing. This helper:
 * - moves a retained failed (or kept completed) job back to waiting, with its
 *   attempt count reset, in one atomic step;
 * - leaves a job that is still waiting, delayed or running alone, since it will
 *   run anyway;
 * - otherwise adds a new job.
 *
 * Use it only where a job is deliberately run again (for example a user pressing
 * Retry), not on hot paths: it costs an extra Redis round trip.
 *
 * The result says what this call did, not that the job will run: if the job
 * changes state at the same moment (another retry, or the 30-day cleanup),
 * `retry()` throws, and the caller should let the user try again. It does not
 * repair queue data that is out of sync.
 */
export async function requeueJob<Data>(
  queue: Queue<Data>,
  name: string,
  data: Data,
  opts: JobsOptions & { jobId: string },
): Promise<RequeueResult> {
  const existing = await queue.getJob(opts.jobId);

  if (existing) {
    const state = await existing.getState();

    if (state === "failed" || state === "completed") {
      await existing.retry(state, {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
      return "retried";
    }

    if (state !== "unknown") {
      return "already-queued";
    }
  }

  // Queue<Data>'s name and data generics are wider than this helper needs.
  await (queue as Queue).add(name, data, opts);
  return "added";
}
