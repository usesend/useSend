import type { Job, JobsOptions, Queue } from "bullmq";

export type RequeueResult =
  | "retried"
  | "added"
  | "already-queued"
  | "failed-too-recently"
  | "failed-too-long-ago";

// A Queue's type argument is either the job data or a Job type (as BullMQ allows).
type QueueData<DataOrJob> =
  DataOrJob extends Job<infer Data, any, any> ? Data : DataOrJob;

export type RequeueOptions = {
  /** Leave a job that failed less than this long ago alone, for now. */
  retryFailedAfterMs?: number;
  /** Leave a job that failed more than this long ago alone. */
  maxFailedAgeMs?: number;
};

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
 * A failed job can be left alone for a while (`retryFailedAfterMs`) or for good
 * once it is old (`maxFailedAgeMs`). Without options it is retried at once.
 *
 * Use it only where a job is deliberately run again (for example a user pressing
 * Retry, or a scheduler continuing work), not on hot paths: it costs an extra
 * Redis round trip.
 *
 * The result says what this call did, not that the job will run: if the job
 * changes state at the same moment (another retry, or the 30-day cleanup),
 * `retry()` throws, and the caller should let the user try again. It does not
 * repair queue data that is out of sync.
 */
export async function requeueJob<DataOrJob>(
  queue: Queue<DataOrJob>,
  name: string,
  data: QueueData<DataOrJob>,
  opts: JobsOptions & { jobId: string },
  options: RequeueOptions = {},
): Promise<RequeueResult> {
  const existing = await queue.getJob(opts.jobId);

  if (existing) {
    const state = await existing.getState();

    if (state === "failed") {
      const failedForMs = Date.now() - (existing.finishedOn ?? 0);
      if (
        options.retryFailedAfterMs !== undefined &&
        failedForMs < options.retryFailedAfterMs
      ) {
        return "failed-too-recently";
      }
      if (
        options.maxFailedAgeMs !== undefined &&
        failedForMs > options.maxFailedAgeMs
      ) {
        return "failed-too-long-ago";
      }
    }

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

  // Queue's name and data generics are wider than this helper needs.
  await (queue as Queue).add(name, data, opts);
  return "added";
}
