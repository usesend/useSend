import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainStatus, type Domain } from "@prisma/client";

const {
  mockDb,
  mockGetDomainIdentity,
  mockPutEmailIdentityMailFromDomain,
  mockWebhookEmit,
  mockRedis,
  mockSendMail,
  mockRenderDomainVerificationStatusEmail,
  mockResolveTxt,
} = vi.hoisted(() => ({
  mockDb: {
    domain: {
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    teamUser: {
      findMany: vi.fn(),
    },
  },
  mockGetDomainIdentity: vi.fn(),
  mockPutEmailIdentityMailFromDomain: vi.fn(),
  mockWebhookEmit: vi.fn(),
  mockRedis: {
    mget: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  mockSendMail: vi.fn(),
  mockRenderDomainVerificationStatusEmail: vi.fn(),
  mockResolveTxt: vi.fn(),
}));

function wasLastNotifiedStatusStored() {
  return mockRedis.set.mock.calls.some(
    (call) => call[0] === "domain:verification:last-notified-status:42",
  );
}

vi.mock("dns", () => ({
  default: {
    resolveTxt: mockResolveTxt,
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/aws/ses", () => ({
  getDomainIdentity: mockGetDomainIdentity,
  putEmailIdentityMailFromDomain: mockPutEmailIdentityMailFromDomain,
}));

vi.mock("~/server/service/webhook-service", () => ({
  WebhookService: {
    emit: mockWebhookEmit,
  },
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/server/mailer", () => ({
  sendMail: mockSendMail,
}));

vi.mock("~/server/email-templates", () => ({
  renderDomainVerificationStatusEmail: mockRenderDomainVerificationStatusEmail,
}));

import {
  DOMAIN_UNVERIFIED_RECHECK_MS,
  DOMAIN_VERIFIED_RECHECK_MS,
  isDomainVerificationDue,
  refreshDomainVerification,
  setMailFromLabel,
} from "~/server/service/domain-service";

function createDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: 42,
    name: "example.com",
    teamId: 7,
    status: DomainStatus.PENDING,
    region: "us-east-1",
    clickTracking: false,
    openTracking: false,
    publicKey: "public-key",
    dkimSelector: "usesend",
    dkimStatus: DomainStatus.NOT_STARTED,
    spfDetails: DomainStatus.NOT_STARTED,
    dmarcAdded: false,
    errorMessage: null,
    subdomain: null,
    mailFromLabel: null,
    sesTenantId: null,
    isVerifying: true,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("domain-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));

    mockDb.domain.update.mockReset();
    mockDb.domain.findUnique.mockReset();
    mockDb.domain.findFirst.mockReset();
    mockPutEmailIdentityMailFromDomain.mockReset();
    mockDb.teamUser.findMany.mockReset();
    mockGetDomainIdentity.mockReset();
    mockWebhookEmit.mockReset();
    mockRedis.mget.mockReset();
    mockRedis.set.mockReset();
    mockRedis.del.mockReset();
    mockSendMail.mockReset();
    mockRenderDomainVerificationStatusEmail.mockReset();
    mockResolveTxt.mockReset();

    mockRenderDomainVerificationStatusEmail.mockResolvedValue(
      "<p>domain status</p>",
    );
    mockRedis.set.mockResolvedValue("OK");
    mockDb.teamUser.findMany.mockResolvedValue([
      { user: { email: "alice@example.com" } },
      { user: { email: "bob@example.com" } },
    ]);
    mockResolveTxt.mockImplementation(
      (_name: string, cb: (err: Error | null, value?: string[][]) => void) => {
        cb(null, [["v=DMARC1; p=none;"]]);
      },
    );
  });

  it("sends success status emails to all team members when a new domain becomes verified", async () => {
    const domain = createDomain();
    mockRedis.mget.mockResolvedValue([null, null, null]);
    mockGetDomainIdentity.mockResolvedValue({
      DkimAttributes: { Status: DomainStatus.SUCCESS },
      MailFromAttributes: { MailFromDomainStatus: DomainStatus.SUCCESS },
      VerificationInfo: {
        ErrorType: null,
        LastCheckedTimestamp: new Date("2026-03-09T12:00:00.000Z"),
      },
      VerificationStatus: DomainStatus.SUCCESS,
    });
    mockDb.domain.update.mockResolvedValue(
      createDomain({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.SUCCESS,
        dmarcAdded: true,
        isVerifying: false,
      }),
    );

    const result = await refreshDomainVerification(domain);

    expect(mockDb.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DomainStatus.SUCCESS,
          isVerifying: false,
          errorMessage: null,
        }),
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(wasLastNotifiedStatusStored()).toBe(true);
    expect(result.status).toBe(DomainStatus.SUCCESS);
    expect(result.hasEverVerified).toBe(true);
  });

  it("sends one failure email and stops polling on terminal failure", async () => {
    const domain = createDomain();
    mockRedis.mget.mockResolvedValue([null, null, null]);
    mockGetDomainIdentity.mockResolvedValue({
      DkimAttributes: { Status: DomainStatus.PENDING },
      MailFromAttributes: { MailFromDomainStatus: DomainStatus.PENDING },
      VerificationInfo: {
        ErrorType: "MAIL_FROM_DOMAIN_NOT_VERIFIED",
        LastCheckedTimestamp: new Date("2026-03-09T12:00:00.000Z"),
      },
      VerificationStatus: DomainStatus.FAILED,
    });
    mockDb.domain.update.mockResolvedValue(
      createDomain({
        status: DomainStatus.FAILED,
        dkimStatus: DomainStatus.PENDING,
        spfDetails: DomainStatus.PENDING,
        errorMessage: "MAIL_FROM_DOMAIN_NOT_VERIFIED",
        isVerifying: false,
      }),
    );

    const result = await refreshDomainVerification(domain);

    expect(mockDb.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DomainStatus.FAILED,
          isVerifying: false,
          errorMessage: "MAIL_FROM_DOMAIN_NOT_VERIFIED",
        }),
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(DomainStatus.FAILED);
  });

  it("does not resend status emails when the current status was already notified", async () => {
    const domain = createDomain({
      status: DomainStatus.SUCCESS,
      isVerifying: false,
    });
    mockRedis.mget.mockResolvedValue([
      new Date("2026-03-08T12:00:00.000Z").toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);
    mockGetDomainIdentity.mockResolvedValue({
      DkimAttributes: { Status: DomainStatus.SUCCESS },
      MailFromAttributes: { MailFromDomainStatus: DomainStatus.SUCCESS },
      VerificationInfo: {
        ErrorType: null,
        LastCheckedTimestamp: new Date("2026-03-09T12:00:00.000Z"),
      },
      VerificationStatus: DomainStatus.SUCCESS,
    });
    mockDb.domain.update.mockResolvedValue(
      createDomain({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.SUCCESS,
        dmarcAdded: true,
        isVerifying: false,
      }),
    );

    await refreshDomainVerification(domain);

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("does not send status email on first refresh when status is unchanged", async () => {
    const domain = createDomain({
      status: DomainStatus.SUCCESS,
      dkimStatus: DomainStatus.SUCCESS,
      spfDetails: DomainStatus.SUCCESS,
      isVerifying: false,
    });
    mockRedis.mget.mockResolvedValue([null, null, null]);
    mockGetDomainIdentity.mockResolvedValue({
      DkimAttributes: { Status: DomainStatus.SUCCESS },
      MailFromAttributes: { MailFromDomainStatus: DomainStatus.SUCCESS },
      VerificationInfo: {
        ErrorType: null,
        LastCheckedTimestamp: new Date("2026-03-09T12:00:00.000Z"),
      },
      VerificationStatus: DomainStatus.SUCCESS,
    });
    mockDb.domain.update.mockResolvedValue(
      createDomain({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.SUCCESS,
        dmarcAdded: true,
        isVerifying: false,
      }),
    );

    await refreshDomainVerification(domain);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(wasLastNotifiedStatusStored()).toBe(false);
  });

  it("reserves the notification so concurrent refreshes do not double-send", async () => {
    const domain = createDomain();
    mockRedis.mget.mockResolvedValue([null, null, null]);
    let reservedOnce = false;
    mockRedis.set.mockImplementation(async (key: string) => {
      if (key.includes("notification-lock")) {
        if (reservedOnce) {
          return null;
        }

        reservedOnce = true;
        return "OK";
      }

      return "OK";
    });
    mockGetDomainIdentity.mockResolvedValue({
      DkimAttributes: { Status: DomainStatus.SUCCESS },
      MailFromAttributes: { MailFromDomainStatus: DomainStatus.SUCCESS },
      VerificationInfo: {
        ErrorType: null,
        LastCheckedTimestamp: new Date("2026-03-09T12:00:00.000Z"),
      },
      VerificationStatus: DomainStatus.SUCCESS,
    });
    mockDb.domain.update.mockResolvedValue(
      createDomain({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.SUCCESS,
        dmarcAdded: true,
        isVerifying: false,
      }),
    );

    await Promise.all([
      refreshDomainVerification(domain),
      refreshDomainVerification(domain),
    ]);

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockDb.domain.update).toHaveBeenCalledTimes(2);
  });

  it("logs and continues when sending the status email fails", async () => {
    const domain = createDomain();
    mockRedis.mget.mockResolvedValue([null, null, null]);
    mockGetDomainIdentity.mockResolvedValue({
      DkimAttributes: { Status: DomainStatus.SUCCESS },
      MailFromAttributes: { MailFromDomainStatus: DomainStatus.SUCCESS },
      VerificationInfo: {
        ErrorType: null,
        LastCheckedTimestamp: new Date("2026-03-09T12:00:00.000Z"),
      },
      VerificationStatus: DomainStatus.SUCCESS,
    });
    mockDb.domain.update.mockResolvedValue(
      createDomain({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.SUCCESS,
        dmarcAdded: true,
        isVerifying: false,
      }),
    );
    mockSendMail
      .mockRejectedValueOnce(new Error("mail failed"))
      .mockResolvedValueOnce(undefined);

    const result = await refreshDomainVerification(domain);

    expect(result.status).toBe(DomainStatus.SUCCESS);
    expect(mockDb.domain.update).toHaveBeenCalled();
    expect(wasLastNotifiedStatusStored()).toBe(false);
  });

  it("uses a 6 hour cadence for domains that have never verified", async () => {
    const domain = createDomain({ status: DomainStatus.PENDING });
    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_UNVERIFIED_RECHECK_MS + 5 * 60 * 1000,
      ).toISOString(),
      null,
      null,
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(false);

    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_UNVERIFIED_RECHECK_MS - 5 * 60 * 1000,
      ).toISOString(),
      null,
      null,
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(true);
  });

  it("uses a 30 day cadence after a domain has been verified", async () => {
    const domain = createDomain({ status: DomainStatus.FAILED });
    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_VERIFIED_RECHECK_MS + 5 * 60 * 1000,
      ).toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(false);

    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_VERIFIED_RECHECK_MS - 5 * 60 * 1000,
      ).toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(true);
  });

  it("stops automatic retries after an initial terminal failure", async () => {
    const domain = createDomain({
      status: DomainStatus.FAILED,
      isVerifying: false,
    });
    mockRedis.mget.mockResolvedValue([
      new Date("2026-03-09T06:00:00.000Z").toISOString(),
      DomainStatus.FAILED,
      null,
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(false);
  });

  it("marks MAIL FROM verification pending when the label changes", async () => {
    const existing = createDomain({
      status: DomainStatus.SUCCESS,
      spfDetails: DomainStatus.SUCCESS,
      isVerifying: false,
      mailFromLabel: null,
    });
    mockDb.domain.findFirst.mockResolvedValue(existing);
    mockPutEmailIdentityMailFromDomain.mockResolvedValue(undefined);
    mockDb.domain.update.mockImplementation(async ({ data }) =>
      createDomain({ ...existing, ...data }),
    );

    const result = await setMailFromLabel(42, 7, "bounce");

    expect(mockPutEmailIdentityMailFromDomain).toHaveBeenCalledWith(
      "example.com",
      "us-east-1",
      "bounce.example.com",
    );
    expect(mockDb.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({
          mailFromLabel: "bounce",
          spfDetails: DomainStatus.PENDING,
          isVerifying: true,
          errorMessage: null,
        }),
      }),
    );
    expect(result.spfDetails).toBe(DomainStatus.PENDING);
    expect(result.aggregateStatus).toBe(DomainStatus.PENDING);
    expect(result.dnsRecords[0]?.status).toBe(DomainStatus.PENDING);
  });
});
