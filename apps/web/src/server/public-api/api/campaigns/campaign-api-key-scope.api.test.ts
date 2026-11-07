import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTeamFromToken, mockRedis, mockDb, mockCampaignService, mockDomainService } =
  vi.hoisted(() => ({
    mockGetTeamFromToken: vi.fn(),
    mockRedis: {
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
    },
    mockDb: {
      campaign: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    },
    mockCampaignService: {
      getCampaignForTeam: vi.fn(),
      pauseCampaign: vi.fn(),
      resumeCampaign: vi.fn(),
      deleteCampaign: vi.fn(),
      scheduleCampaign: vi.fn(),
    },
    mockDomainService: {
      createDomain: vi.fn(),
    },
  }));

vi.mock("~/server/public-api/auth", () => ({
  getTeamFromToken: mockGetTeamFromToken,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

vi.mock("~/server/service/campaign-service", () => mockCampaignService);

vi.mock("~/server/service/domain-service", () => mockDomainService);

import { getApp } from "~/server/public-api/hono";
import getCampaign from "~/server/public-api/api/campaigns/get-campaign";
import getCampaigns from "~/server/public-api/api/campaigns/get-campaigns";
import pauseCampaignHandle from "~/server/public-api/api/campaigns/pause-campaign";
import deleteCampaignHandle from "~/server/public-api/api/campaigns/delete-campaign";
import createDomain from "~/server/public-api/api/domains/create-domain";

function setKeyDomain(domainId: number | null) {
  mockGetTeamFromToken.mockResolvedValue({
    id: 1,
    apiRateLimit: 20,
    apiKeyId: 11,
    apiKey: { domainId },
  });
}

function request(path: string, init: RequestInit = {}) {
  const app = getApp();
  getCampaign(app);
  getCampaigns(app);
  pauseCampaignHandle(app);
  deleteCampaignHandle(app);
  createDomain(app);
  return app.request(`http://localhost/api${path}`, {
    ...init,
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe("campaign routes honour domain-restricted API keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(1);
    mockDb.campaign.findMany.mockResolvedValue([]);
    mockDb.campaign.count.mockResolvedValue(0);
    mockCampaignService.pauseCampaign.mockResolvedValue({ ok: true });
  });

  it("hides a campaign from another domain", async () => {
    setKeyDomain(5);
    mockDb.campaign.findFirst.mockResolvedValue(null);

    const response = await request("/v1/campaigns/camp_other_domain");

    expect(response.status).toBe(404);
    expect(mockDb.campaign.findFirst).toHaveBeenCalledWith({
      where: { id: "camp_other_domain", teamId: 1, domainId: 5 },
      select: { id: true },
    });
    expect(mockCampaignService.getCampaignForTeam).not.toHaveBeenCalled();
  });

  it("does not pause or delete a campaign from another domain", async () => {
    setKeyDomain(5);
    mockDb.campaign.findFirst.mockResolvedValue(null);

    const pause = await request("/v1/campaigns/camp_other_domain/pause", {
      method: "POST",
    });
    const del = await request("/v1/campaigns/camp_other_domain", {
      method: "DELETE",
    });

    expect(pause.status).toBe(404);
    expect(del.status).toBe(404);
    expect(mockCampaignService.pauseCampaign).not.toHaveBeenCalled();
    expect(mockCampaignService.deleteCampaign).not.toHaveBeenCalled();
  });

  it("allows campaigns on the key's own domain", async () => {
    setKeyDomain(5);
    mockDb.campaign.findFirst.mockResolvedValue({ id: "camp_mine" });

    const response = await request("/v1/campaigns/camp_mine/pause", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mockCampaignService.pauseCampaign).toHaveBeenCalledWith({
      campaignId: "camp_mine",
      teamId: 1,
    });
  });

  it("skips the extra check for unrestricted keys", async () => {
    setKeyDomain(null);

    const response = await request("/v1/campaigns/camp_any/pause", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mockDb.campaign.findFirst).not.toHaveBeenCalled();
  });

  it("only lists campaigns from the key's domain", async () => {
    setKeyDomain(5);

    const response = await request("/v1/campaigns");

    expect(response.status).toBe(200);
    expect(mockDb.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: 1, domainId: 5 }),
      }),
    );
  });

  it("lists all team campaigns for unrestricted keys", async () => {
    setKeyDomain(null);

    await request("/v1/campaigns");

    const where = mockDb.campaign.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ teamId: 1 });
    expect(where).not.toHaveProperty("domainId");
  });

  it("does not let a restricted key create domains", async () => {
    setKeyDomain(5);

    const response = await request("/v1/domains", {
      method: "POST",
      body: JSON.stringify({ name: "other.com", region: "us-east-1" }),
    });

    expect(response.status).toBe(403);
    expect(mockDomainService.createDomain).not.toHaveBeenCalled();
  });
});
