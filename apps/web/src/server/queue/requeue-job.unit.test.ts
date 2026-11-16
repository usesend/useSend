import { describe, expect, it, vi } from "vitest";
import { requeueJob } from "~/server/queue/requeue-job";

function queueWith(job: unknown) {
  return {
    getJob: vi.fn().mockResolvedValue(job),
    add: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("requeueJob", () => {
  it("treats a failed job without a finish time as a fresh failure", async () => {
    // Fetched while running, failed just after: finishedOn isn't on the snapshot.
    const job = {
      isFailed: vi.fn().mockResolvedValue(true),
      isCompleted: vi.fn().mockResolvedValue(false),
      finishedOn: undefined,
      retry: vi.fn().mockResolvedValue(undefined),
    };
    const options = { retryFailedAfterMs: 60_000, maxFailedAgeMs: 86_400_000 };

    await expect(
      requeueJob(queueWith(job), "n", {}, { jobId: "j" }, options),
    ).resolves.toBe("failed-too-recently");
    expect(job.retry).not.toHaveBeenCalled();
  });

  it("never calls a failure with no finish time too old to retry", async () => {
    const job = {
      isFailed: vi.fn().mockResolvedValue(true),
      isCompleted: vi.fn().mockResolvedValue(false),
      finishedOn: undefined,
      retry: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      requeueJob(
        queueWith(job),
        "n",
        {},
        { jobId: "j" },
        { maxFailedAgeMs: 1 },
      ),
    ).resolves.toBe("retried");
  });
});
