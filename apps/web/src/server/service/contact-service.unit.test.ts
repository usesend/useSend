import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockWebhookEmit,
  mockSendDoubleOptInConfirmationEmail,
  mockAddBulkContactJobs,
  mockLogger,
} = vi.hoisted(() => ({
  mockDb: {
    contactBook: {
      findUnique: vi.fn(),
    },
    contact: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  mockWebhookEmit: vi.fn(),
  mockSendDoubleOptInConfirmationEmail: vi.fn(),
  mockAddBulkContactJobs: vi.fn(),
  mockLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/service/webhook-service", () => ({
  WebhookService: {
    emit: mockWebhookEmit,
  },
}));

vi.mock("~/server/service/double-opt-in-service", () => ({
  sendDoubleOptInConfirmationEmail: mockSendDoubleOptInConfirmationEmail,
}));

vi.mock("~/server/service/contact-queue-service", () => ({
  ContactQueueService: {
    addBulkContactJobs: mockAddBulkContactJobs,
  },
}));

vi.mock("~/server/logger/log", () => ({
  logger: mockLogger,
}));

import { addOrUpdateContact } from "~/server/service/contact-service";

const createdAt = new Date("2026-02-08T00:00:00.000Z");

describe("contact-service addOrUpdateContact", () => {
  beforeEach(() => {
    mockDb.contactBook.findUnique.mockReset();
    mockDb.contact.findUnique.mockReset();
    mockDb.contact.upsert.mockReset();
    mockWebhookEmit.mockReset();
    mockSendDoubleOptInConfirmationEmail.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
  });

  it("creates pending contacts and sends double opt-in confirmation", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({
      doubleOptInEnabled: true,
      teamId: 7,
    });
    mockDb.contact.findUnique.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      contactBookId: "book_1",
      subscribed: false,
      properties: {},
      firstName: "Alice",
      lastName: "Smith",
      createdAt,
      updatedAt: createdAt,
    });

    await addOrUpdateContact("book_1", { email: "alice@example.com" }, 7);

    const upsertArgs = mockDb.contact.upsert.mock.calls[0]?.[0];
    expect(upsertArgs.create.subscribed).toBe(false);
    expect(upsertArgs.create.unsubscribeReason).toBeNull();
    expect(mockSendDoubleOptInConfirmationEmail).toHaveBeenCalledWith({
      contactId: "contact_1",
      contactBookId: "book_1",
      teamId: 7,
    });
    expect(mockWebhookEmit).toHaveBeenCalledWith(
      7,
      "contact.created",
      expect.objectContaining({
        id: "contact_1",
        subscribed: false,
      }),
    );
  });

  it("creates subscribed contacts immediately when double opt-in is disabled", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({
      doubleOptInEnabled: false,
      teamId: 7,
    });
    mockDb.contact.findUnique.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      contactBookId: "book_1",
      subscribed: true,
      properties: {},
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    });

    await addOrUpdateContact("book_1", { email: "alice@example.com" }, 7);

    const upsertArgs = mockDb.contact.upsert.mock.calls[0]?.[0];
    expect(upsertArgs.create.subscribed).toBe(true);
    expect(upsertArgs.create.unsubscribeReason).toBeNull();
    expect(mockSendDoubleOptInConfirmationEmail).not.toHaveBeenCalled();
  });

  it("stores unsubscribe reason when creating unsubscribed contacts", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({
      doubleOptInEnabled: false,
      teamId: 7,
    });
    mockDb.contact.findUnique.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({
      id: "contact_3",
      email: "carol@example.com",
      contactBookId: "book_1",
      subscribed: false,
      properties: {},
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    });

    await addOrUpdateContact(
      "book_1",
      { email: "carol@example.com", subscribed: false },
      7,
    );

    const upsertArgs = mockDb.contact.upsert.mock.calls[0]?.[0];
    expect(upsertArgs.create).toMatchObject({
      subscribed: false,
      unsubscribeReason: "UNSUBSCRIBED",
    });
  });

  it("does not re-subscribe contacts that already unsubscribed", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({
      doubleOptInEnabled: true,
      teamId: 7,
    });
    mockDb.contact.findUnique.mockResolvedValue({
      subscribed: false,
      unsubscribeReason: "manual",
    });
    mockDb.contact.upsert.mockResolvedValue({
      id: "contact_2",
      email: "bob@example.com",
      contactBookId: "book_1",
      subscribed: false,
      properties: {},
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    });

    await addOrUpdateContact(
      "book_1",
      { email: "bob@example.com", subscribed: true },
      7,
    );

    const upsertArgs = mockDb.contact.upsert.mock.calls[0]?.[0];
    expect(upsertArgs.update).not.toHaveProperty("subscribed");
    expect(mockSendDoubleOptInConfirmationEmail).not.toHaveBeenCalled();
    expect(mockWebhookEmit).toHaveBeenCalledWith(
      7,
      "contact.updated",
      expect.objectContaining({ id: "contact_2" }),
    );
  });

  it("throws when contact book does not exist", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue(null);

    await expect(
      addOrUpdateContact("missing-book", { email: "alice@example.com" }, 7),
    ).rejects.toThrow("Contact book not found");
    expect(mockDb.contact.upsert).not.toHaveBeenCalled();
  });

  it("persists contact when double opt-in email send fails", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({
      doubleOptInEnabled: true,
      teamId: 7,
    });
    mockDb.contact.findUnique.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({
      id: "contact_4",
      email: "dana@example.com",
      contactBookId: "book_1",
      subscribed: false,
      properties: {},
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    });
    mockSendDoubleOptInConfirmationEmail.mockRejectedValue(
      new Error("send failed"),
    );

    await expect(
      addOrUpdateContact("book_1", { email: "dana@example.com" }, 7),
    ).resolves.toMatchObject({
      id: "contact_4",
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact_4",
        contactBookId: "book_1",
        teamId: 7,
      }),
      "[ContactService]: Failed to send double opt-in confirmation email",
    );
  });
});
