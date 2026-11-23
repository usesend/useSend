import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTeamUsers, mockSendMail, mockLogger } = vi.hoisted(() => ({
  mockGetTeamUsers: vi.fn(),
  mockSendMail: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));
vi.mock("~/server/mailer", () => ({ sendMail: mockSendMail }));
vi.mock("~/server/service/team-service", () => ({
  TeamService: { getTeamUsers: mockGetTeamUsers },
}));

import { emailTeam } from "~/server/service/team-email";

beforeEach(() => vi.clearAllMocks());

describe("emailTeam", () => {
  it("emails every member", async () => {
    mockGetTeamUsers.mockResolvedValue([
      { user: { email: "a@acme.com" } },
      { user: { email: "b@acme.com" } },
      { user: null },
    ]);
    await emailTeam(7, "Subject", "Body");
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it("never throws, even if the members can't be read", async () => {
    mockGetTeamUsers.mockRejectedValue(new Error("db down"));
    await expect(emailTeam(7, "Subject", "Body")).resolves.toBeUndefined();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
