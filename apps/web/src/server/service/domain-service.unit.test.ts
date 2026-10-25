import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainStatus, type Domain } from "@prisma/client";

const {
  mockDb,
  mockTx,
  mockAddDomain,
  mockGetSesSetting,
  mockLimitService,
  mockGetDomainIdentity,
  mockWebhookEmit,
  mockRedis,
  mockSendMail,
  mockLoggerError,
  mockRenderDomainVerificationStatusEmail,
  mockResolveTxt,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    domain: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    teamUser: {
      findMany: vi.fn(),
    },
  },
  mockTx: {
    domain: {
      create: vi.fn(),
    },
  },
  mockAddDomain: vi.fn(),
  mockGetSesSetting: vi.fn(),
  mockLimitService: {
    checkDomainLimit: vi.fn(),
    lockPlanLimit: vi.fn(),
  },
  mockGetDomainIdentity: vi.fn(),
  mockWebhookEmit: vi.fn(),
  mockRedis: {
    mget: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  mockSendMail: vi.fn(),
  mockLoggerError: vi.fn(),
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
  addDomain: mockAddDomain,
  getDomainIdentity: mockGetDomainIdentity,
}));

vi.mock("~/server/service/ses-settings-service", () => ({
  SesSettingsService: {
    getSetting: mockGetSesSetting,
  },
}));

vi.mock("~/server/service/limit-service", () => ({
  LimitService: mockLimitService,
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

vi.mock("~/server/logger/log", () => ({
  logger: {
    error: mockLoggerError,
    info: vi.fn(),
  },
}));

vi.mock("~/server/email-templates", () => ({
  renderDomainVerificationStatusEmail: mockRenderDomainVerificationStatusEmail,
}));

import {
  createDomain as createDomainForTeam,
  DOMAIN_UNVERIFIED_RECHECK_MS,
  DOMAIN_VERIFIED_RECHECK_MS,
  isDomainVerificationDue,
  refreshDomainVerification,
  validateApiKeyDomainAccess,
  validateDomainFromEmail,
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
    mockDb.teamUser.findMany.mockReset();
    mockGetDomainIdentity.mockReset();
    mockWebhookEmit.mockReset();
    mockRedis.mget.mockReset();
    mockRedis.set.mockReset();
    mockRedis.del.mockReset();
    mockSendMail.mockReset();
    mockLoggerError.mockReset();
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

    expect(mockLoggerError).toHaveBeenCalledOnce();
    expect(mockLoggerError).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: "mail failed" }),
        domainId: domain.id,
        status: DomainStatus.SUCCESS,
      },
      "[DomainService]: Failed to send domain status notification",
    );
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

  describe("validateDomainFromEmail", () => {
    const ownedDomain = createDomain({
      id: 42,
      name: "b-corp.test",
      status: DomainStatus.SUCCESS,
    });

    beforeEach(() => {
      mockDb.domain.findFirst.mockImplementation(
        async ({ where }: { where: { name: string; teamId: number } }) =>
          where.name === ownedDomain.name && where.teamId === 7
            ? ownedDomain
            : null,
      );
    });

    it.each([
      "billing@b-corp.test",
      "Billing <billing@b-corp.test>",
      '"Billing, Team" <billing@b-corp.test>',
    ])("accepts %s", async (from) => {
      await expect(validateDomainFromEmail(from, 7)).resolves.toBe(ownedDomain);
    });

    it.each([
      "billing@a-corp.test",
      "Billing (<x@b-corp.test>) <billing@a-corp.test>",
      '"Me <x@b-corp.test>" <billing@a-corp.test>',
    ])("looks up the delivered domain for %s", async (from) => {
      await expect(validateDomainFromEmail(from, 7)).rejects.toThrow(
        "Domain: a-corp.test of from email is wrong",
      );
    });

    it.each([
      "billing@a-corp.test@b-corp.test",
      "x@b-corp.test@a-corp.test",
      "Group: billing@a-corp.test;",
      "Billing <x@b-corp.test>, billing@a-corp.test",
    ])("rejects %s before looking up a domain", async (from) => {
      await expect(validateDomainFromEmail(from, 7)).rejects.toThrow(
        "From email is invalid",
      );
      expect(mockDb.domain.findFirst).not.toHaveBeenCalled();
    });

    it("does not let a domain-scoped API key send from another domain", async () => {
      const apiKey = { domainId: 42 } as Parameters<
        typeof validateApiKeyDomainAccess
      >[2];

      await expect(
        validateApiKeyDomainAccess(
          "Billing (<x@b-corp.test>) <billing@a-corp.test>",
          7,
          apiKey,
        ),
      ).rejects.toThrow("Domain: a-corp.test of from email is wrong");
    });
  });

  describe("createDomain", () => {
    beforeEach(() => {
      mockGetSesSetting.mockResolvedValue({ region: "us-east-1" });
      mockAddDomain.mockResolvedValue("public-key");
      mockTx.domain.create.mockImplementation(async ({ data }) =>
        createDomain({ ...data, isVerifying: false }),
      );
      mockDb.$transaction.mockImplementation(async (callback: any) =>
        callback(mockTx),
      );
      mockLimitService.checkDomainLimit.mockResolvedValue({
        isLimitReached: false,
        limit: 1,
      });
    });

    it("checks the limit, registers with SES and creates under the plan-limit lock", async () => {
      await createDomainForTeam(7, "example.com", "us-east-1");

      expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
      expect(mockLimitService.lockPlanLimit).toHaveBeenCalledWith(
        mockTx,
        7,
        "domain",
      );
      expect(mockLimitService.checkDomainLimit).toHaveBeenCalledWith(7, mockTx);
      expect(
        mockLimitService.lockPlanLimit.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockLimitService.checkDomainLimit.mock.invocationCallOrder[0]!,
      );
      expect(
        mockLimitService.checkDomainLimit.mock.invocationCallOrder[0],
      ).toBeLessThan(mockAddDomain.mock.invocationCallOrder[0]!);
      expect(mockTx.domain.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "example.com",
          teamId: 7,
          publicKey: "public-key",
        }),
      });
      expect(mockDb.domain.create).not.toHaveBeenCalled();
      expect(mockWebhookEmit).toHaveBeenCalledWith(
        7,
        "domain.created",
        expect.anything(),
        expect.anything(),
      );
    });

    it("rejects before calling SES when the domain limit is reached", async () => {
      mockLimitService.checkDomainLimit.mockResolvedValue({
        isLimitReached: true,
        limit: 1,
        reason: "DOMAIN",
      });

      await expect(
        createDomainForTeam(7, "example.com", "us-east-1"),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "DOMAIN" });

      expect(mockAddDomain).not.toHaveBeenCalled();
      expect(mockTx.domain.create).not.toHaveBeenCalled();
    });
  });
});
