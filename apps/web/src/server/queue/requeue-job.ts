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
 * The result is a best-effort description, not a delivery guarantee
 * ("already-queued" means an existing job was kept, or a vanished one was
 * re-added). If the job changes state at the same moment (another retry, or
 * the 30-day cleanup), `retry()` throws, and the caller should let the user
 * try again. It does not repair queue data that is out of sync.
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
    // isFailed() and isCompleted() are single ZSCORE lookups. getState() would
    // also scan the wait and active lists, which is too costly for callers that
    // run on every scheduler tick.
    const finishedState = (await existing.isFailed())
      ? "failed"
      : (await existing.isCompleted())
        ? "completed"
        : null;

    if (!finishedState) {
      // Still waiting, delayed or running: it will run anyway. add() is still
      // called, in case the job finished and was removed during the checks
      // above: BullMQ ignores it while a job with this id exists.
      await (queue as Queue).add(name, data, opts);
      return "already-queued";
    }

    if (finishedState === "failed") {
      // finishedOn is missing if the job was fetched while still running and
      // failed just after: treat that as a fresh failure, never an old one.
      const failedForMs = existing.finishedOn
        ? Date.now() - existing.finishedOn
        : 0;
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

    await existing.retry(finishedState, {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    return "retried";
  }

  // Queue's name and data generics are wider than this helper needs.
  await (queue as Queue).add(name, data, opts);
  return "added";
}
