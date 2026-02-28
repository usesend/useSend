import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockSendEmail,
  mockRendererRender,
  mockLogger,
  mockValidateDomainFromEmail,
} = vi.hoisted(() => ({
  mockDb: {
    contact: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    domain: {
      findFirst: vi.fn(),
    },
  },
  mockSendEmail: vi.fn(),
  mockRendererRender: vi.fn(),
  mockLogger: {
    error: vi.fn(),
  },
  mockValidateDomainFromEmail: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/service/email-service", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("~/server/logger/log", () => ({
  logger: mockLogger,
}));

vi.mock("~/server/service/domain-service", () => ({
  validateDomainFromEmail: mockValidateDomainFromEmail,
}));

vi.mock("@usesend/email-editor/src/renderer", () => ({
  EmailRenderer: vi.fn().mockImplementation(() => ({
    render: mockRendererRender,
  })),
}));

import {
  confirmDoubleOptInSubscription,
  sendDoubleOptInConfirmationEmail,
} from "~/server/service/double-opt-in-service";

function getHash(contactId: string, expiresAt: number) {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return createHash("sha256")
    .update(`${contactId}-${expiresAt}-${secret}`)
    .digest("hex");
}

describe("double-opt-in-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T00:00:00.000Z"));

    mockDb.contact.findUnique.mockReset();
    mockDb.contact.update.mockReset();
    mockDb.domain.findFirst.mockReset();
    mockSendEmail.mockReset();
    mockRendererRender.mockReset();
    mockLogger.error.mockReset();
    mockValidateDomainFromEmail.mockReset();
    mockValidateDomainFromEmail.mockResolvedValue({
      id: 1,
      name: "example.com",
      status: "SUCCESS",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips sending when double opt-in is disabled", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      contactBookId: "book_1",
      contactBook: {
        id: "book_1",
        name: "Newsletter",
        doubleOptInEnabled: false,
        doubleOptInFrom: null,
        doubleOptInSubject: null,
        doubleOptInContent: null,
      },
    });

    await sendDoubleOptInConfirmationEmail({
      contactId: "contact_1",
      contactBookId: "book_1",
      teamId: 7,
    });

    expect(mockDb.domain.findFirst).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("throws when no verified domain exists", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      contactBookId: "book_1",
      contactBook: {
        id: "book_1",
        name: "Newsletter",
        doubleOptInEnabled: true,
        doubleOptInFrom: null,
        doubleOptInSubject: "Confirm {{firstName}}",
        doubleOptInContent: JSON.stringify({ type: "doc", content: [] }),
      },
    });
    mockDb.domain.findFirst.mockResolvedValue(null);

    await expect(
      sendDoubleOptInConfirmationEmail({
        contactId: "contact_1",
        contactBookId: "book_1",
        teamId: 7,
      }),
    ).rejects.toThrow(
      "Double opt-in requires at least one verified domain to send confirmation emails",
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends rendered confirmation email with template variables", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      contactBookId: "book_1",
      contactBook: {
        id: "book_1",
        name: "Newsletter",
        doubleOptInEnabled: true,
        doubleOptInFrom: null,
        doubleOptInSubject: "Confirm {{firstName}}",
        doubleOptInContent: JSON.stringify({ type: "doc", content: [] }),
      },
    });
    mockDb.domain.findFirst.mockResolvedValue({ name: "example.com" });
    mockRendererRender.mockResolvedValue(
      '<p>Click <a href="{{doubleOptInUrl}}">confirm</a></p>',
    );

    await sendDoubleOptInConfirmationEmail({
      contactId: "contact_1",
      contactBookId: "book_1",
      teamId: 7,
    });

    const sendArgs = mockSendEmail.mock.calls[0]?.[0];
    expect(sendArgs.from).toBe("hello@example.com");
    expect(sendArgs.subject).toBe("Confirm Alice");
    expect(sendArgs.html).toContain("contactId=contact_1");
    expect(sendArgs.html).not.toContain("{{doubleOptInUrl}}");
    expect(sendArgs.teamId).toBe(7);
  });

  it("falls back to plain HTML when template rendering fails", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      contactBookId: "book_1",
      contactBook: {
        id: "book_1",
        name: "Newsletter",
        doubleOptInEnabled: true,
        doubleOptInFrom: null,
        doubleOptInSubject: "Confirm {{firstName}}",
        doubleOptInContent: JSON.stringify({ type: "doc", content: [] }),
      },
    });
    mockDb.domain.findFirst.mockResolvedValue({ name: "example.com" });
    mockRendererRender.mockRejectedValue(new Error("render failed"));

    await sendDoubleOptInConfirmationEmail({
      contactId: "contact_1",
      contactBookId: "book_1",
      teamId: 7,
    });

    const sendArgs = mockSendEmail.mock.calls[0]?.[0];
    expect(sendArgs.html).toContain("Please confirm your subscription");
    expect(sendArgs.html).toContain("contactId=contact_1");
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("replaces empty template variables instead of leaving tokens", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      firstName: null,
      lastName: null,
      contactBookId: "book_1",
      contactBook: {
        id: "book_1",
        name: "Newsletter",
        doubleOptInEnabled: true,
        doubleOptInFrom: null,
        doubleOptInSubject: "Confirm {{firstName}}",
        doubleOptInContent: JSON.stringify({ type: "doc", content: [] }),
      },
    });
    mockDb.domain.findFirst.mockResolvedValue({ name: "example.com" });
    mockRendererRender.mockResolvedValue("<p>Test</p>");

    await sendDoubleOptInConfirmationEmail({
      contactId: "contact_1",
      contactBookId: "book_1",
      teamId: 7,
    });

    const sendArgs = mockSendEmail.mock.calls[0]?.[0];
    expect(sendArgs.subject).toBe("Confirm ");
  });

  it("uses configured double opt-in from address when present", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      contactBookId: "book_1",
      contactBook: {
        id: "book_1",
        name: "Newsletter",
        doubleOptInEnabled: true,
        doubleOptInFrom: "Newsletter <hello@example.com>",
        doubleOptInSubject: "Confirm {{firstName}}",
        doubleOptInContent: JSON.stringify({ type: "doc", content: [] }),
      },
    });
    mockRendererRender.mockResolvedValue("<p>Test</p>");

    await sendDoubleOptInConfirmationEmail({
      contactId: "contact_1",
      contactBookId: "book_1",
      teamId: 7,
    });

    expect(mockDb.domain.findFirst).not.toHaveBeenCalled();
    expect(mockValidateDomainFromEmail).toHaveBeenCalledWith(
      "Newsletter <hello@example.com>",
      7,
    );
    const sendArgs = mockSendEmail.mock.calls[0]?.[0];
    expect(sendArgs.from).toBe("Newsletter <hello@example.com>");
  });

  it("rejects invalid confirmation links", async () => {
    await expect(
      confirmDoubleOptInSubscription({
        contactId: "contact_1",
        expiresAt: "not-a-number",
        hash: "abc",
      }),
    ).rejects.toThrow("Invalid confirmation link");
  });

  it("rejects expired confirmation links", async () => {
    await expect(
      confirmDoubleOptInSubscription({
        contactId: "contact_1",
        expiresAt: String(Date.now() - 1),
        hash: "abc",
      }),
    ).rejects.toThrow("Confirmation link has expired");
  });

  it("rejects links with invalid signatures", async () => {
    await expect(
      confirmDoubleOptInSubscription({
        contactId: "contact_1",
        expiresAt: String(Date.now() + 60_000),
        hash: "invalid-hash",
      }),
    ).rejects.toThrow("Invalid confirmation link");
  });

  it("returns existing contact when already subscribed", async () => {
    const expiresAt = Date.now() + 60_000;
    const contact = {
      id: "contact_1",
      email: "alice@example.com",
      subscribed: true,
    };

    mockDb.contact.findUnique.mockResolvedValue(contact);

    const result = await confirmDoubleOptInSubscription({
      contactId: "contact_1",
      expiresAt: String(expiresAt),
      hash: getHash("contact_1", expiresAt),
    });

    expect(result).toBe(contact);
    expect(mockDb.contact.update).not.toHaveBeenCalled();
  });

  it("does not re-subscribe contacts with explicit unsubscribe reasons", async () => {
    const expiresAt = Date.now() + 60_000;
    const contact = {
      id: "contact_1",
      email: "alice@example.com",
      subscribed: false,
      unsubscribeReason: "UNSUBSCRIBED",
    };

    mockDb.contact.findUnique.mockResolvedValue(contact);

    const result = await confirmDoubleOptInSubscription({
      contactId: "contact_1",
      expiresAt: String(expiresAt),
      hash: getHash("contact_1", expiresAt),
    });

    expect(result).toBe(contact);
    expect(mockDb.contact.update).not.toHaveBeenCalled();
  });

  it("activates pending contacts with a valid link", async () => {
    const expiresAt = Date.now() + 60_000;

    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      subscribed: false,
    });
    mockDb.contact.update.mockResolvedValue({
      id: "contact_1",
      subscribed: true,
      unsubscribeReason: null,
    });

    const result = await confirmDoubleOptInSubscription({
      contactId: "contact_1",
      expiresAt: String(expiresAt),
      hash: getHash("contact_1", expiresAt),
    });

    expect(mockDb.contact.update).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: {
        subscribed: true,
        unsubscribeReason: null,
      },
    });
    expect(result).toMatchObject({
      id: "contact_1",
      subscribed: true,
    });
  });
});
