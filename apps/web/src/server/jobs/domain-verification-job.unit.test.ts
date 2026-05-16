import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainStatus, type Domain } from "@prisma/client";

const {
  mockFindMany,
  mockIsDomainVerificationDue,
  mockRefreshDomainVerification,
  mockUpsertJobScheduler,
  mockWorkerOn,
  mockQueue,
  mockWorker,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockIsDomainVerificationDue: vi.fn(),
  mockRefreshDomainVerification: vi.fn(),
  mockUpsertJobScheduler: vi.fn(),
  mockWorkerOn: vi.fn(),
  mockQueue: vi.fn().mockImplementation(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
  })),
  mockWorker: vi.fn().mockImplementation(() => ({
    on: mockWorkerOn,
  })),
}));

vi.mock("bullmq", () => ({
  Queue: mockQueue,
  Worker: mockWorker,
}));

vi.mock("~/server/db", () => ({
  db: {
    domain: {
      findMany: mockFindMany,
    },
  },
}));

vi.mock("~/server/redis", () => ({
  BULL_PREFIX: "bull",
  getRedis: vi.fn(() => ({})),
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("~/server/service/domain-service", () => ({
  isDomainVerificationDue: mockIsDomainVerificationDue,
  refreshDomainVerification: mockRefreshDomainVerification,
}));

import {
  initDomainVerificationJob,
  runDueDomainVerifications,
} from "~/server/jobs/domain-verification-job";

function createDomain(id: number, status: DomainStatus): Domain {
  return {
    id,
    name: `example-${id}.com`,
    teamId: 7,
    status,
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
    isVerifying: status !== DomainStatus.SUCCESS,
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
  };
}

describe("domain-verification-job", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockIsDomainVerificationDue.mockReset();
    mockRefreshDomainVerification.mockReset();
    mockUpsertJobScheduler.mockReset();
    mockWorkerOn.mockReset();
    mockQueue.mockReset();
    mockWorker.mockReset();
    mockQueue.mockImplementation(() => ({
      upsertJobScheduler: mockUpsertJobScheduler,
    }));
    mockWorker.mockImplementation(() => ({
      on: mockWorkerOn,
    }));
  });

  it("refreshes only domains that are due", async () => {
    const firstDomain = createDomain(1, DomainStatus.PENDING);
    const secondDomain = createDomain(2, DomainStatus.SUCCESS);
    mockFindMany.mockResolvedValue([firstDomain, secondDomain]);
    mockIsDomainVerificationDue
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await runDueDomainVerifications();

    expect(mockRefreshDomainVerification).toHaveBeenCalledTimes(1);
    expect(mockRefreshDomainVerification).toHaveBeenCalledWith(firstDomain);
  });

  it("initializes the worker lazily", async () => {
    await initDomainVerificationJob();

    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockWorker).toHaveBeenCalledTimes(1);
    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(mockWorkerOn).toHaveBeenCalledTimes(2);
  });
});
