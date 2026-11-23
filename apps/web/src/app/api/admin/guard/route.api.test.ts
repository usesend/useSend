import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mocks } = vi.hoisted(() => ({
  mockEnv: { ADMIN_API_TOKEN: undefined as string | undefined },
  mocks: {
    listApplications: vi.fn(),
    recordApplicationVerdict: vi.fn(),
    listActiveCampaigns: vi.fn(),
    markGuardSeen: vi.fn(),
    guardReviewCampaign: vi.fn(),
    listWatchedTeams: vi.fn(),
    sampleTeamEmails: vi.fn(),
    recordTeamAction: vi.fn(),
  },
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/service/team-service", () => ({ TeamService: {} }));
vi.mock("~/server/service/guard-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/server/service/guard-service")>();
  const { guardReviewCampaign: _skip, ...guardMocks } = mocks;
  return { ...actual, ...guardMocks };
});
vi.mock("~/server/service/campaign-service", () => ({
  guardReviewCampaign: mocks.guardReviewCampaign,
}));

import { GET as getApplications } from "~/app/api/admin/guard/applications/route";
import { POST as postVerdict } from "~/app/api/admin/guard/applications/[id]/verdict/route";
import { GET as getCampaigns } from "~/app/api/admin/guard/campaigns/route";
import { POST as postReview } from "~/app/api/admin/guard/campaigns/[id]/review/route";
import { GET as getTeams } from "~/app/api/admin/guard/teams/route";
import { GET as getEmails } from "~/app/api/admin/guard/teams/[id]/emails/route";
import { POST as postAction } from "~/app/api/admin/guard/teams/[id]/actions/route";
import {
  GuardConflictError,
  GuardForbiddenError,
  GuardNotFoundError,
} from "~/server/service/guard-service";

const TOKEN = "t".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
const ctx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
});
const get = (path: string, headers: Record<string, string> = auth) =>
  new Request(`http://localhost${path}`, { headers });
const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mockEnv.ADMIN_API_TOKEN = TOKEN;
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
    mock.mockResolvedValue({ ok: true, items: [] });
  }
});

describe("Guard admin API", () => {
  it("doesn't exist without an admin token, and refuses a wrong one", async () => {
    mockEnv.ADMIN_API_TOKEN = undefined;
    expect(
      (await getCampaigns(get("/api/admin/guard/campaigns"), ctx())).status,
    ).toBe(404);

    mockEnv.ADMIN_API_TOKEN = TOKEN;
    expect(
      (
        await getCampaigns(
          get("/api/admin/guard/campaigns", { authorization: "Bearer nope" }),
          ctx(),
        )
      ).status,
    ).toBe(401);
    expect(mocks.listActiveCampaigns).not.toHaveBeenCalled();
  });

  it("lists pending applications by default", async () => {
    const response = await getApplications(
      get("/api/admin/guard/applications?limit=5"),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(mocks.listApplications).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING", limit: 5 }),
    );
  });

  it("saves the Guard's advice on an application", async () => {
    const response = await postVerdict(
      post("/api/admin/guard/applications/app_1/verdict", {
        verdict: "approve",
        note: "Real SaaS, transactional only.",
      }),
      ctx({ id: "app_1" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.recordApplicationVerdict).toHaveBeenCalledWith("app_1", {
      verdict: "approve",
      note: "Real SaaS, transactional only.",
    });

    const bad = await postVerdict(
      post("/api/admin/guard/applications/app_1/verdict", {
        verdict: "yes",
        note: "x",
      }),
      ctx({ id: "app_1" }),
    );
    expect(bad.status).toBe(400);
  });

  it("says when the application was already decided", async () => {
    mocks.recordApplicationVerdict.mockRejectedValue(
      new GuardConflictError("Application was already decided"),
    );
    const response = await postVerdict(
      post("/api/admin/guard/applications/app_1/verdict", {
        verdict: "reject",
        note: "x",
      }),
      ctx({ id: "app_1" }),
    );
    expect(response.status).toBe(409);
  });

  it("lists new teams for 14 days by default", async () => {
    await getTeams(get("/api/admin/guard/teams"), ctx());
    expect(mocks.listWatchedTeams).toHaveBeenCalledWith({
      days: 14,
      limit: 100,
    });
  });

  it("pages campaigns", async () => {
    await getCampaigns(
      get("/api/admin/guard/campaigns?limit=10&cursor=c9"),
      ctx(),
    );
    expect(mocks.markGuardSeen).toHaveBeenCalled();
    expect(mocks.listActiveCampaigns).toHaveBeenCalledWith({
      limit: 10,
      cursor: "c9",
    });
  });

  it("needs the reviewed content fingerprint to approve", async () => {
    const missing = await postReview(
      post("/api/admin/guard/campaigns/cmp_1/review", {
        decision: "approve",
        reason: "ok",
      }),
      ctx({ id: "cmp_1" }),
    );
    expect(missing.status).toBe(400);

    const ok = await postReview(
      post("/api/admin/guard/campaigns/cmp_1/review", {
        decision: "approve",
        reason: "ok",
        contentHash: "abc123",
      }),
      ctx({ id: "cmp_1" }),
    );
    expect(ok.status).toBe(200);
    expect(mocks.guardReviewCampaign).toHaveBeenCalledWith("cmp_1", {
      decision: "approve",
      reason: "ok",
      contentHash: "abc123",
    });
  });

  it("answers 403 when the Guard may not act on that team", async () => {
    mocks.recordTeamAction.mockRejectedValueOnce(
      new GuardForbiddenError("first 14 days"),
    );
    const response = await postAction(
      post("/api/admin/guard/teams/7/actions", {
        action: "PAUSE",
        reason: "x",
      }),
      ctx({ id: "7" }),
    );
    expect(response.status).toBe(403);
  });

  it("reviews a campaign", async () => {
    const response = await postReview(
      post("/api/admin/guard/campaigns/cmp_1/review", {
        decision: "stop",
        reason: "bought list",
      }),
      ctx({ id: "cmp_1" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.guardReviewCampaign).toHaveBeenCalledWith("cmp_1", {
      decision: "stop",
      reason: "bought list",
    });
  });

  it("rejects an unknown decision or a missing reason", async () => {
    const bad = await postReview(
      post("/api/admin/guard/campaigns/cmp_1/review", { decision: "delete" }),
      ctx({ id: "cmp_1" }),
    );
    expect(bad.status).toBe(400);
    expect(mocks.guardReviewCampaign).not.toHaveBeenCalled();
  });

  it("answers 404 and 409 for missing or non-sending campaigns", async () => {
    mocks.guardReviewCampaign.mockRejectedValueOnce(
      new GuardNotFoundError("Campaign not found"),
    );
    const missing = await postReview(
      post("/api/admin/guard/campaigns/x/review", {
        decision: "approve",
        reason: "ok",
        contentHash: "abc",
      }),
      ctx({ id: "x" }),
    );
    expect(missing.status).toBe(404);

    mocks.guardReviewCampaign.mockRejectedValueOnce(
      new GuardConflictError("Campaign is sent, not sending"),
    );
    const conflict = await postReview(
      post("/api/admin/guard/campaigns/x/review", {
        decision: "stop",
        reason: "spam",
      }),
      ctx({ id: "x" }),
    );
    expect(conflict.status).toBe(409);
  });

  it("can alert on or pause a team, but never block it", async () => {
    const pause = await postAction(
      post("/api/admin/guard/teams/7/actions", {
        action: "PAUSE",
        reason: "phishing",
      }),
      ctx({ id: "7" }),
    );
    expect(pause.status).toBe(200);
    expect(mocks.recordTeamAction).toHaveBeenCalledWith(7, {
      action: "PAUSE",
      reason: "phishing",
    });

    const block = await postAction(
      post("/api/admin/guard/teams/7/actions", {
        action: "BLOCK",
        reason: "x",
      }),
      ctx({ id: "7" }),
    );
    expect(block.status).toBe(400);
    expect(mocks.recordTeamAction).toHaveBeenCalledTimes(1);
  });

  it("rejects a bad team id", async () => {
    const response = await getEmails(
      get("/api/admin/guard/teams/abc/emails"),
      ctx({ id: "abc" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.sampleTeamEmails).not.toHaveBeenCalled();
  });

  it("samples a team's emails", async () => {
    await getEmails(
      get("/api/admin/guard/teams/7/emails?limit=10"),
      ctx({ id: "7" }),
    );
    expect(mocks.sampleTeamEmails).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ limit: 10 }),
    );
  });
});
