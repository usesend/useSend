import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockListFeedback } = vi.hoisted(() => ({
  mockEnv: { ADMIN_API_TOKEN: undefined as string | undefined },
  mockListFeedback: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/service/feedback-admin", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/server/service/feedback-admin")>();
  return { ...actual, listFeedback: mockListFeedback };
});
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/mailer", () => ({
  MailNotSentError: class extends Error {},
  sendFeedbackReply: vi.fn(),
  sendFeedbackNotification: vi.fn(),
}));

import { GET } from "~/app/api/admin/feedback/route";

const TOKEN = "t".repeat(40);
const request = (auth?: string, query = "") =>
  new Request(`http://localhost/api/admin/feedback${query}`, {
    headers: auth ? { authorization: auth } : {},
  });

describe("GET /api/admin/feedback", () => {
  beforeEach(() => {
    mockEnv.ADMIN_API_TOKEN = TOKEN;
    mockListFeedback.mockReset();
    mockListFeedback.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("doesn't exist when no admin token is configured", async () => {
    mockEnv.ADMIN_API_TOKEN = undefined;
    const response = await GET(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(404);
    expect(mockListFeedback).not.toHaveBeenCalled();
  });

  it("refuses a wrong token", async () => {
    const response = await GET(request("Bearer wrong-token"));
    expect(response.status).toBe(401);
    expect(mockListFeedback).not.toHaveBeenCalled();
  });

  it("lists feedback with the right token", async () => {
    const response = await GET(
      request(`Bearer ${TOKEN}`, "?status=OPEN&limit=5"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockListFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OPEN", limit: 5 }),
    );
  });

  it("answers 400 for a bad query", async () => {
    const response = await GET(request(`Bearer ${TOKEN}`, "?limit=900"));
    expect(response.status).toBe(400);
  });
});
