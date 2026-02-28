import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnsendApiError } from "~/server/public-api/api-error";

const { mockGetTeamFromToken, mockRedis, mockDb, mockUpdateContactBook } =
  vi.hoisted(() => ({
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
    },
    mockUpdateContactBook: vi.fn(),
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

vi.mock("~/server/service/contact-book-service", () => ({
  updateContactBook: mockUpdateContactBook,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

import { getApp } from "~/server/public-api/hono";
import updateContactBookRoute from "~/server/public-api/api/contacts/update-contact-book";

function buildContactBook(overrides?: Record<string, unknown>) {
  return {
    id: "cb_1",
    name: "Newsletter",
    teamId: 1,
    properties: {},
    emoji: "📙",
    doubleOptInEnabled: true,
    doubleOptInFrom: null,
    doubleOptInSubject: "Please confirm your subscription",
    doubleOptInContent: '{"type":"doc"}',
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("PATCH /v1/contactBooks/{contactBookId}", () => {
  beforeEach(() => {
    mockGetTeamFromToken.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
    mockRedis.ttl.mockReset();
    mockDb.contactBook.findUnique.mockReset();
    mockUpdateContactBook.mockReset();

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
      id: "cb_1",
      teamId: 1,
    });
  });

  it("updates contact book name", async () => {
    mockUpdateContactBook.mockResolvedValue(
      buildContactBook({
        name: "Leads",
      }),
    );

    const app = getApp();
    updateContactBookRoute(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_1",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Leads",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockDb.contactBook.findUnique).toHaveBeenCalledWith({
      where: { id: "cb_1", teamId: 1 },
    });
    expect(mockUpdateContactBook).toHaveBeenCalledWith("cb_1", {
      name: "Leads",
    });

    const body = await response.json();
    expect(body).toMatchObject({
      id: "cb_1",
      name: "Leads",
      properties: {},
    });
  });

  it("updates double opt-in optional fields", async () => {
    mockUpdateContactBook.mockResolvedValue(
      buildContactBook({
        doubleOptInEnabled: false,
        doubleOptInFrom: "Marketing <hello@example.com>",
        doubleOptInSubject: "Confirm your subscription",
        doubleOptInContent: '{"type":"doc","content":[]}',
      }),
    );

    const app = getApp();
    updateContactBookRoute(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_1",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doubleOptInEnabled: false,
          doubleOptInFrom: "Marketing <hello@example.com>",
          doubleOptInSubject: "Confirm your subscription",
          doubleOptInContent: '{"type":"doc","content":[]}',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockUpdateContactBook).toHaveBeenCalledWith("cb_1", {
      doubleOptInEnabled: false,
      doubleOptInFrom: "Marketing <hello@example.com>",
      doubleOptInSubject: "Confirm your subscription",
      doubleOptInContent: '{"type":"doc","content":[]}',
    });
  });

  it("allows empty JSON body and forwards no-op update", async () => {
    mockUpdateContactBook.mockResolvedValue(buildContactBook());

    const app = getApp();
    updateContactBookRoute(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_1",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(200);
    expect(mockUpdateContactBook).toHaveBeenCalledWith("cb_1", {});
  });

  it("returns NOT_FOUND when contact book is outside team scope", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue(null);

    const app = getApp();
    updateContactBookRoute(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_not_mine",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Should fail",
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(mockUpdateContactBook).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Contact book not found for this team",
      },
    });
  });

  it("returns BAD_REQUEST when name is empty", async () => {
    const app = getApp();
    updateContactBookRoute(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_1",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(mockUpdateContactBook).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        name: "ZodError",
        issues: [
          expect.objectContaining({
            path: ["name"],
          }),
        ],
      },
    });
  });

  it("returns service errors from update", async () => {
    mockUpdateContactBook.mockRejectedValue(
      new UnsendApiError({
        code: "BAD_REQUEST",
        message:
          "Double opt-in email content must include the {{doubleOptInUrl}} placeholder",
      }),
    );

    const app = getApp();
    updateContactBookRoute(app);

    const response = await app.request(
      "http://localhost/api/v1/contactBooks/cb_1",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doubleOptInContent: '{"type":"doc","content":[]}',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(mockUpdateContactBook).toHaveBeenCalledTimes(1);

    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message:
          "Double opt-in email content must include the {{doubleOptInUrl}} placeholder",
      },
    });
  });
});
