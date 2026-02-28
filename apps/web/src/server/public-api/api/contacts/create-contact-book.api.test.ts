import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnsendApiError } from "~/server/public-api/api-error";

const {
  mockGetTeamFromToken,
  mockRedis,
  mockDb,
  mockCreateContactBook,
  mockUpdateContactBook,
  mockTransactionClient,
} = vi.hoisted(() => ({
  mockGetTeamFromToken: vi.fn(),
  mockRedis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  mockDb: {
    $transaction: vi.fn(),
  },
  mockCreateContactBook: vi.fn(),
  mockUpdateContactBook: vi.fn(),
  mockTransactionClient: {
    contactBook: {},
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

vi.mock("~/server/service/contact-book-service", () => ({
  createContactBook: mockCreateContactBook,
  updateContactBook: mockUpdateContactBook,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

import { getApp } from "~/server/public-api/hono";
import createContactBookRoute from "~/server/public-api/api/contacts/create-contact-book";

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

describe("POST /v1/contactBooks", () => {
  beforeEach(() => {
    mockGetTeamFromToken.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
    mockRedis.ttl.mockReset();
    mockDb.$transaction.mockReset();
    mockCreateContactBook.mockReset();
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

    mockDb.$transaction.mockImplementation(async (callback: any) =>
      callback(mockTransactionClient),
    );
  });

  it("creates a contact book with only the required name", async () => {
    const created = buildContactBook();
    mockCreateContactBook.mockResolvedValue(created);

    const app = getApp();
    createContactBookRoute(app);

    const response = await app.request("http://localhost/api/v1/contactBooks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Newsletter",
      }),
    });

    expect(response.status).toBe(200);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockCreateContactBook).toHaveBeenCalledWith(
      1,
      "Newsletter",
      mockTransactionClient,
    );
    expect(mockUpdateContactBook).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toMatchObject({
      id: "cb_1",
      name: "Newsletter",
      properties: {},
      teamId: 1,
    });
  });

  it("applies optional fields via update inside the same transaction", async () => {
    const created = buildContactBook({ id: "cb_2", name: "Product Updates" });
    const updated = buildContactBook({
      id: "cb_2",
      name: "Product Updates",
      emoji: "📬",
      properties: { tier: "gold" },
      doubleOptInEnabled: false,
      doubleOptInFrom: "Marketing <hello@example.com>",
      doubleOptInSubject: "Confirm your subscription",
      doubleOptInContent: '{"type":"doc","content":[]}',
    });

    mockCreateContactBook.mockResolvedValue(created);
    mockUpdateContactBook.mockResolvedValue(updated);

    const app = getApp();
    createContactBookRoute(app);

    const response = await app.request("http://localhost/api/v1/contactBooks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Product Updates",
        emoji: "📬",
        properties: { tier: "gold" },
        doubleOptInEnabled: false,
        doubleOptInFrom: "Marketing <hello@example.com>",
        doubleOptInSubject: "Confirm your subscription",
        doubleOptInContent: '{"type":"doc","content":[]}',
      }),
    });

    expect(response.status).toBe(200);
    expect(mockCreateContactBook).toHaveBeenCalledWith(
      1,
      "Product Updates",
      mockTransactionClient,
    );
    expect(mockUpdateContactBook).toHaveBeenCalledWith(
      "cb_2",
      {
        emoji: "📬",
        properties: { tier: "gold" },
        doubleOptInEnabled: false,
        doubleOptInFrom: "Marketing <hello@example.com>",
        doubleOptInSubject: "Confirm your subscription",
        doubleOptInContent: '{"type":"doc","content":[]}',
      },
      mockTransactionClient,
    );

    const body = await response.json();
    expect(body).toMatchObject({
      id: "cb_2",
      doubleOptInEnabled: false,
      doubleOptInFrom: "Marketing <hello@example.com>",
      properties: { tier: "gold" },
    });
  });

  it("treats null doubleOptInFrom as an explicit optional update", async () => {
    const created = buildContactBook({ id: "cb_3" });
    const updated = buildContactBook({ id: "cb_3", doubleOptInFrom: null });
    mockCreateContactBook.mockResolvedValue(created);
    mockUpdateContactBook.mockResolvedValue(updated);

    const app = getApp();
    createContactBookRoute(app);

    const response = await app.request("http://localhost/api/v1/contactBooks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Announcements",
        doubleOptInFrom: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(mockUpdateContactBook).toHaveBeenCalledWith(
      "cb_3",
      expect.objectContaining({
        doubleOptInFrom: null,
      }),
      mockTransactionClient,
    );
  });

  it("returns BAD_REQUEST when name is missing", async () => {
    const app = getApp();
    createContactBookRoute(app);

    const response = await app.request("http://localhost/api/v1/contactBooks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emoji: "📬",
      }),
    });

    expect(response.status).toBe(400);
    expect(mockCreateContactBook).not.toHaveBeenCalled();

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

  it("returns BAD_REQUEST when name is empty", async () => {
    const app = getApp();
    createContactBookRoute(app);

    const response = await app.request("http://localhost/api/v1/contactBooks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "",
      }),
    });

    expect(response.status).toBe(400);
    expect(mockCreateContactBook).not.toHaveBeenCalled();

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

  it("returns service-level errors from optional field updates", async () => {
    mockCreateContactBook.mockResolvedValue(buildContactBook({ id: "cb_4" }));
    mockUpdateContactBook.mockRejectedValue(
      new UnsendApiError({
        code: "BAD_REQUEST",
        message: "doubleOptInFrom must use a verified domain",
      }),
    );

    const app = getApp();
    createContactBookRoute(app);

    const response = await app.request("http://localhost/api/v1/contactBooks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Announcements",
        doubleOptInFrom: "News <hello@unverified.example>",
      }),
    });

    expect(response.status).toBe(400);
    expect(mockCreateContactBook).toHaveBeenCalledTimes(1);
    expect(mockUpdateContactBook).toHaveBeenCalledTimes(1);

    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "doubleOptInFrom must use a verified domain",
      },
    });
  });
});
