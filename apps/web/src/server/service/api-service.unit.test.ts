import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    apiKey: {
      findUnique: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

import { createSecureHash } from "~/server/crypto";
import { getTeamAndApiKey } from "~/server/service/api-service";

describe("getTeamAndApiKey", () => {
  beforeEach(() => {
    mockDb.apiKey.findUnique.mockReset();
    mockDb.team.findUnique.mockReset();
  });

  it("returns null without querying the database when the token has no client id", async () => {
    const result = await getTeamAndApiKey("not-a-usesend-token");

    expect(result).toBeNull();
    expect(mockDb.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("returns null without querying the database when the token has no secret", async () => {
    const result = await getTeamAndApiKey("us_onlyclientid");

    expect(result).toBeNull();
    expect(mockDb.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("returns null without querying the database when the client id is empty", async () => {
    const result = await getTeamAndApiKey("us__secret");

    expect(result).toBeNull();
    expect(mockDb.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("looks up the client id for an unknown but well-formed key", async () => {
    mockDb.apiKey.findUnique.mockResolvedValue(null);

    const result = await getTeamAndApiKey(`us_unknownclient_${"a".repeat(32)}`);

    expect(result).toBeNull();
    expect(mockDb.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "unknownclient" } }),
    );
    expect(mockDb.team.findUnique).not.toHaveBeenCalled();
  });

  it("returns the team for a well-formed key that matches", async () => {
    const token = "b".repeat(32);
    const tokenHash = await createSecureHash(token);
    const apiKeyRow = { id: 7, teamId: 3, tokenHash, domainId: null };
    mockDb.apiKey.findUnique.mockResolvedValue(apiKeyRow);
    mockDb.team.findUnique.mockResolvedValue({ id: 3 });

    const result = await getTeamAndApiKey(`us_matchclient_${token}`);

    expect(mockDb.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "matchclient" } }),
    );
    expect(result).toEqual({ team: { id: 3 }, apiKey: apiKeyRow });
  });
});
