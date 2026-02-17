import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DOUBLE_OPT_IN_CONTENT,
  DEFAULT_DOUBLE_OPT_IN_SUBJECT,
} from "~/lib/constants/double-opt-in";

const { mockDb, mockCheckContactBookLimit } = vi.hoisted(() => ({
  mockDb: {
    contactBook: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    contact: {
      count: vi.fn(),
    },
    campaign: {
      findMany: vi.fn(),
    },
  },
  mockCheckContactBookLimit: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/service/limit-service", () => ({
  LimitService: {
    checkContactBookLimit: mockCheckContactBookLimit,
  },
}));

import {
  createContactBook,
  getContactBooks,
  updateContactBook,
} from "~/server/service/contact-book-service";

describe("contact-book-service", () => {
  beforeEach(() => {
    mockCheckContactBookLimit.mockReset();
    mockDb.contactBook.create.mockReset();
    mockDb.contactBook.findMany.mockReset();
    mockDb.contactBook.update.mockReset();
    mockDb.contactBook.findUnique.mockReset();
  });

  it("returns double opt-in content in contact book listings", async () => {
    mockDb.contactBook.findMany.mockResolvedValue([]);

    await getContactBooks(12);

    expect(mockDb.contactBook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          doubleOptInContent: true,
        }),
      }),
    );
  });

  it("creates contact books with double opt-in defaults", async () => {
    mockCheckContactBookLimit.mockResolvedValue({
      isLimitReached: false,
      reason: null,
    });
    mockDb.contactBook.create.mockResolvedValue({ id: "book_1" });

    await createContactBook(12, "Newsletter");

    expect(mockDb.contactBook.create).toHaveBeenCalledWith({
      data: {
        name: "Newsletter",
        teamId: 12,
        properties: {},
        doubleOptInEnabled: true,
        doubleOptInSubject: DEFAULT_DOUBLE_OPT_IN_SUBJECT,
        doubleOptInContent: DEFAULT_DOUBLE_OPT_IN_CONTENT,
      },
    });
  });

  it("throws when the contact book limit is reached", async () => {
    mockCheckContactBookLimit.mockResolvedValue({
      isLimitReached: true,
      reason: "limit reached",
    });

    await expect(createContactBook(12, "Newsletter")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "limit reached",
    });
    expect(mockDb.contactBook.create).not.toHaveBeenCalled();
  });

  it("normalizes empty double opt-in content to defaults", async () => {
    mockDb.contactBook.update.mockResolvedValue({ id: "book_1" });

    await updateContactBook("book_1", {
      doubleOptInContent: "   ",
    });

    expect(mockDb.contactBook.update).toHaveBeenCalledWith({
      where: { id: "book_1" },
      data: {
        doubleOptInContent: DEFAULT_DOUBLE_OPT_IN_CONTENT,
      },
    });
  });

  it("backfills default subject and content when enabling double opt-in", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({
      doubleOptInSubject: null,
      doubleOptInContent: null,
    });
    mockDb.contactBook.update.mockResolvedValue({ id: "book_1" });

    await updateContactBook("book_1", {
      doubleOptInEnabled: true,
    });

    expect(mockDb.contactBook.update).toHaveBeenCalledWith({
      where: { id: "book_1" },
      data: {
        doubleOptInEnabled: true,
        doubleOptInSubject: DEFAULT_DOUBLE_OPT_IN_SUBJECT,
        doubleOptInContent: DEFAULT_DOUBLE_OPT_IN_CONTENT,
      },
    });
  });
});
