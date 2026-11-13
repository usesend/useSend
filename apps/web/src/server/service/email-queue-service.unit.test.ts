import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processor } from "bullmq";

const {
  mockDb,
  mockLogger,
  mockQueueAdd,
  mockQueueAddBulk,
  mockSendRawEmail,
  mockCheckEmailLimit,
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
  workers: [] as Array<{
    name: string;
    processor: Processor;
    opts: any;
    close: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("bullmq", () => ({
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
      workers.push({ name, processor, opts, close: this.close });
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
  getConfigurationSetName: vi.fn(async () => "config-set"),
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

import { EmailQueueService } from "./email-queue-service";

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

// what the AWS SDK throws when SES refuses a send for its rate
const throttleError = Object.assign(
  new Error("Maximum sending rate exceeded."),
  { name: "TooManyRequestsException", $retryable: { throttling: true } },
);

function resetQueues() {
  workers.length = 0;
  EmailQueueService.transactionalQueue.clear();
  EmailQueueService.marketingQueue.clear();
  (EmailQueueService as any).transactionalWorker.clear();
  (EmailQueueService as any).marketingWorker.clear();
  (EmailQueueService as any).initialized = false;
}

describe("EmailQueueService rate limiting", () => {
  beforeEach(() => {
    resetQueues();
  });

  it("limits each worker to the send rate per second, not only in concurrency", () => {
    EmailQueueService.initializeQueue("us-east-1", 14, 100);

    const transactional = workers.find(
      (w) => w.name === "us-east-1-transaction",
    );
    const marketing = workers.find((w) => w.name === "us-east-1-marketing");
    expect(transactional?.opts).toMatchObject({
      concurrency: 14,
      limiter: { max: 14, duration: 1000 },
    });
    // a zero share still gets one worker slot, as before
    expect(marketing?.opts).toMatchObject({
      concurrency: 1,
      limiter: { max: 1, duration: 1000 },
    });
  });

  it("replaces the workers when the send rate changes, since a limiter is fixed at creation", () => {
    EmailQueueService.initializeQueue("us-east-1", 14, 100);
    const [firstTransactional, firstMarketing] = workers;

    EmailQueueService.initializeQueue("us-east-1", 2, 50);

    expect(firstTransactional?.close).toHaveBeenCalled();
    expect(firstMarketing?.close).toHaveBeenCalled();
    const replaced = workers.slice(2);
    expect(replaced.map((w) => [w.name, w.opts.limiter])).toEqual([
      ["us-east-1-transaction", { max: 1, duration: 1000 }],
      ["us-east-1-marketing", { max: 1, duration: 1000 }],
    ]);
    // the queues themselves are kept: jobs already waiting stay where they are
    expect(EmailQueueService.transactionalQueue.get("us-east-1")?.name).toBe(
      "us-east-1-transaction",
    );
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
      backoff: { type: "exponential", delay: 1000 },
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

describe("EmailQueueService throttled sends", () => {
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

  it("hands a throttled send back to the queue while attempts remain", async () => {
    mockSendRawEmail.mockRejectedValueOnce(throttleError);

    await expect(process({ attemptsMade: 0, attempts: 3 })).rejects.toBe(
      throttleError,
    );

    // not failed: the job's backoff retries it
    expect(mockDb.emailEvent.create).not.toHaveBeenCalled();
    expect(mockDb.email.update).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: email.id, attempt: 1, attempts: 3 }),
      expect.stringContaining("throttled"),
    );
  });

  it("fails a throttled send on its last attempt", async () => {
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

  it("still fails any other error on the first attempt", async () => {
    const rejected = Object.assign(
      new Error("Email address is not verified."),
      {
        name: "MessageRejected",
      },
    );
    mockSendRawEmail.mockRejectedValueOnce(rejected);

    await expect(
      process({ attemptsMade: 0, attempts: 3 }),
    ).resolves.toBeUndefined();

    expect(mockDb.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED" }),
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
