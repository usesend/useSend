import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainStatus, type Domain } from "@prisma/client";

const {
  mockDb,
  mockGetDomainIdentity,
  mockAddTrackingEmailIdentity,
  mockDeleteConfigurationSet,
  mockDeleteDomain,
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
  mockAddTrackingEmailIdentity: vi.fn(),
  mockDeleteConfigurationSet: vi.fn(),
  mockDeleteDomain: vi.fn(),
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
  addTrackingEmailIdentity: mockAddTrackingEmailIdentity,
  deleteConfigurationSet: mockDeleteConfigurationSet,
  deleteDomain: mockDeleteDomain,
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

vi.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_IS_CLOUD: false,
    NEXTAUTH_URL: "http://localhost:3000",
  },
}));

import {
  DOMAIN_UNVERIFIED_RECHECK_MS,
  DOMAIN_VERIFIED_RECHECK_MS,
  isDomainVerificationDue,
  refreshDomainVerification,
  setCustomTrackingHostname,
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
    customTrackingHostname: null,
    customTrackingPublicKey: null,
    customTrackingDkimSelector: "utrack",
    customTrackingDkimStatus: null,
    customTrackingStatus: DomainStatus.NOT_STARTED,
    trackingConfigGeneral: null,
    trackingConfigClick: null,
    trackingConfigOpen: null,
    trackingConfigFull: null,
    trackingHttpsRequired: false,
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
    mockAddTrackingEmailIdentity.mockReset();
    mockDeleteConfigurationSet.mockReset();
    mockDeleteDomain.mockReset();
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
    mockResolveTxt.mockImplementation((_name, cb) => {
      cb(null, [["v=DMARC1; p=none;"]]);
    });
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

  it("uses unverified cadence when custom tracking is still pending even if the sending domain is verified", async () => {
    const domain = createDomain({
      status: DomainStatus.SUCCESS,
      customTrackingHostname: "track.example.com",
      customTrackingPublicKey: "pk",
      customTrackingStatus: DomainStatus.PENDING,
    });
    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_UNVERIFIED_RECHECK_MS + 5 * 60 * 1000,
      ).toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(false);

    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_UNVERIFIED_RECHECK_MS - 5 * 60 * 1000,
      ).toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(true);
  });

  it("uses unverified cadence when custom tracking identity is SUCCESS but configuration sets are not provisioned", async () => {
    const domain = createDomain({
      status: DomainStatus.SUCCESS,
      customTrackingHostname: "track.example.com",
      customTrackingPublicKey: "pk",
      customTrackingStatus: DomainStatus.SUCCESS,
      trackingConfigGeneral: null,
      trackingConfigClick: null,
      trackingConfigOpen: null,
      trackingConfigFull: null,
    });
    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_UNVERIFIED_RECHECK_MS + 5 * 60 * 1000,
      ).toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(false);

    mockRedis.mget.mockResolvedValue([
      new Date(
        Date.now() - DOMAIN_UNVERIFIED_RECHECK_MS - 5 * 60 * 1000,
      ).toISOString(),
      DomainStatus.SUCCESS,
      "1",
    ]);

    await expect(isDomainVerificationDue(domain)).resolves.toBe(true);
  });

  it("preserves trackingHttpsRequired when changing hostname if omitted", async () => {
    const existing = createDomain({
      status: DomainStatus.SUCCESS,
      customTrackingHostname: "track.old.example.com",
      customTrackingPublicKey: "oldpk",
      customTrackingStatus: DomainStatus.SUCCESS,
      trackingHttpsRequired: true,
    });
    mockDb.domain.findFirst.mockResolvedValue(existing);
    mockAddTrackingEmailIdentity.mockResolvedValue("newpk");
    mockDb.domain.update.mockImplementation(async ({ data }) =>
      createDomain({ ...existing, ...data }),
    );
    mockDeleteConfigurationSet.mockResolvedValue(undefined);
    mockDeleteDomain.mockResolvedValue(undefined);

    await setCustomTrackingHostname(42, 7, "track.new.example.com");

    expect(mockDb.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackingHttpsRequired: true,
        }),
      }),
    );
  });
});
