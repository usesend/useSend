import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ webhookCleanupImported: false }));

const mocks = vi.hoisted(() => ({
  init: vi.fn().mockResolvedValue(undefined),
  initDomain: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/utils/common", () => ({
  isCloud: () => true,
  isEmailCleanupEnabled: () => false,
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: { init: mocks.init },
}));

vi.mock("~/server/jobs/usage-job", () => ({}));

vi.mock("~/server/jobs/domain-verification-job", () => ({
  initDomainVerificationJob: mocks.initDomain,
}));

vi.mock("~/server/jobs/cleanup-email-bodies", () => ({}));

vi.mock("~/server/jobs/campaign-scheduler-job", () => ({
  CampaignSchedulerService: { start: mocks.start },
}));

vi.mock("~/server/jobs/webhook-cleanup-job", () => {
  flags.webhookCleanupImported = true;
  return {};
});

describe("instrumentation register", () => {
  beforeEach(() => {
    vi.resetModules();
    flags.webhookCleanupImported = false;
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6380/15");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts the webhook cleanup job when Redis is configured", async () => {
    const { register } = await import("~/instrumentation");
    await register();
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.initDomain).toHaveBeenCalledTimes(1);
    expect(flags.webhookCleanupImported).toBe(true);
  });

  it("does not start the webhook cleanup job without a Redis URL", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { register } = await import("~/instrumentation");
    await register();
    expect(flags.webhookCleanupImported).toBe(false);
  });
});
