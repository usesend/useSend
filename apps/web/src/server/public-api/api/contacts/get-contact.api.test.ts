import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTeamFromToken, mockRedis, mockDb } = vi.hoisted(() => ({
  mockGetTeamFromToken: vi.fn(),
  mockRedis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  mockDb: {
    contactBook: {
      findUnique: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("~/server/public-api/auth", () => ({
  getTeamFromToken: mockGetTeamFromToken,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

import { getApp } from "~/server/public-api/hono";
import getContact from "~/server/public-api/api/contacts/get-contact";

describe("GET /v1/contactBooks/{contactBookId}/contacts/{contactId}", () => {
  beforeEach(() => {
    mockGetTeamFromToken.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
    mockRedis.ttl.mockReset();
    mockDb.contactBook.findUnique.mockReset();
    mockDb.contact.findFirst.mockReset();

    mockGetTeamFromToken.mockResolvedValue({
      id: 1,
      apiRateLimit: 20,
      apiKeyId: 11,
      apiKey: { domainId: null },
    });

    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(1);

    mockDb.contactBook.findUnique.mockResolvedValue({
      id: "cb_team_1",
      teamId: 1,
    });
  });

  it("does not return a contact outside the requested contact book", async () => {
    mockDb.contact.findFirst.mockResolvedValue(null);

    const app = getApp();
    getContact(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_team_1/contacts/contact_other_team",
      {
        headers: {
          Authorization: "Bearer test-key",
        },
      },
    );

    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "NOT_FOUND",
      },
    });

    expect(mockDb.contact.findFirst).toHaveBeenCalledWith({
      where: {
        id: "contact_other_team",
        contactBookId: "cb_team_1",
      },
    });
  });
});
