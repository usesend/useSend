import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboundEmailStatus } from "@prisma/client";

const {
  mockDbInboundEmailFindUnique,
  mockDbInboundEmailUpdate,
  mockDbDomainFindUnique,
  mockDbRuleFindUnique,
  mockDbEmailCreate,
  mockQueueEmail,
  mockFetchRawEmail,
} = vi.hoisted(() => ({
  mockDbInboundEmailFindUnique: vi.fn(),
  mockDbInboundEmailUpdate: vi.fn(),
  mockDbDomainFindUnique: vi.fn(),
  mockDbRuleFindUnique: vi.fn(),
  mockDbEmailCreate: vi.fn(),
  mockQueueEmail: vi.fn(),
  mockFetchRawEmail: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    inboundEmail: {
      findUnique: mockDbInboundEmailFindUnique,
      update: mockDbInboundEmailUpdate,
    },
    domain: {
      findUnique: mockDbDomainFindUnique,
    },
    emailForwardingRule: {
      findUnique: mockDbRuleFindUnique,
    },
    email: {
      create: mockDbEmailCreate,
    },
  },
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: {
    queueEmail: mockQueueEmail,
  },
}));

vi.mock("~/server/aws/s3-inbound", () => ({
  fetchRawEmail: mockFetchRawEmail,
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/env", () => ({
  env: {
    INBOUND_S3_BUCKET: "test-bucket",
  },
}));

import { processInboundEmail, InboundEmailJobData } from "./inbound-email-service";

const BASE_JOB_DATA: InboundEmailJobData = {
  inboundEmailId: "inb_1",
  teamId: 5,
  domainId: 1,
  snsMessage: JSON.stringify({
    content: [
      "From: sender@other.com",
      "To: support@example.com",
      "Subject: Hello",
      "MIME-Version: 1.0",
      "Content-Type: text/plain",
      "",
      "This is a test email body.",
    ].join("\r\n"),
  }),
};

const MOCK_INBOUND_EMAIL = {
  id: "inb_1",
  teamId: 5,
  domainId: 1,
  from: "sender@other.com",
  to: "support@example.com",
  subject: "Hello",
  status: InboundEmailStatus.RECEIVED,
};

const MOCK_DOMAIN = {
  id: 1,
  name: "example.com",
  teamId: 5,
  region: "us-east-1",
  inboundEnabled: true,
};

const MOCK_RULE = {
  id: "rule_1",
  teamId: 5,
  domainId: 1,
  sourceAddress: "support",
  destinationAddress: "admin@personal.com",
  enabled: true,
};

describe("processInboundEmail", () => {
  beforeEach(() => {
    mockDbInboundEmailFindUnique.mockReset();
    mockDbInboundEmailUpdate.mockReset();
    mockDbDomainFindUnique.mockReset();
    mockDbRuleFindUnique.mockReset();
    mockDbEmailCreate.mockReset();
    mockQueueEmail.mockReset();
    mockFetchRawEmail.mockReset();
  });

  it("forwards email through the send pipeline on happy path", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbRuleFindUnique.mockResolvedValue(MOCK_RULE);
    mockDbInboundEmailUpdate.mockResolvedValue({});
    mockDbEmailCreate.mockResolvedValue({ id: "em_1" });
    mockQueueEmail.mockResolvedValue(undefined);

    await processInboundEmail(BASE_JOB_DATA);

    expect(mockDbEmailCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          to: ["admin@personal.com"],
          isForwarded: true,
          teamId: 5,
          domainId: 1,
        }),
      })
    );

    expect(mockQueueEmail).toHaveBeenCalledWith("em_1", 5, "us-east-1", true);

    expect(mockDbInboundEmailUpdate).toHaveBeenCalledWith({
      where: { id: "inb_1" },
      data: { status: InboundEmailStatus.FORWARDED, errorMessage: undefined },
    });
  });

  it("rewrites From header with original sender name and rule source address", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbRuleFindUnique.mockResolvedValue(MOCK_RULE);
    mockDbInboundEmailUpdate.mockResolvedValue({});
    mockDbEmailCreate.mockResolvedValue({ id: "em_1" });
    mockQueueEmail.mockResolvedValue(undefined);

    await processInboundEmail(BASE_JOB_DATA);

    const createCall = mockDbEmailCreate.mock.calls[0]![0];
    expect(createCall.data.from).toContain("via Unsend");
    expect(createCall.data.from).toContain("support@example.com");
    expect(createCall.data.replyTo).toEqual(["sender@other.com"]);
  });

  it("sets NO_RULE status when no forwarding rule exists", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbRuleFindUnique.mockResolvedValue(null);
    mockDbInboundEmailUpdate.mockResolvedValue({});

    await processInboundEmail(BASE_JOB_DATA);

    expect(mockDbInboundEmailUpdate).toHaveBeenCalledWith({
      where: { id: "inb_1" },
      data: {
        status: InboundEmailStatus.NO_RULE,
        forwardingRuleId: undefined,
      },
    });
    expect(mockDbEmailCreate).not.toHaveBeenCalled();
  });

  it("sets NO_RULE status when rule is disabled", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbRuleFindUnique.mockResolvedValue({ ...MOCK_RULE, enabled: false });
    mockDbInboundEmailUpdate.mockResolvedValue({});

    await processInboundEmail(BASE_JOB_DATA);

    expect(mockDbInboundEmailUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InboundEmailStatus.NO_RULE,
        }),
      })
    );
    expect(mockDbEmailCreate).not.toHaveBeenCalled();
  });

  it("detects forwarding loops and fails", async () => {
    const loopMessage = JSON.stringify({
      content: [
        "From: sender@other.com",
        "To: support@example.com",
        "Subject: Loop Test",
        "x-unsend-forwarding-hops: 5",
        "MIME-Version: 1.0",
        "Content-Type: text/plain",
        "",
        "Loop body.",
      ].join("\r\n"),
    });

    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbInboundEmailUpdate.mockResolvedValue({});

    await processInboundEmail({ ...BASE_JOB_DATA, snsMessage: loopMessage });

    expect(mockDbInboundEmailUpdate).toHaveBeenCalledWith({
      where: { id: "inb_1" },
      data: {
        status: InboundEmailStatus.FAILED,
        errorMessage: "Forwarding loop detected",
      },
    });
    expect(mockDbEmailCreate).not.toHaveBeenCalled();
  });

  it("falls back to S3 when SNS content is missing", async () => {
    const noContentMessage = JSON.stringify({});
    const rawEmail = [
      "From: s3sender@other.com",
      "To: support@example.com",
      "Subject: From S3",
      "MIME-Version: 1.0",
      "Content-Type: text/plain",
      "",
      "S3 body.",
    ].join("\r\n");

    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbRuleFindUnique.mockResolvedValue(MOCK_RULE);
    mockDbInboundEmailUpdate.mockResolvedValue({});
    mockDbEmailCreate.mockResolvedValue({ id: "em_s3" });
    mockQueueEmail.mockResolvedValue(undefined);
    mockFetchRawEmail.mockResolvedValue(rawEmail);

    await processInboundEmail({
      ...BASE_JOB_DATA,
      snsMessage: noContentMessage,
      s3Key: "inbound/example.com/msg123",
    });

    expect(mockFetchRawEmail).toHaveBeenCalledWith(
      "inbound/example.com/msg123",
      "test-bucket",
      "us-east-1"
    );
    expect(mockDbEmailCreate).toHaveBeenCalled();
  });

  it("fails when no content available and no S3 key", async () => {
    const noContentMessage = JSON.stringify({});

    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbInboundEmailUpdate.mockResolvedValue({});

    await processInboundEmail({
      ...BASE_JOB_DATA,
      snsMessage: noContentMessage,
    });

    expect(mockDbInboundEmailUpdate).toHaveBeenCalledWith({
      where: { id: "inb_1" },
      data: {
        status: InboundEmailStatus.FAILED,
        errorMessage: "Failed to parse email",
      },
    });
  });

  it("fails gracefully when domain not found", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(null);
    mockDbInboundEmailUpdate.mockResolvedValue({});

    await processInboundEmail(BASE_JOB_DATA);

    expect(mockDbInboundEmailUpdate).toHaveBeenCalledWith({
      where: { id: "inb_1" },
      data: {
        status: InboundEmailStatus.FAILED,
        errorMessage: "Domain not found",
      },
    });
  });

  it("returns early when inbound email record not found", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(null);

    await processInboundEmail(BASE_JOB_DATA);

    expect(mockDbDomainFindUnique).not.toHaveBeenCalled();
    expect(mockDbEmailCreate).not.toHaveBeenCalled();
  });

  it("sets FAILED status when email create throws", async () => {
    mockDbInboundEmailFindUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
    mockDbDomainFindUnique.mockResolvedValue(MOCK_DOMAIN);
    mockDbRuleFindUnique.mockResolvedValue(MOCK_RULE);
    mockDbInboundEmailUpdate.mockResolvedValue({});
    mockDbEmailCreate.mockRejectedValue(new Error("Constraint violation"));

    await processInboundEmail(BASE_JOB_DATA);

    expect(mockDbInboundEmailUpdate).toHaveBeenLastCalledWith({
      where: { id: "inb_1" },
      data: {
        status: InboundEmailStatus.FAILED,
        errorMessage: "Constraint violation",
      },
    });
  });
});
