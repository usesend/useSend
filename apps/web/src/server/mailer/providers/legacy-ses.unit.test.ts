import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetDomains, mockSendEmail, mockLogger, mockEnv } =
  vi.hoisted(() => ({
    mockDb: { team: { findFirst: vi.fn() } },
    mockGetDomains: vi.fn(),
    mockSendEmail: vi.fn(),
    mockLogger: { info: vi.fn(), error: vi.fn() },
    mockEnv: { FROM_EMAIL: "hello@example.com" } as Record<
      string,
      string | undefined
    >,
  }));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/service/domain-service", () => ({
  getDomains: mockGetDomains,
}));
vi.mock("~/server/service/email-service", () => ({ sendEmail: mockSendEmail }));
vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));
vi.mock("~/env", () => ({
  env: new Proxy(
    {},
    { get: (_t, k) => mockEnv[k as string] },
  ),
}));

import { LegacySesTransport } from "~/server/mailer/providers/legacy-ses";

describe("LegacySesTransport", () => {
  beforeEach(() => {
    mockDb.team.findFirst.mockReset();
    mockGetDomains.mockReset();
    mockSendEmail.mockReset();
    mockLogger.info.mockReset();
    mockLogger.error.mockReset();
    mockEnv.FROM_EMAIL = "hello@example.com";
  });

  it("returns without sending when no team exists", async () => {
    mockDb.team.findFirst.mockResolvedValue(null);

    await new LegacySesTransport().send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith("No team found");
  });

  it("returns without sending when no domains exist", async () => {
    mockDb.team.findFirst.mockResolvedValue({ id: 7 });
    mockGetDomains.mockResolvedValue([]);

    await new LegacySesTransport().send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith("No domains found");
  });

  it("sends via sendEmail with domain-matched from", async () => {
    mockDb.team.findFirst.mockResolvedValue({ id: 7 });
    mockGetDomains.mockResolvedValue([{ name: "example.com" }]);
    mockSendEmail.mockResolvedValue({});

    await new LegacySesTransport().send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 7,
        to: "to@x.com",
        from: "hello@example.com",
      }),
    );
  });
});
