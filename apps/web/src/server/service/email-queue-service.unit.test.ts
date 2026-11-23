import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processor } from "bullmq";

const {
  mockDb,
  mockLogger,
  mockQueueAdd,
  mockQueueAddBulk,
  mockSendRawEmail,
  mockCheckEmailLimit,
  mockGetConfigurationSetName,
  workers,
} = vi.hoisted(() => ({
  mockDb: {
    sesSetting: { findMany: vi.fn() },
    email: { findUnique: vi.fn(), update: vi.fn() },
    emailEvent: { create: vi.fn() },
    domain: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() },
  },
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockQueueAdd: vi.fn(),
  mockQueueAddBulk: vi.fn(async () => []),
  mockSendRawEmail: vi.fn(),
  mockCheckEmailLimit: vi.fn(),
  mockGetConfigurationSetName: vi.fn(async () => "config-set"),
  workers: [] as Array<{
    name: string;
    processor: Processor;
    opts: any;
  }>,
}));

vi.mock("bullmq", () => ({
  UnrecoverableError: class UnrecoverableError extends Error {},
  Queue: class {
    public name: string;
    public add = mockQueueAdd;
    public addBulk = mockQueueAddBulk;
    constructor(name: string) {
      this.name = name;
    }
  },
  Worker: class {
    public close = vi.fn(async () => undefined);
    constructor(name: string, processor: Processor, opts: any) {
      workers.push({ name, processor, opts });
    }
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));
vi.mock("~/server/redis", () => ({
  getRedis: () => ({}),
  BULL_PREFIX: "test",
}));
vi.mock("~/server/aws/ses", () => ({ sendRawEmail: mockSendRawEmail }));
vi.mock("~/utils/ses-utils", () => ({
  getConfigurationSetName: mockGetConfigurationSetName,
}));
vi.mock("~/server/service/limit-service", () => ({
  LimitService: { checkEmailLimit: mockCheckEmailLimit },
}));
vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: (handler: any) => handler,
}));
vi.mock("~/env", () => ({
  env: { AWS_DEFAULT_REGION: "us-east-1" },
}));

import { UnrecoverableError } from "bullmq";
import { EmailQueueService, ThrottledSendError } from "./email-queue-service";

const email = {
  id: "email-1",
  teamId: 7,
  domainId: null,
  to: ["someone@example.com"],
  from: "Sender <sender@example.com>",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
  replyTo: null,
  cc: [],
  bcc: [],
  attachments: null,
  headers: null,
  campaignId: null,
  contactId: null,
  inReplyToId: null,
};

// what the AWS SDK throws when SES refuses a send for the account send rate
const throttleError = Object.assign(
  new Error("Maximum sending rate exceeded."),
  { name: "TooManyRequestsException", $retryable: { throttling: true } },
);

// a transient server-side failure the SDK marks retryable
const transientError = Object.assign(new Error("Service Unavailable"), {
  name: "ServiceUnavailableException",
  $retryable: { errorType: "TRANSIENT" },
  $metadata: { httpStatusCode: 503 },
});

// a terminal failure: SES rejected the message
const terminalError = Object.assign(
  new Error("Email address is not verified."),
  { name: "MessageRejected", $metadata: { httpStatusCode: 400 } },
);

function resetQueues() {
  workers.length = 0;
  EmailQueueService.transactionalQueue.clear();
  EmailQueueService.marketingQueue.clear();
  (EmailQueueService as any).transactionalWorker.clear();
  (EmailQueueService as any).marketingWorker.clear();
  (EmailQueueService as any).initialized = false;
}

describe("EmailQueueService job options", () => {
  beforeEach(() => {
    resetQueues();
  });

  it("queues every email with retries and backoff", async () => {
    mockDb.sesSetting.findMany.mockResolvedValue([]);
    EmailQueueService.initializeQueue("us-east-1", 14, 100);

    await EmailQueueService.queueEmail("email-1", 7, "us-east-1", true);
    await EmailQueueService.queueBulk([
      {
        emailId: "email-2",
        teamId: 7,
        region: "us-east-1",
        transactional: false,
      },
    ]);

    const retryOptions = {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000, jitter: 0.5 },
    };
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "email-1",
      expect.objectContaining({ emailId: "email-1" }),
      expect.objectContaining({ jobId: "email-1", ...retryOptions }),
    );
    expect(mockQueueAddBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        opts: expect.objectContaining({ jobId: "email-2", ...retryOptions }),
      }),
    ]);
  });
});

describe("EmailQueueService send retries", () => {
  beforeEach(() => {
    resetQueues();
    mockDb.email.findUnique.mockResolvedValue(email);
    mockCheckEmailLimit.mockResolvedValue({ isLimitReached: false });
    EmailQueueService.initializeQueue("us-east-1", 14, 100);
  });

  function process(job: { attemptsMade: number; attempts: number }) {
    const worker = workers.find((w) => w.name === "us-east-1-transaction")!;
    return worker.processor({
      id: email.id,
      data: { emailId: email.id, timestamp: Date.now(), teamId: email.teamId },
      attemptsMade: job.attemptsMade,
      opts: { attempts: job.attempts },
    } as unknown as Parameters<Processor>[0]);
  }

  it("throws a throttled send back to the queue while attempts remain", async () => {
    mockSendRawEmail.mockRejectedValueOnce(throttleError);

    await expect(
      process({ attemptsMade: 0, attempts: 3 }),
    ).rejects.toBeInstanceOf(ThrottledSendError);

    // not failed: the job's backoff retries it
    expect(mockDb.emailEvent.create).not.toHaveBeenCalled();
    expect(mockDb.email.update).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: email.id, attempt: 1, attempts: 3 }),
      expect.stringContaining("retry"),
    );
  });

  it("doesn't retry a server error or dropped connection: SES may have accepted it", async () => {
    // A retry could send the customer's email twice (SES has no idempotency
    // key), so these are recorded as failed, as before.
    mockSendRawEmail.mockRejectedValueOnce(transientError);

    await expect(
      process({ attemptsMade: 0, attempts: 3 }),
    ).resolves.toBeUndefined();
    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: email.id },
      data: { latestStatus: "FAILED" },
    });

    vi.clearAllMocks();
    mockDb.email.findUnique.mockResolvedValue(email);
    mockCheckEmailLimit.mockResolvedValue({ isLimitReached: false });
    const dropped = Object.assign(new Error("socket hang up"), {
      name: "TimeoutError",
      $retryable: { throttling: false },
    });
    mockSendRawEmail.mockRejectedValueOnce(dropped);
    await expect(
      process({ attemptsMade: 0, attempts: 3 }),
    ).resolves.toBeUndefined();
    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: email.id },
      data: { latestStatus: "FAILED" },
    });
  });

  it("records FAILED when a retryable send is on its last attempt", async () => {
    mockSendRawEmail.mockRejectedValueOnce(throttleError);

    await expect(
      process({ attemptsMade: 2, attempts: 3 }),
    ).resolves.toBeUndefined();

    expect(mockDb.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailId: email.id,
        status: "FAILED",
        data: { error: throttleError.toString() },
      }),
    });
    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: email.id },
      data: { latestStatus: "FAILED" },
    });
  });

  it("never retries when SES accepted the email but saving that failed", async () => {
    mockSendRawEmail.mockResolvedValueOnce("ses-message-id");
    mockDb.email.update.mockRejectedValue(new Error("db down"));
    mockDb.emailEvent.create.mockRejectedValue(new Error("db down"));

    const outcome = process({ attemptsMade: 0, attempts: 3 });
    // Unrecoverable: the queue fails the job instead of sending it again.
    await expect(outcome).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mockSendRawEmail).toHaveBeenCalledTimes(1);
  });

  it("records FAILED at once for a terminal error", async () => {
    mockSendRawEmail.mockRejectedValueOnce(terminalError);

    await expect(
      process({ attemptsMade: 0, attempts: 3 }),
    ).resolves.toBeUndefined();

    expect(mockDb.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: email.id },
      data: { latestStatus: "FAILED" },
    });
  });

  it("records the SES message id on a successful send", async () => {
    mockSendRawEmail.mockResolvedValueOnce("ses-message-id");

    await process({ attemptsMade: 0, attempts: 3 });

    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: email.id },
      data: {
        sesEmailId: "ses-message-id",
        text: email.text,
        attachments: null,
        headers: null,
      },
    });
    expect(mockDb.emailEvent.create).not.toHaveBeenCalled();
  });
});
