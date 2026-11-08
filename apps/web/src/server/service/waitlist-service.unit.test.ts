import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    waitlistApplication: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));

import {
  normalizeWebsite,
  waitlistSubmissionSchema,
} from "~/app/wait-list/schema";
import { WaitlistService } from "~/server/service/waitlist-service";

const validInput = {
  website: "www.Acme.com/about",
  emailTypes: ["transactional" as const],
  emailVolume: "About 500 a day",
  listSource: "People sign up for our app",
  description: "Password resets and receipts for our app",
};

describe("waitlist applications", () => {
  beforeEach(() => {
    mockDb.waitlistApplication.upsert.mockReset();
    mockDb.waitlistApplication.updateMany.mockReset();
  });

  it("normalizes websites and rejects junk", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com/");
    expect(normalizeWebsite("http://acme.com/x")).toBe("http://acme.com/x");
    expect(normalizeWebsite("localhost")).toBeNull();
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
  });

  it("requires a website and where the list comes from", () => {
    const result = waitlistSubmissionSchema.safeParse({
      ...validInput,
      website: "",
      listSource: "",
    });
    expect(result.success).toBe(false);
    const fields = result.success
      ? []
      : result.error.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["website", "listSource"]));
  });

  it("saves the application and puts a resubmission back in review", async () => {
    const input = waitlistSubmissionSchema.parse(validInput);

    await WaitlistService.saveApplication(
      { id: 7, email: "founder@acme.com" },
      input,
    );

    const call = mockDb.waitlistApplication.upsert.mock.calls[0]?.[0];
    expect(call.where).toEqual({ userId: 7 });
    expect(call.create).toMatchObject({
      userId: 7,
      email: "founder@acme.com",
      website: "https://www.acme.com/about",
      domain: "acme.com",
      listSource: "People sign up for our app",
      status: "PENDING",
    });
    expect(call.update).toMatchObject({ status: "PENDING", reviewedAt: null });
  });

  it("records the review outcome", async () => {
    await WaitlistService.setStatus(7, "APPROVED");

    expect(mockDb.waitlistApplication.updateMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      data: { status: "APPROVED", reviewedAt: expect.any(Date) },
    });
  });
});
