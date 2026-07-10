import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canRegisterSelfHostedUser,
  getTeamInviteExpiry,
  normalizeAuthEmail,
} from "./registration-policy";

const client = {
  user: {
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  teamInvite: {
    findFirst: vi.fn(),
  },
};

describe("self-hosted registration policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.user.findFirst.mockResolvedValue(null);
    client.user.count.mockResolvedValue(1);
    client.teamInvite.findFirst.mockResolvedValue(null);
  });

  it("always permits an existing user to log in", async () => {
    client.user.findFirst.mockResolvedValue({ id: 42 });

    await expect(
      canRegisterSelfHostedUser(client as never, " Existing@Example.com "),
    ).resolves.toBe(true);

    expect(client.user.count).not.toHaveBeenCalled();
  });

  it("permits the first user on a fresh installation", async () => {
    client.user.count.mockResolvedValue(0);

    await expect(
      canRegisterSelfHostedUser(client as never, "owner@example.com"),
    ).resolves.toBe(true);

    expect(client.teamInvite.findFirst).not.toHaveBeenCalled();
  });

  it("permits a new user with an unexpired matching invitation", async () => {
    client.teamInvite.findFirst.mockResolvedValue({ id: "invite_1" });

    await expect(
      canRegisterSelfHostedUser(client as never, "MEMBER@example.com"),
    ).resolves.toBe(true);

    expect(client.teamInvite.findFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: "member@example.com", mode: "insensitive" },
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
  });

  it("rejects an uninvited new user after bootstrap", async () => {
    await expect(
      canRegisterSelfHostedUser(client as never, "stranger@example.com"),
    ).resolves.toBe(false);
  });

  it("normalizes emails and gives invitations a seven-day lifetime", () => {
    const now = new Date("2026-07-11T00:00:00.000Z");

    expect(normalizeAuthEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(getTeamInviteExpiry(now)).toEqual(
      new Date("2026-07-18T00:00:00.000Z"),
    );
  });
});
